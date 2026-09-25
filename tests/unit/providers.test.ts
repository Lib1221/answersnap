// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AnthropicProvider } from '@/llm/anthropic';
import { LlmError } from '@/llm/errors';
import { GeminiProvider } from '@/llm/gemini';
import type { AnswerRequest, StreamEvent } from '@/llm/types';

const req: AnswerRequest = {
  model: 'claude-sonnet-5',
  maxTokens: 1024,
  system: [{ text: 'rules' }, { text: 'profile', cache: true }],
  messages: [{ role: 'user', content: [{ type: 'text', text: 'Q' }] }],
};

function sse(chunks: string[], init: ResponseInit = {}) {
  const enc = new TextEncoder();
  const body = new ReadableStream({
    start(c) {
      for (const ch of chunks) c.enqueue(enc.encode(ch));
      c.close();
    },
  });
  return new Response(body, {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
    ...init,
  });
}

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });

const anthropicStream = (text: string[]) =>
  sse([
    'event: message_start\ndata: {"type":"message_start","message":{"usage":{"input_tokens":100,"cache_creation_input_tokens":0,"cache_read_input_tokens":800,"output_tokens":1}}}\n\n',
    'event: ping\ndata: {"type":"ping"}\n\n',
    'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"thinking_delta","thinking":""}}\n\n',
    ...text.map(
      (t) =>
        `event: content_block_delta\ndata: ${JSON.stringify({ type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text: t } })}\n\n`,
    ),
    'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":12}}\n\n',
    'event: message_stop\ndata: {"type":"message_stop"}\n\n',
  ]);

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

async function run(provider: AnthropicProvider | GeminiProvider, r = req) {
  const events: StreamEvent[] = [];
  const result = await provider.stream(r, new AbortController().signal, (e) => events.push(e));
  return { result, events };
}

describe('AnthropicProvider', () => {
  it('streams text, ignores thinking deltas, and reports usage', async () => {
    const fetchMock = vi.fn().mockResolvedValue(anthropicStream(['<answer>', '5', '</answer>']));
    vi.stubGlobal('fetch', fetchMock);
    const { result, events } = await run(new AnthropicProvider('sk-ant-test'));
    expect(result.text).toBe('<answer>5</answer>');
    expect(result.stopReason).toBe('end_turn');
    expect(result.usage).toEqual({
      inputTokens: 100,
      cacheWriteTokens: 0,
      cacheReadTokens: 800,
      outputTokens: 12,
    });
    expect(events.filter((e) => e.kind === 'text')).toHaveLength(3);

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect(init.headers).toMatchObject({
      'x-api-key': 'sk-ant-test',
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    });
    expect(JSON.parse(init.body).stream).toBe(true);
  });

  it('stops on 401 without retrying', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        json(401, {
          type: 'error',
          error: { type: 'authentication_error', message: 'invalid x-api-key' },
        }),
      );
    vi.stubGlobal('fetch', fetchMock);
    await expect(run(new AnthropicProvider('bad'))).rejects.toMatchObject({ kind: 'auth' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries a 429 once after retry-after', async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        json(
          429,
          { error: { type: 'rate_limit_error', message: 'slow down' } },
          { 'retry-after': '3' },
        ),
      )
      .mockResolvedValueOnce(anthropicStream(['ok']));
    vi.stubGlobal('fetch', fetchMock);
    const p = run(new AnthropicProvider('k'));
    await vi.advanceTimersByTimeAsync(3000);
    const { result, events } = await p;
    expect(result.text).toBe('ok');
    expect(events[0]).toEqual({ kind: 'retry', reason: 'rate_limit', waitMs: 3000, attempt: 1 });
  });

  it('caps retry-after at 20 seconds and gives up after one retry', async () => {
    vi.useFakeTimers();
    const limited = () => json(429, { error: { message: 'slow down' } }, { 'retry-after': '120' });
    const fetchMock = vi.fn().mockImplementation(async () => limited());
    vi.stubGlobal('fetch', fetchMock);
    const events: StreamEvent[] = [];
    const p = new AnthropicProvider('k').stream(req, new AbortController().signal, (e) =>
      events.push(e),
    );
    const assertion = expect(p).rejects.toMatchObject({ kind: 'rate_limit' });
    await vi.advanceTimersByTimeAsync(20_000);
    await assertion;
    expect(events[0]).toMatchObject({ waitMs: 20_000 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('backs off 1 s, 2 s, 4 s on 529 before giving up', async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockImplementation(async () =>
        json(529, { error: { type: 'overloaded_error', message: 'Overloaded' } }),
      );
    vi.stubGlobal('fetch', fetchMock);
    const events: StreamEvent[] = [];
    const p = new AnthropicProvider('k').stream(req, new AbortController().signal, (e) =>
      events.push(e),
    );
    const assertion = expect(p).rejects.toMatchObject({ kind: 'overloaded' });
    await vi.advanceTimersByTimeAsync(7000);
    await assertion;
    expect(events.map((e) => (e.kind === 'retry' ? e.waitMs : 0))).toEqual([1000, 2000, 4000]);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('does not retry once text has streamed', async () => {
    const broken = sse([
      'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hel"}}\n\n',
      'event: error\ndata: {"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}\n\n',
    ]);
    const fetchMock = vi.fn().mockResolvedValue(broken);
    vi.stubGlobal('fetch', fetchMock);
    await expect(run(new AnthropicProvider('k'))).rejects.toMatchObject({ kind: 'overloaded' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('maps an abort to a stopped error', async () => {
    const controller = new AbortController();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (_u, init: RequestInit) => {
        controller.abort();
        init.signal!.throwIfAborted();
      }),
    );
    await expect(
      new AnthropicProvider('k').stream(req, controller.signal, () => {}),
    ).rejects.toMatchObject({ kind: 'aborted' });
  });

  it('pre-warms with max_tokens 0 and no stream', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        json(200, {
          content: [],
          stop_reason: 'max_tokens',
          usage: { input_tokens: 5, cache_creation_input_tokens: 2000, output_tokens: 0 },
        }),
      );
    vi.stubGlobal('fetch', fetchMock);
    const usage = await new AnthropicProvider('k').prewarm(req.system, 'claude-sonnet-5');
    const body = JSON.parse(fetchMock.mock.calls[0]![1].body);
    expect(body.max_tokens).toBe(0);
    expect(body).not.toHaveProperty('stream');
    expect(usage?.cacheWriteTokens).toBe(2000);
  });

  it('never puts the key in error messages', () => {
    expect(new LlmError('bad_request', 'bad key sk-ant-abc123XYZ').message).toBe(
      'bad key sk-ant-[redacted]',
    );
    expect(
      new LlmError('bad_request', 'https://x/?key=AIzaSyA1234567890abcdefghij').message,
    ).not.toContain('AIzaSy');
  });
});

describe('GeminiProvider', () => {
  const greq = { ...req, model: 'gemini-3.8-flash' };
  const chunk = (o: unknown) => `data: ${JSON.stringify(o)}\n\n`;

  it('streams text, skips thoughts, and maps usage', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      sse([
        chunk({ candidates: [{ content: { parts: [{ text: 'thinking...', thought: true }] } }] }),
        chunk({ candidates: [{ content: { parts: [{ text: '<answer>5' }] } }] }),
        chunk({
          candidates: [{ content: { parts: [{ text: '</answer>' }] }, finishReason: 'STOP' }],
          usageMetadata: {
            promptTokenCount: 900,
            cachedContentTokenCount: 700,
            candidatesTokenCount: 10,
            thoughtsTokenCount: 30,
          },
        }),
      ]),
    );
    vi.stubGlobal('fetch', fetchMock);
    const { result } = await run(new GeminiProvider('AIza-test'), greq);
    expect(result.text).toBe('<answer>5</answer>');
    expect(result.stopReason).toBe('end_turn');
    expect(result.usage).toEqual({
      inputTokens: 200,
      cacheWriteTokens: 0,
      cacheReadTokens: 700,
      outputTokens: 40,
    });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:streamGenerateContent?alt=sse',
    );
    expect(init.headers['x-goog-api-key']).toBe('AIza-test');
    const body = JSON.parse(init.body);
    expect(body.systemInstruction.parts).toEqual([{ text: 'rules' }, { text: 'profile' }]);
    expect(body.contents[0]).toEqual({ role: 'user', parts: [{ text: 'Q' }] });
  });

  it('maps images and assistant turns', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        sse([
          chunk({ candidates: [{ content: { parts: [{ text: 'x' }] }, finishReason: 'STOP' }] }),
        ]),
      );
    vi.stubGlobal('fetch', fetchMock);
    await run(new GeminiProvider('k'), {
      ...greq,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', mediaType: 'image/png', data: 'AAAA' },
            { type: 'text', text: 'Q' },
          ],
        },
        { role: 'assistant', content: [{ type: 'text', text: 'A' }] },
        { role: 'user', content: [{ type: 'text', text: 'Shorter' }] },
      ],
    });
    const body = JSON.parse(fetchMock.mock.calls[0]![1].body);
    expect(body.contents.map((c: { role: string }) => c.role)).toEqual(['user', 'model', 'user']);
    expect(body.contents[0].parts[0]).toEqual({
      inlineData: { mimeType: 'image/png', data: 'AAAA' },
    });
  });

  it('treats API_KEY_INVALID as an auth error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        json(400, {
          error: {
            code: 400,
            message: 'API key not valid. Please pass a valid API key.',
            status: 'INVALID_ARGUMENT',
            details: [
              { '@type': 'type.googleapis.com/google.rpc.ErrorInfo', reason: 'API_KEY_INVALID' },
            ],
          },
        }),
      ),
    );
    await expect(run(new GeminiProvider('bad'), greq)).rejects.toMatchObject({ kind: 'auth' });
  });

  it('reads the retry delay from a free-tier 429', async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        json(429, {
          error: {
            status: 'RESOURCE_EXHAUSTED',
            message: 'Quota exceeded',
            details: [{ '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '7s' }],
          },
        }),
      )
      .mockResolvedValueOnce(
        sse([
          chunk({ candidates: [{ content: { parts: [{ text: 'ok' }] }, finishReason: 'STOP' }] }),
        ]),
      );
    vi.stubGlobal('fetch', fetchMock);
    const p = run(new GeminiProvider('k'), greq);
    await vi.advanceTimersByTimeAsync(7000);
    const { events } = await p;
    expect(events[0]).toMatchObject({ kind: 'retry', reason: 'rate_limit', waitMs: 7000 });
  });

  it('lists only text generation models', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        json(200, {
          models: [
            {
              name: 'models/gemini-3.8-flash',
              displayName: 'Gemini 3.8 Flash',
              supportedGenerationMethods: ['generateContent'],
            },
            {
              name: 'models/gemini-3.8-flash-tts',
              supportedGenerationMethods: ['generateContent'],
            },
            {
              name: 'models/gemini-embedding-2-preview',
              supportedGenerationMethods: ['embedContent'],
            },
          ],
        }),
      ),
    );
    expect(await new GeminiProvider('k').listModels()).toEqual([
      { id: 'gemini-3.8-flash', displayName: 'Gemini 3.8 Flash' },
    ]);
  });
});
