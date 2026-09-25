import { quirksFor } from '@/config/models';
import { fetchOrThrow, LlmError, withRetries } from './errors';
import { readSse } from './sse';
import {
  EMPTY_USAGE,
  type AnswerRequest,
  type ChatMessage,
  type CompleteRequest,
  type CompleteResult,
  type LlmProvider,
  type ModelListing,
  type StreamEvent,
  type StreamResult,
  type SystemBlock,
  type Usage,
} from './types';

export const ANTHROPIC_BASE_URL = 'https://api.anthropic.com';
const API_VERSION = '2023-06-01';

interface WireUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
}

function toUsage(u: WireUsage | undefined, prev: Usage = EMPTY_USAGE): Usage {
  if (!u) return prev;
  return {
    inputTokens: u.input_tokens ?? prev.inputTokens,
    cacheWriteTokens: u.cache_creation_input_tokens ?? prev.cacheWriteTokens,
    cacheReadTokens: u.cache_read_input_tokens ?? prev.cacheReadTokens,
    outputTokens: u.output_tokens ?? prev.outputTokens,
  };
}

export function systemToWire(system: SystemBlock[]) {
  return system.map((b) => ({
    type: 'text' as const,
    text: b.text,
    ...(b.cache ? { cache_control: { type: 'ephemeral' as const } } : {}),
  }));
}

export function messagesToWire(messages: ChatMessage[]) {
  return messages.map((m) => ({
    role: m.role,
    content: m.content.map((p) =>
      p.type === 'text'
        ? { type: 'text' as const, text: p.text }
        : {
            type: 'image' as const,
            source: { type: 'base64' as const, media_type: p.mediaType, data: p.data },
          },
    ),
  }));
}

/**
 * Build a Messages API body. Never sends temperature, top_p, or top_k (newer models reject
 * non-default values). Thinking and effort follow per-model quirks.
 */
export function buildBody(req: AnswerRequest, opts: { stream: boolean }): Record<string, unknown> {
  const q = quirksFor(req.model);
  const body: Record<string, unknown> = {
    model: req.model,
    max_tokens: req.maxTokens === 0 ? 0 : Math.max(req.maxTokens, q.minMaxTokens ?? 0),
    system: systemToWire(req.system),
    messages: messagesToWire(req.messages),
  };
  if (opts.stream) body.stream = true;
  if (q.thinking) body.thinking = q.thinking;
  if (q.effort) body.output_config = { effort: q.effort };
  return body;
}

function textOf(content: { type: string; text?: string }[] | undefined): string {
  return (content ?? [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text ?? '')
    .join('');
}

async function errorFromResponse(res: Response): Promise<LlmError> {
  let message = `The AI service returned ${res.status}.`;
  let type = '';
  try {
    const json = (await res.json()) as { error?: { type?: string; message?: string } };
    type = json.error?.type ?? '';
    if (json.error?.message) message = json.error.message;
  } catch {
    // Non-JSON error body; keep the generic message.
  }
  const retryAfter = Number(res.headers.get('retry-after')) || undefined;
  if (res.status === 401 || res.status === 403) {
    return new LlmError('auth', 'The API key was rejected. Check it in Settings.', res.status);
  }
  if (res.status === 429) return new LlmError('rate_limit', message, 429, retryAfter);
  if (res.status === 529 || type === 'overloaded_error')
    return new LlmError('overloaded', message, res.status);
  if (res.status >= 500) return new LlmError('server', message, res.status);
  if (
    res.status === 400 &&
    /image/i.test(message) &&
    /(size|dimension|large|exceed)/i.test(message)
  ) {
    return new LlmError('image_too_large', message, 400);
  }
  return new LlmError('bad_request', message, res.status);
}

interface StreamPayload {
  type?: string;
  message?: { usage?: WireUsage };
  delta?: { type?: string; text?: string; stop_reason?: string | null };
  usage?: WireUsage;
  error?: { type?: string; message?: string };
}

export class AnthropicProvider implements LlmProvider {
  constructor(
    private readonly apiKey: string,
    private readonly baseUrl: string = ANTHROPIC_BASE_URL,
  ) {}

  private headers(): Record<string, string> {
    return {
      'x-api-key': this.apiKey,
      'anthropic-version': API_VERSION,
      'content-type': 'application/json',
      // Required for calls from browser contexts, including extension pages (BYO key).
      'anthropic-dangerous-direct-browser-access': 'true',
    };
  }

  async listModels(): Promise<ModelListing[]> {
    const res = await fetchOrThrow(`${this.baseUrl}/v1/models?limit=100`, {
      headers: this.headers(),
    });
    if (!res.ok) throw await errorFromResponse(res);
    const json = (await res.json()) as { data?: { id: string; display_name?: string }[] };
    return (json.data ?? []).map((m) => ({ id: m.id, displayName: m.display_name ?? m.id }));
  }

  async stream(
    req: AnswerRequest,
    signal: AbortSignal,
    onEvent: (e: StreamEvent) => void,
  ): Promise<StreamResult> {
    let text = '';
    return withRetries(
      async () => {
        text = '';
        let usage = EMPTY_USAGE;
        let stopReason = 'unknown';
        const res = await fetchOrThrow(`${this.baseUrl}/v1/messages`, {
          method: 'POST',
          headers: this.headers(),
          body: JSON.stringify(buildBody(req, { stream: true })),
          signal,
        });
        if (!res.ok || !res.body) throw await errorFromResponse(res);

        for await (const ev of readSse(res.body, signal)) {
          if (ev.event === 'ping' || !ev.data) continue;
          const data = JSON.parse(ev.data) as StreamPayload;
          switch (data.type ?? ev.event) {
            case 'message_start':
              usage = toUsage(data.message?.usage, usage);
              onEvent({ kind: 'usage', usage });
              break;
            case 'content_block_delta':
              // Only visible text. Thinking and signature deltas are ignored.
              if (data.delta?.type === 'text_delta' && data.delta.text) {
                text += data.delta.text;
                onEvent({ kind: 'text', delta: data.delta.text });
              }
              break;
            case 'message_delta':
              if (data.delta?.stop_reason) stopReason = data.delta.stop_reason;
              usage = toUsage(data.usage, usage);
              onEvent({ kind: 'usage', usage });
              break;
            case 'error': {
              const type = data.error?.type ?? '';
              const msg = data.error?.message ?? 'The AI service reported an error.';
              throw new LlmError(type === 'overloaded_error' ? 'overloaded' : 'server', msg);
            }
          }
        }
        signal.throwIfAborted();
        onEvent({ kind: 'stop', reason: stopReason });
        return { text, stopReason, usage };
      },
      { signal, streamed: () => text.length > 0, onRetry: onEvent },
    );
  }

  private async post(body: Record<string, unknown>, signal?: AbortSignal) {
    const res = await fetchOrThrow(`${this.baseUrl}/v1/messages`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(body),
      signal,
    });
    if (!res.ok) throw await errorFromResponse(res);
    return (await res.json()) as {
      content?: { type: string; text?: string; input?: unknown }[];
      stop_reason?: string;
      usage?: WireUsage;
    };
  }

  /**
   * Not streamed. With a JSON schema, uses structured outputs (`output_config.format`); if the
   * model rejects that with a 400, retries once with tool use (spec 10.3). Forced tool_choice
   * is itself a 400 on some models, which get `auto` plus an instruction instead.
   */
  async complete(req: CompleteRequest, signal?: AbortSignal): Promise<CompleteResult> {
    return withRetries(
      async () => {
        const body = buildBody(req, { stream: false });
        if (!req.jsonSchema) {
          const json = await this.post(body, signal);
          return {
            text: textOf(json.content),
            stopReason: json.stop_reason ?? 'unknown',
            usage: toUsage(json.usage),
          };
        }
        try {
          const json = await this.post(
            {
              ...body,
              output_config: {
                ...(body.output_config as object | undefined),
                format: { type: 'json_schema', schema: req.jsonSchema },
              },
            },
            signal,
          );
          const text = textOf(json.content);
          return {
            text,
            json: JSON.parse(text),
            stopReason: json.stop_reason ?? 'unknown',
            usage: toUsage(json.usage),
          };
        } catch (err) {
          if (!(err instanceof LlmError) || err.kind !== 'bad_request') throw err;
          return this.completeWithTool(req, body, signal);
        }
      },
      { signal },
    );
  }

  private async completeWithTool(
    req: CompleteRequest,
    body: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<CompleteResult> {
    const name = req.schemaName ?? 'save_result';
    const forced = !quirksFor(req.model).noForcedToolChoice;
    const system = body.system as { type: 'text'; text: string }[];
    const json = await this.post(
      {
        ...body,
        system: forced
          ? system
          : [...system, { type: 'text', text: `Call the ${name} tool with the result.` }],
        tools: [
          {
            name,
            description: 'Save the extracted result.',
            input_schema: req.jsonSchema,
            strict: true,
          },
        ],
        tool_choice: forced ? { type: 'tool', name } : { type: 'auto' },
      },
      signal,
    );
    const call = json.content?.find((b) => b.type === 'tool_use');
    if (!call)
      throw new LlmError('bad_request', 'The model did not return structured data. Try again.');
    return {
      text: JSON.stringify(call.input),
      json: call.input,
      stopReason: json.stop_reason ?? 'unknown',
      usage: toUsage(json.usage),
    };
  }

  /** max_tokens 0 writes the cache and returns immediately (can't be streamed). */
  async prewarm(system: SystemBlock[], model: string): Promise<Usage | null> {
    const body = buildBody(
      {
        model,
        maxTokens: 0,
        system,
        messages: [{ role: 'user', content: [{ type: 'text', text: 'warmup' }] }],
      },
      { stream: false },
    );
    const res = await fetchOrThrow(`${this.baseUrl}/v1/messages`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(body),
    });
    if (!res.ok) throw await errorFromResponse(res);
    const json = (await res.json()) as { usage?: WireUsage };
    return toUsage(json.usage);
  }
}
