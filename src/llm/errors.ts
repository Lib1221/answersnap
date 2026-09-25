import type { StreamEvent } from './types';

export type LlmErrorKind =
  | 'auth'
  | 'rate_limit'
  | 'overloaded'
  | 'server'
  | 'bad_request'
  | 'image_too_large'
  | 'network'
  | 'aborted'
  | 'no_key';

export class LlmError extends Error {
  constructor(
    readonly kind: LlmErrorKind,
    message: string,
    readonly status?: number,
    /** Seconds to wait, when the API said so. */
    readonly retryAfter?: number,
  ) {
    super(redactKeys(message));
    this.name = 'LlmError';
  }
}

/** Never let an API key reach a log or an error message (hard rule 8). */
export function redactKeys(text: string): string {
  return text
    .replace(/sk-ant-[A-Za-z0-9_-]+/g, 'sk-ant-[redacted]')
    .replace(/AIza[0-9A-Za-z_-]{20,}/g, 'AIza[redacted]')
    .replace(/([?&]key=)[^&\s]+/g, '$1[redacted]');
}

export function isAbort(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError';
}

// Retry policy (spec 11.2):
// - 429: wait for retry-after (cap 20 s), retry once.
// - 500 / 529 / overloaded: back off 1 s, 2 s, 4 s (three retries), only if no text streamed.
// - Network error: retry once.
// - 401 and 400: never.
const RETRY_AFTER_CAP_S = 20;
const BACKOFF_MS = [1000, 2000, 4000];

export interface RetryState {
  rateLimitRetries: number;
  serverRetries: number;
  networkRetries: number;
}

export function nextRetry(
  err: LlmError,
  state: RetryState,
  textStreamed: boolean,
): Extract<StreamEvent, { kind: 'retry' }> | null {
  if (textStreamed) return null;
  if (err.kind === 'rate_limit' && state.rateLimitRetries < 1) {
    state.rateLimitRetries++;
    const wait = Math.min(err.retryAfter ?? 5, RETRY_AFTER_CAP_S) * 1000;
    return { kind: 'retry', reason: 'rate_limit', waitMs: wait, attempt: state.rateLimitRetries };
  }
  if (
    (err.kind === 'overloaded' || err.kind === 'server') &&
    state.serverRetries < BACKOFF_MS.length
  ) {
    const wait = BACKOFF_MS[state.serverRetries]!;
    state.serverRetries++;
    return { kind: 'retry', reason: 'overloaded', waitMs: wait, attempt: state.serverRetries };
  }
  if (err.kind === 'network' && state.networkRetries < 1) {
    state.networkRetries++;
    return { kind: 'retry', reason: 'network', waitMs: 500, attempt: 1 };
  }
  return null;
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException('Aborted', 'AbortError'));
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(t);
        reject(new DOMException('Aborted', 'AbortError'));
      },
      { once: true },
    );
  });
}

/**
 * Run `attempt` with the retry policy. `attempt` reports whether any text has streamed
 * through `streamed()` so retries never duplicate visible output.
 */
export async function withRetries<T>(
  attempt: () => Promise<T>,
  opts: {
    signal?: AbortSignal;
    streamed?: () => boolean;
    onRetry?: (e: Extract<StreamEvent, { kind: 'retry' }>) => void;
  },
): Promise<T> {
  const state: RetryState = { rateLimitRetries: 0, serverRetries: 0, networkRetries: 0 };
  for (;;) {
    try {
      return await attempt();
    } catch (err) {
      if (isAbort(err) || opts.signal?.aborted) throw new LlmError('aborted', 'Stopped.');
      // A dropped connection mid-stream surfaces as a TypeError from the body reader.
      const e =
        err instanceof LlmError
          ? err
          : err instanceof TypeError
            ? new LlmError('network', "Can't reach the AI service. Check your connection.")
            : null;
      if (!e) throw err;
      const retry = nextRetry(e, state, opts.streamed?.() ?? false);
      if (!retry) throw e;
      opts.onRetry?.(retry);
      await sleep(retry.waitMs, opts.signal);
    }
  }
}

/** Wrap fetch so network failures become LlmError('network'). */
export async function fetchOrThrow(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (err) {
    if (isAbort(err)) throw err;
    throw new LlmError('network', "Can't reach the AI service. Check your connection.");
  }
}
