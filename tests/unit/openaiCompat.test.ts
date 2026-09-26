// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LlmError, redactKeys } from '@/llm/errors';
import {
  buildChatBody,
  NO_KEY_NEEDED,
  OpenAICompatProvider,
  parseJsonReply,
} from '@/llm/openaiCompat';
import { createProvider, providerBaseUrl } from '@/llm/provider';
import type { AnswerRequest, StreamEvent } from '@/llm/types';

const req: AnswerRequest = {
  model: 'openrouter/auto',
  maxTokens: 1024,
  system: [{ text: 'rules' }, { text: 'profile', cache: true }],
  messages: [{ role: 'user', content: [{ type: 'text', text: 'Q' }] }],
};

function sse(lines: string[]) {
  const enc = new TextEncoder();
  return new Response(
    new ReadableStream({
      start(c) {
        for (const l of lines) c.enqueue(enc.encode(`data: ${l}\n\n`));
        c.close();
      },
    }),
    { status: 200, headers: { 'content-type': 'text/event-stream' } },
  );
}
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

afterEach(() => vi.unstubAllGlobals());

describe('OpenAI-compatible provider', () => {
  it('builds chat bodies: one system message, images as data URLs, JSON schema', () => {
    const body = buildChatBody(
      {
        ...req,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image', mediaType: 'image/png', data: 'AAAA' },
              { type: 'text', text: 'Q' },
            ],
          },
        ],
        jsonSchema: { type: 'object' },
        schemaName: 'save_x',
      },
      true,
    );
    expect(body.messages).toEqual([
      { role: 'system', content: 'rules\n\nprofile' },
      {
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: 'data:image/png;base64,AAAA' } },
          { type: 'text', text: 'Q' },
        ],
      },
    ]);
    expect(body).toMatchObject({
      stream: true,
      stream_options: { include_usage: true },
      response_format: { type: 'json_schema', json_schema: { name: 'save_x', strict: true } },
    });
    // A text-only turn is a plain string.
    expect((buildChatBody(req, false).messages as { content: unknown }[])[1]!.content).toBe('Q');
  });

  it('streams text and usage, and sends the key as a bearer token', async () => {
    const fetch = vi.fn().mockResolvedValue(
      sse([
        JSON.stringify({ choices: [{ delta: { content: 'Hel' } }] }),
        JSON.stringify({ choices: [{ delta: { content: 'lo' } }] }),
        JSON.stringify({
          choices: [{ delta: {}, finish_reason: 'stop' }],
          usage: {
            prompt_tokens: 100,
            completion_tokens: 5,
            prompt_tokens_details: { cached_tokens: 80 },
          },
        }),
        '[DONE]',
      ]),
    );
    vi.stubGlobal('fetch', fetch);
    const events: StreamEvent[] = [];
    const result = await new OpenAICompatProvider(
      'sk-or-v1-abc',
      'https://x/v1',
      'OpenRouter',
    ).stream(req, new AbortController().signal, (e) => events.push(e));
    expect(result.text).toBe('Hello');
    expect(result.stopReason).toBe('end_turn');
    expect(result.usage).toEqual({
      inputTokens: 20,
      cacheWriteTokens: 0,
      cacheReadTokens: 80,
      outputTokens: 5,
    });
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe('https://x/v1/chat/completions');
    expect(init.headers).toMatchObject({
      authorization: 'Bearer sk-or-v1-abc',
      'x-title': 'AnswerSnap',
    });
  });

  it('sends no auth header for Ollama', async () => {
    const fetch = vi.fn().mockResolvedValue(json(200, { data: [{ id: 'qwen3' }] }));
    vi.stubGlobal('fetch', fetch);
    const models = await new OpenAICompatProvider(
      NO_KEY_NEEDED,
      'http://localhost:11434/v1',
      'Ollama',
    ).listModels();
    expect(models).toEqual([{ id: 'qwen3', displayName: 'qwen3' }]);
    expect(fetch.mock.calls[0]![1].headers.authorization).toBeUndefined();
  });

  it('maps errors, with Ollama-specific help', async () => {
    const run = async (status: number, service: 'OpenRouter' | 'Ollama') => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(json(status, { error: { message: 'nope' } })),
      );
      return new OpenAICompatProvider('k', 'https://x/v1', service)
        .listModels()
        .catch((e: LlmError) => e);
    };
    expect(await run(401, 'OpenRouter')).toMatchObject({ kind: 'auth' });
    expect(((await run(403, 'Ollama')) as LlmError).message).toContain('OLLAMA_ORIGINS');
    expect(await run(402, 'OpenRouter')).toMatchObject({ kind: 'bad_request', status: 402 });
    expect(((await run(404, 'Ollama')) as LlmError).message).toContain('ollama pull');
  });

  it('falls back to a schema in the prompt when structured output is refused', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(json(400, { error: { message: 'response_format not supported' } }))
      .mockResolvedValueOnce(
        json(200, {
          choices: [{ message: { content: '```json\n{"ok":true}\n```' }, finish_reason: 'stop' }],
        }),
      );
    vi.stubGlobal('fetch', fetch);
    const result = await new OpenAICompatProvider('k', 'https://x/v1', 'OpenRouter').complete({
      ...req,
      jsonSchema: { type: 'object' },
    });
    expect(result.json).toEqual({ ok: true });
    const retry = JSON.parse(fetch.mock.calls[1]![1].body as string);
    expect(retry.response_format).toBeUndefined();
    expect(retry.messages[0].content).toContain('Reply with only JSON matching this schema');
    expect(parseJsonReply(' {"a":1} ')).toEqual({ a: 1 });
  });

  it('picks base URLs and redacts OpenRouter keys', () => {
    const base = (p: 'openrouter' | 'ollama', baseUrl?: string) =>
      (createProvider(p, 'k', baseUrl) as unknown as { baseUrl: string }).baseUrl;
    expect(base('openrouter')).toBe('https://openrouter.ai/api/v1');
    expect(base('ollama')).toBe('http://localhost:11434/v1');
    expect(base('ollama', 'http://box:11434/')).toBe('http://box:11434/v1');
    expect(
      providerBaseUrl({ provider: 'ollama', ollamaUrl: 'http://box:1', baseUrl: undefined }),
    ).toBe('http://box:1');
    expect(
      providerBaseUrl({ provider: 'openrouter', ollamaUrl: 'x', baseUrl: undefined }),
    ).toBeUndefined();
    expect(redactKeys('bad key sk-or-v1-abcdef123 and Bearer abcdefghijklmnop')).toBe(
      'bad key sk-or-v1-[redacted] and Bearer [redacted]',
    );
  });
});
