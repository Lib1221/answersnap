import { quirksFor } from '@/config/models';
import {
  COMPLETE_RESPONSE_TIMEOUT_MS,
  fetchOrThrow,
  LlmError,
  withRetries,
  type QuotaScope,
} from './errors';
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
  type Usage,
} from './types';

// Google Gemini API (generateContent). Works with a free-tier key from AI Studio. The API
// allows CORS from extension origins, so no host permission is needed.

export const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com';

interface WireUsage {
  promptTokenCount?: number;
  cachedContentTokenCount?: number;
  candidatesTokenCount?: number;
  thoughtsTokenCount?: number;
}

function toUsage(u: WireUsage | undefined, prev: Usage = EMPTY_USAGE): Usage {
  if (!u) return prev;
  const cached = u.cachedContentTokenCount ?? 0;
  return {
    inputTokens: Math.max(0, (u.promptTokenCount ?? 0) - cached),
    cacheWriteTokens: 0,
    cacheReadTokens: cached,
    // Thinking tokens are billed as output.
    outputTokens: (u.candidatesTokenCount ?? 0) + (u.thoughtsTokenCount ?? 0),
  };
}

const STOP_REASONS: Record<string, string> = {
  STOP: 'end_turn',
  MAX_TOKENS: 'max_tokens',
  SAFETY: 'refusal',
  RECITATION: 'refusal',
  PROHIBITED_CONTENT: 'refusal',
  BLOCKLIST: 'refusal',
};

function contentsToWire(messages: ChatMessage[]) {
  return messages.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: m.content.map((p) =>
      p.type === 'text'
        ? { text: p.text }
        : { inlineData: { mimeType: p.mediaType, data: p.data } },
    ),
  }));
}

/**
 * Gemini has one system instruction; the blocks keep their order so the stable prefix stays
 * stable (Gemini caches repeated prefixes implicitly). No temperature/topP/topK.
 */
export function buildGeminiBody(req: AnswerRequest | CompleteRequest): Record<string, unknown> {
  const q = quirksFor(req.model);
  const generationConfig: Record<string, unknown> = {
    maxOutputTokens: Math.max(req.maxTokens, q.minMaxTokens ?? 0),
  };
  if (q.geminiThinkingLevel)
    generationConfig.thinkingConfig = { thinkingLevel: q.geminiThinkingLevel };
  if ('jsonSchema' in req && req.jsonSchema) {
    generationConfig.responseMimeType = 'application/json';
    generationConfig.responseJsonSchema = req.jsonSchema;
  }
  return {
    systemInstruction: { parts: req.system.map((b) => ({ text: b.text })) },
    contents: contentsToWire(req.messages),
    generationConfig,
  };
}

function retryDelaySeconds(details: unknown): number | undefined {
  if (!Array.isArray(details)) return undefined;
  for (const d of details as { '@type'?: string; retryDelay?: string }[]) {
    if (d['@type']?.endsWith('RetryInfo') && d.retryDelay) {
      const s = parseFloat(d.retryDelay);
      if (Number.isFinite(s)) return s;
    }
  }
  return undefined;
}

/** "…PerDay…" or "…PerMinute…" from a QuotaFailure violation's quotaId. */
export function quotaScope(details: unknown): QuotaScope | undefined {
  if (!Array.isArray(details)) return undefined;
  for (const d of details as { '@type'?: string; violations?: { quotaId?: string }[] }[]) {
    if (!d['@type']?.endsWith('QuotaFailure')) continue;
    const ids = (d.violations ?? []).map((v) => v.quotaId ?? '');
    if (ids.some((id) => /PerDay/i.test(id))) return 'day';
    if (ids.some((id) => /PerMinute/i.test(id))) return 'minute';
  }
  return undefined;
}

async function errorFromResponse(res: Response): Promise<LlmError> {
  let message = `The AI service returned ${res.status}.`;
  let status = '';
  let details: unknown;
  try {
    const json = (await res.json()) as {
      error?: { message?: string; status?: string; details?: unknown };
    };
    if (json.error?.message) message = json.error.message;
    status = json.error?.status ?? '';
    details = json.error?.details;
  } catch {
    // Non-JSON error body.
  }
  const reasons = JSON.stringify(details ?? '');
  // An invalid Gemini key comes back as 400 INVALID_ARGUMENT with reason API_KEY_INVALID.
  if (
    res.status === 401 ||
    res.status === 403 ||
    /API_KEY_INVALID|API key not valid/i.test(reasons + message)
  ) {
    return new LlmError('auth', 'The API key was rejected. Check it in Settings.', res.status);
  }
  if (res.status === 429 || status === 'RESOURCE_EXHAUSTED') {
    return new LlmError(
      'rate_limit',
      message,
      429,
      retryDelaySeconds(details),
      quotaScope(details),
    );
  }
  if (res.status === 503 || status === 'UNAVAILABLE')
    return new LlmError('overloaded', message, res.status);
  if (res.status >= 500) return new LlmError('server', message, res.status);
  return new LlmError('bad_request', message, res.status);
}

interface Chunk {
  candidates?: {
    content?: { parts?: { text?: string; thought?: boolean }[] };
    finishReason?: string;
  }[];
  usageMetadata?: WireUsage;
  promptFeedback?: { blockReason?: string };
  error?: { message?: string; status?: string };
}

export class GeminiProvider implements LlmProvider {
  constructor(
    private readonly apiKey: string,
    private readonly baseUrl: string = GEMINI_BASE_URL,
  ) {}

  private headers(): Record<string, string> {
    // Header, not ?key=, so the key never lands in a URL.
    return { 'x-goog-api-key': this.apiKey, 'content-type': 'application/json' };
  }

  private url(model: string, method: 'generateContent' | 'streamGenerateContent'): string {
    const suffix = method === 'streamGenerateContent' ? '?alt=sse' : '';
    return `${this.baseUrl}/v1beta/models/${encodeURIComponent(model)}:${method}${suffix}`;
  }

  async listModels(): Promise<ModelListing[]> {
    const res = await fetchOrThrow(`${this.baseUrl}/v1beta/models?pageSize=1000`, {
      headers: this.headers(),
    });
    if (!res.ok) throw await errorFromResponse(res);
    const json = (await res.json()) as {
      models?: { name: string; displayName?: string; supportedGenerationMethods?: string[] }[];
    };
    return (json.models ?? [])
      .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
      .map((m) => ({ id: m.name.replace(/^models\//, ''), displayName: m.displayName ?? m.name }))
      .filter(
        (m) =>
          m.id.startsWith('gemini-') &&
          !/(tts|image|live|embedding|transcribe|robotics|computer-use|omni|customtools)/.test(
            m.id,
          ),
      );
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
        const res = await fetchOrThrow(this.url(req.model, 'streamGenerateContent'), {
          method: 'POST',
          headers: this.headers(),
          body: JSON.stringify(buildGeminiBody(req)),
          signal,
        });
        if (!res.ok || !res.body) throw await errorFromResponse(res);

        for await (const ev of readSse(res.body, signal)) {
          if (!ev.data) continue;
          const chunk = JSON.parse(ev.data) as Chunk;
          if (chunk.error) {
            const kind = chunk.error.status === 'UNAVAILABLE' ? 'overloaded' : 'server';
            throw new LlmError(kind, chunk.error.message ?? 'The AI service reported an error.');
          }
          if (chunk.promptFeedback?.blockReason) stopReason = 'refusal';
          const candidate = chunk.candidates?.[0];
          for (const part of candidate?.content?.parts ?? []) {
            if (part.thought || !part.text) continue;
            text += part.text;
            onEvent({ kind: 'text', delta: part.text });
          }
          if (candidate?.finishReason)
            stopReason =
              STOP_REASONS[candidate.finishReason] ?? candidate.finishReason.toLowerCase();
          if (chunk.usageMetadata) {
            usage = toUsage(chunk.usageMetadata, usage);
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

  private async generate(body: Record<string, unknown>, model: string, signal?: AbortSignal) {
    const res = await fetchOrThrow(
      this.url(model, 'generateContent'),
      {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify(body),
        signal,
      },
      COMPLETE_RESPONSE_TIMEOUT_MS,
    );
    if (!res.ok) throw await errorFromResponse(res);
    const json = (await res.json()) as Chunk;
    const candidate = json.candidates?.[0];
    return {
      text: (candidate?.content?.parts ?? [])
        .filter((p) => !p.thought)
        .map((p) => p.text ?? '')
        .join(''),
      stopReason: STOP_REASONS[candidate?.finishReason ?? ''] ?? 'unknown',
      usage: toUsage(json.usageMetadata),
    };
  }

  /**
   * Not streamed. With a JSON schema, uses `responseJsonSchema`; if that's rejected with a 400,
   * retries once in plain JSON mode with the schema in the system instruction.
   */
  async complete(req: CompleteRequest, signal?: AbortSignal): Promise<CompleteResult> {
    return withRetries(
      async () => {
        const body = buildGeminiBody(req);
        if (!req.jsonSchema) return this.generate(body, req.model, signal);
        let result;
        try {
          result = await this.generate(body, req.model, signal);
        } catch (err) {
          if (!(err instanceof LlmError) || err.kind !== 'bad_request') throw err;
          const config = { ...(body.generationConfig as Record<string, unknown>) };
          delete config.responseJsonSchema;
          const system = body.systemInstruction as { parts: { text: string }[] };
          result = await this.generate(
            {
              ...body,
              systemInstruction: {
                parts: [
                  ...system.parts,
                  {
                    text: `Reply with JSON matching this schema:\n${JSON.stringify(req.jsonSchema)}`,
                  },
                ],
              },
              generationConfig: config,
            },
            req.model,
            signal,
          );
        }
        return { ...result, json: JSON.parse(result.text) };
      },
      { signal },
    );
  }

  /** Gemini caches repeated prefixes implicitly; there is nothing to pre-warm. */
  async prewarm(): Promise<Usage | null> {
    return null;
  }
}
