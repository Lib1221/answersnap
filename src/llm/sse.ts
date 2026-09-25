import { LlmError } from './errors';

/** A stream that goes quiet this long is treated as a dropped connection. */
export const STREAM_IDLE_TIMEOUT_MS = 60_000;

// Incremental Server-Sent Events parser (spec 11.2). Handles events split across chunks,
// CRLF line endings, comments, and multi-line data fields.

export interface SseEvent {
  event?: string;
  data: string;
}

export class SseParser {
  private buffer = '';

  /** Feed a decoded chunk; returns the events completed by it. */
  push(chunk: string): SseEvent[] {
    this.buffer += chunk.replace(/\r\n?/g, '\n');
    const events: SseEvent[] = [];
    let idx: number;
    while ((idx = this.buffer.indexOf('\n\n')) !== -1) {
      const raw = this.buffer.slice(0, idx);
      this.buffer = this.buffer.slice(idx + 2);
      const event = parseBlock(raw);
      if (event) events.push(event);
    }
    return events;
  }

  /** Flush a final event that wasn't followed by a blank line. */
  end(): SseEvent[] {
    const rest = this.buffer;
    this.buffer = '';
    const event = rest.trim() ? parseBlock(rest) : null;
    return event ? [event] : [];
  }
}

function parseBlock(block: string): SseEvent | null {
  let event: string | undefined;
  const data: string[] = [];
  for (const line of block.split('\n')) {
    if (!line || line.startsWith(':')) continue;
    const colon = line.indexOf(':');
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? '' : line.slice(colon + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    if (field === 'event') event = value;
    else if (field === 'data') data.push(value);
  }
  if (data.length === 0 && event === undefined) return null;
  return { event, data: data.join('\n') };
}

/** Read a fetch body as SSE events. */
export async function* readSse(
  body: ReadableStream<Uint8Array>,
  signal?: AbortSignal,
  idleMs = STREAM_IDLE_TIMEOUT_MS,
): AsyncGenerator<SseEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const parser = new SseParser();
  const onAbort = () => void reader.cancel().catch(() => undefined);
  signal?.addEventListener('abort', onAbort, { once: true });
  try {
    for (;;) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      let idle = false;
      const quiet = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          idle = true;
          reject(new LlmError('network', 'The AI service stopped responding.'));
          void reader.cancel().catch(() => undefined);
        }, idleMs);
      });
      const { value, done } = await Promise.race([reader.read(), quiet]).finally(() =>
        clearTimeout(timer),
      );
      // Cancelling ends the read "normally"; it must still count as a dropped stream.
      if (idle) throw new LlmError('network', 'The AI service stopped responding.');
      if (done) break;
      yield* parser.push(decoder.decode(value, { stream: true }));
    }
    yield* parser.push(decoder.decode());
    yield* parser.end();
  } finally {
    signal?.removeEventListener('abort', onAbort);
    reader.releaseLock();
  }
}
