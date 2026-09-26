import { COMPLETE_RESPONSE_TIMEOUT_MS, fetchOrThrow, LlmError, withRetries } from './errors';
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

// OpenAI-compatible chat completions, used for OpenRouter and for Ollama running on the user's own
// computer. Both allow browser requests (Ollama when started with OLLAMA_ORIGINS set).

export const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
export const OLLAMA_DEFAULT_URL = 'http://localhost:11434';
/** Ollama runs on the user's computer and needs no key; this stands in for one. */
export const NO_KEY_NEEDED = 'no-key-needed';

interface WireUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  prompt_tokens_details?: { cached_tokens?: number };
}

export function toUsage(u: WireUsage | undefined): Usage {
  if (!u) return EMPTY_USAGE;
  const cached = u.prompt_tokens_details?.cached_tokens ?? 0;
  return {
    inputTokens: Math.max(0, (u.prompt_tokens ?? 0) - cached),
    cacheWriteTokens: 0,
    cacheReadTokens: cached,
    outputTokens: u.completion_tokens ?? 0,
  };
}

const STOP_REASONS: Record<string, string> = {
  stop: 'end_turn',
  length: 'max_tokens',
  content_filter: 'refusal',
};

function messagesToWire(system: SystemBlock[], messages: ChatMessage[]) {
  return [
    { role: 'system', content: system.map((b) => b.text).join('\n\n') },
    ...messages.map((m) => ({
      role: m.role,
      content:
        m.content.length === 1 && m.content[0]!.type === 'text'
          ? m.content[0]!.text
          : m.content.map((p) =>
              p.type === 'text'
                ? { type: 'text', text: p.text }
                : { type: 'image_url', image_url: { url: `data:${p.mediaType};base64,${p.data}` } },
            ),
    })),
  ];
}

export function buildChatBody(
  req: AnswerRequest | CompleteRequest,
  stream: boolean,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: req.model,
    max_tokens: req.maxTokens,
    messages: messagesToWire(req.system, req.messages),
  };
  if (stream) {
    body.stream = true;
    body.stream_options = { include_usage: true };
  }
  if ('jsonSchema' in req && req.jsonSchema) {
    body.response_format = {
      type: 'json_schema',
      json_schema: { name: req.schemaName ?? 'result', strict: true, schema: req.jsonSchema },
    };
  }
  return body;
}

async function errorFromResponse(res: Response, service: string): Promise<LlmError> {
  let message = `${service} returned ${res.status}.`;
  try {
    const json = (await res.json()) as { error?: { message?: string } | string };
    const m = typeof json.error === 'string' ? json.error : json.error?.message;
    if (m) message = m;
  } catch {
    // Non-JSON error body.
  }
  if (res.status === 401)
    return new LlmError('auth', 'The API key was rejected. Check it in Settings.', 401);
  if (res.status === 403) {
    return new LlmError(
      'auth',
      service === 'Ollama'
        ? 'Ollama refused the request. Start it with OLLAMA_ORIGINS=chrome-extension://* (see Settings).'
        : 'The API key was rejected. Check it in Settings.',
      403,
    );
  }
  if (res.status === 402)
    return new LlmError(
      'bad_request',
      `${service}: out of credits for this model. ${message}`,
      402,
    );
  if (res.status === 404 && service === 'Ollama')
    return new LlmError(
      'bad_request',
      `Ollama doesn't have that model. Run "ollama pull" first. ${message}`,
      404,
    );
  if (res.status === 429) {
    const after = Number(res.headers.get('retry-after'));
    return new LlmError(
      'rate_limit',
      message,
      429,
      Number.isFinite(after) && after > 0 ? after : undefined,
    );
  }
  if (res.status === 503 || res.status === 529)
    return new LlmError('overloaded', message, res.status);
  if (res.status >= 500) return new LlmError('server', message, res.status);
  return new LlmError('bad_request', message, res.status);
}

/** Pull JSON out of a reply that may wrap it in a code fence. */
export function parseJsonReply(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  return JSON.parse((fenced ? fenced[1]! : text).trim());
}

interface Chunk {
  choices?: {
    delta?: { content?: string | null };
    message?: { content?: string | null };
    finish_reason?: string | null;
  }[];
  usage?: WireUsage;
  error?: { message?: string; code?: number | string };
}

export class OpenAICompatProvider implements LlmProvider {
  constructor(
    private readonly apiKey: string,
    private readonly baseUrl: string,
    /** For error messages: "OpenRouter" or "Ollama". */
    private readonly service: 'OpenRouter' | 'Ollama',
  ) {}

  private headers(): Record<string, string> {
    const h: Record<string, string> = { 'content-type': 'application/json' };
    if (this.apiKey && this.apiKey !== NO_KEY_NEEDED) h.authorization = `Bearer ${this.apiKey}`;
    // OpenRouter shows the app name on its activity page.
    if (this.service === 'OpenRouter') h['x-title'] = 'AnswerSnap';
    return h;
  }

  async listModels(): Promise<ModelListing[]> {
    const res = await fetchOrThrow(`${this.baseUrl}/models`, { headers: this.headers() });
    if (!res.ok) throw await errorFromResponse(res, this.service);
    const json = (await res.json()) as { data?: { id: string; name?: string }[] };
    return (json.data ?? [])
      .map((m) => ({ id: m.id, displayName: m.name ?? m.id }))
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
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
        const res = await fetchOrThrow(`${this.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: this.headers(),
          body: JSON.stringify(buildChatBody(req, true)),
          signal,
        });
        if (!res.ok || !res.body) throw await errorFromResponse(res, this.service);
        for await (const ev of readSse(res.body, signal)) {
          if (!ev.data || ev.data === '[DONE]') continue;
          const chunk = JSON.parse(ev.data) as Chunk;
          if (chunk.error) {
            throw new LlmError(
              'server',
              chunk.error.message ?? `${this.service} reported an error.`,
            );
          }
          const choice = chunk.choices?.[0];
          const delta = choice?.delta?.content;
          if (delta) {
            text += delta;
            onEvent({ kind: 'text', delta });
          }
          if (choice?.finish_reason)
            stopReason = STOP_REASONS[choice.finish_reason] ?? choice.finish_reason;
          if (chunk.usage) {
            usage = toUsage(chunk.usage);
            onEvent({ kind: 'usage', usage });
          }
        }
        signal.throwIfAborted();
        onEvent({ kind: 'stop', reason: stopReason });
        return { text, stopReason, usage };
      },
      { signal, streamed: () => text.length > 0, onRetry: onEvent },
    );
  }

  private async chat(body: Record<string, unknown>, signal?: AbortSignal) {
    const res = await fetchOrThrow(
      `${this.baseUrl}/chat/completions`,
      { method: 'POST', headers: this.headers(), body: JSON.stringify(body), signal },
      COMPLETE_RESPONSE_TIMEOUT_MS,
    );
    if (!res.ok) throw await errorFromResponse(res, this.service);
    const json = (await res.json()) as Chunk;
    const choice = json.choices?.[0];
    return {
      text: choice?.message?.content ?? '',
      stopReason: STOP_REASONS[choice?.finish_reason ?? ''] ?? 'unknown',
      usage: toUsage(json.usage),
    };
  }

  /**
   * Not streamed. With a JSON schema, asks for `response_format: json_schema`; models that don't
   * support it get one retry with the schema in the system prompt instead.
   */
  async complete(req: CompleteRequest, signal?: AbortSignal): Promise<CompleteResult> {
    return withRetries(
      async () => {
        const body = buildChatBody(req, false);
        if (!req.jsonSchema) return this.chat(body, signal);
        let result;
        try {
          result = await this.chat(body, signal);
        } catch (err) {
          if (!(err instanceof LlmError) || err.kind !== 'bad_request' || err.status === 402)
            throw err;
          result = await this.chat(
            buildChatBody(
              {
                ...req,
                jsonSchema: undefined,
                system: [
                  ...req.system,
                  {
                    text: `Reply with only JSON matching this schema:\n${JSON.stringify(req.jsonSchema)}`,
                  },
                ],
              },
              false,
            ),
            signal,
          );
        }
        return { ...result, json: parseJsonReply(result.text) };
      },
      { signal },
    );
  }

  /** No explicit cache to warm. */
  async prewarm(): Promise<Usage | null> {
    return null;
  }
}
