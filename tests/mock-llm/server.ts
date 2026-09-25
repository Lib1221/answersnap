// Mock LLM server for E2E (spec 16.2). Serves Anthropic-shaped and Gemini-shaped SSE, picks a
// canned answer by keyword in the request, and logs every request body for assertions.
//
// Scenarios are chosen by API key:
//   bad-key         401 (Anthropic) / 400 API_KEY_INVALID (Gemini)
//   rate-limit-key  first request 429 with retry-after 1, then success
//   overloaded-key  first two requests 529, then success
//   slow-key        streams one word every 300 ms (for Stop)
// GET /__log returns logged bodies; POST /__reset clears the log and counters.

import { readFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { join } from 'node:path';

const PROFILE = readFileSync(join(import.meta.dirname, '../fixtures/profile.json'), 'utf8');
const TRANSCRIPT = 'Jamie Park\nBackend Engineer, Lisbon\nPayments APIs with Django at Ledgerly';

/** Non-streamed replies: structured profile JSON, tool use, or an image transcription. */
function completeText(raw: string): string {
  if (/Transcribe all readable text/.test(raw)) return TRANSCRIPT;
  if (/Extract the candidate's profile/.test(raw)) return PROFILE;
  return canned(raw);
}

const PORT = Number(process.env.MOCK_LLM_PORT ?? 4620);
const log: unknown[] = [];
const counters = new Map<string, number>();

const CANNED: [RegExp, string][] = [
  [
    /years of professional Python/i,
    '<question>How many years of professional Python experience do you have?</question>\n<type>number</type>\n<answer>5</answer>\n<missing></missing>\n<notes></notes>',
  ],
  [
    /Why do you want to join us/i,
    "<question>Why do you want to join us?</question>\n<type>long_text</type>\n<answer>I build payment APIs at Ledgerly, and your team works on the same problems at a larger scale. I'd like to bring my Django REST Framework experience to that work.</answer>\n<missing></missing>\n<notes></notes>",
  ],
  [
    /hourly rate/i,
    '<question>What is your expected hourly rate (USD)?</question>\n<type>salary</type>\n<answer>[[expected hourly rate in USD]]</answer>\n<missing>expected hourly rate in USD</missing>\n<notes>Add your rate in Standard answers.</notes>',
  ],
  [
    /print\(0\.1 \+ 0\.2/i,
    '<question>What does this print?</question>\n<type>assessment</type>\n<answer></answer>\n<missing></missing>\n<notes></notes>',
  ],
];
const FALLBACK =
  '<question>Unknown</question>\n<type>short_text</type>\n<answer>I have 5 years of Python experience.</answer>\n<missing></missing>\n<notes></notes>';

function cors(res: ServerResponse) {
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('access-control-allow-headers', '*');
  res.setHeader('access-control-allow-methods', 'GET,POST,OPTIONS');
  res.setHeader('access-control-expose-headers', 'retry-after');
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

function bump(key: string): number {
  const n = (counters.get(key) ?? 0) + 1;
  counters.set(key, n);
  return n;
}

/** Match keywords in the conversation only; the system blocks hold the resume. */
function canned(raw: string): string {
  const body = JSON.parse(raw) as { messages?: unknown; contents?: unknown };
  const turns = JSON.stringify(body.messages ?? body.contents ?? '');
  return CANNED.find(([re]) => re.test(turns))?.[1] ?? FALLBACK;
}

function words(text: string): string[] {
  return text.match(/\S+\s*|\s+/g) ?? [text];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function json(
  res: ServerResponse,
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
) {
  res.writeHead(status, { 'content-type': 'application/json', ...headers });
  res.end(JSON.stringify(body));
}

/** Returns true when an error scenario handled the response. */
function scenario(res: ServerResponse, key: string, gemini: boolean): boolean {
  if (key === 'bad-key') {
    if (gemini) {
      json(res, 400, {
        error: {
          code: 400,
          message: 'API key not valid. Please pass a valid API key.',
          status: 'INVALID_ARGUMENT',
          details: [
            { '@type': 'type.googleapis.com/google.rpc.ErrorInfo', reason: 'API_KEY_INVALID' },
          ],
        },
      });
    } else {
      json(res, 401, {
        type: 'error',
        error: { type: 'authentication_error', message: 'invalid x-api-key' },
      });
    }
    return true;
  }
  if (key === 'rate-limit-key' && bump(key) === 1) {
    json(
      res,
      429,
      { type: 'error', error: { type: 'rate_limit_error', message: 'Rate limited' } },
      { 'retry-after': '1' },
    );
    return true;
  }
  if (key === 'overloaded-key' && bump(key) <= 2) {
    json(res, 529, { type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } });
    return true;
  }
  return false;
}

function nonStreamContent(body: { max_tokens?: number; tools?: { name: string }[] }, raw: string) {
  if (body.max_tokens === 0) return [];
  if (body.tools?.length) {
    return [
      { type: 'tool_use', id: 'toolu_mock', name: body.tools[0]!.name, input: JSON.parse(PROFILE) },
    ];
  }
  return [{ type: 'text', text: completeText(raw) }];
}

async function anthropicMessages(req: IncomingMessage, res: ServerResponse) {
  const raw = await readBody(req);
  const body = JSON.parse(raw) as { stream?: boolean; max_tokens?: number };
  log.push(body);
  const key = String(req.headers['x-api-key'] ?? '');
  if (scenario(res, key, false)) return;

  const usage = {
    input_tokens: 150,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 1800,
    output_tokens: 1,
  };
  if (!body.stream) {
    return json(res, 200, {
      id: 'msg_mock',
      type: 'message',
      role: 'assistant',
      content: nonStreamContent(body, raw),
      stop_reason: body.max_tokens === 0 ? 'max_tokens' : 'end_turn',
      usage: { ...usage, cache_creation_input_tokens: 1800, cache_read_input_tokens: 0 },
    });
  }
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
  const send = (event: string, data: unknown) =>
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  send('message_start', { type: 'message_start', message: { id: 'msg_mock', usage } });
  send('content_block_start', {
    type: 'content_block_start',
    index: 0,
    content_block: { type: 'text', text: '' },
  });
  send('ping', { type: 'ping' });
  const delay = key === 'slow-key' ? 300 : 5;
  for (const w of words(canned(raw))) {
    if (res.destroyed) return;
    send('content_block_delta', {
      type: 'content_block_delta',
      index: 0,
      delta: { type: 'text_delta', text: w },
    });
    await sleep(delay);
  }
  send('content_block_stop', { type: 'content_block_stop', index: 0 });
  send('message_delta', {
    type: 'message_delta',
    delta: { stop_reason: 'end_turn' },
    usage: { output_tokens: 42 },
  });
  send('message_stop', { type: 'message_stop' });
  res.end();
}

async function geminiStream(req: IncomingMessage, res: ServerResponse) {
  const raw = await readBody(req);
  log.push(JSON.parse(raw));
  const key = String(req.headers['x-goog-api-key'] ?? '');
  if (scenario(res, key, true)) return;
  res.writeHead(200, { 'content-type': 'text/event-stream' });
  const parts = words(canned(raw));
  for (const [i, w] of parts.entries()) {
    if (res.destroyed) return;
    const last = i === parts.length - 1;
    const chunk = {
      candidates: [
        {
          content: { role: 'model', parts: [{ text: w }] },
          ...(last ? { finishReason: 'STOP' } : {}),
        },
      ],
      ...(last
        ? {
            usageMetadata: {
              promptTokenCount: 2000,
              cachedContentTokenCount: 1500,
              candidatesTokenCount: 40,
              thoughtsTokenCount: 20,
            },
          }
        : {}),
    };
    res.write(`data: ${JSON.stringify(chunk)}\n\n`);
    await sleep(key === 'slow-key' ? 300 : 5);
  }
  res.end();
}

createServer(async (req, res) => {
  cors(res);
  const url = new URL(req.url ?? '/', `http://127.0.0.1:${PORT}`);
  try {
    if (req.method === 'OPTIONS') return void res.writeHead(204).end();
    if (url.pathname === '/__log') return json(res, 200, log);
    if (url.pathname === '/__reset') {
      log.length = 0;
      counters.clear();
      return json(res, 200, { ok: true });
    }
    if (url.pathname === '/v1/models') {
      if (req.headers['x-api-key'] === 'bad-key') return void scenario(res, 'bad-key', false);
      return json(res, 200, {
        data: [
          { id: 'claude-sonnet-5', display_name: 'Claude Sonnet 5' },
          { id: 'claude-haiku-4-5-20251001', display_name: 'Claude Haiku 4.5' },
        ],
        has_more: false,
      });
    }
    if (url.pathname === '/v1/messages' && req.method === 'POST')
      return await anthropicMessages(req, res);
    if (url.pathname === '/v1beta/models') {
      if (req.headers['x-goog-api-key'] === 'bad-key') return void scenario(res, 'bad-key', true);
      return json(res, 200, {
        models: [
          {
            name: 'models/gemini-3.8-flash',
            displayName: 'Gemini 3.8 Flash',
            supportedGenerationMethods: ['generateContent'],
          },
        ],
      });
    }
    if (/^\/v1beta\/models\/[^/]+:streamGenerateContent$/.test(url.pathname))
      return await geminiStream(req, res);
    if (/^\/v1beta\/models\/[^/]+:generateContent$/.test(url.pathname)) {
      const raw = await readBody(req);
      log.push(JSON.parse(raw));
      if (scenario(res, String(req.headers['x-goog-api-key'] ?? ''), true)) return;
      return json(res, 200, {
        candidates: [
          {
            content: { role: 'model', parts: [{ text: completeText(raw) }] },
            finishReason: 'STOP',
          },
        ],
        usageMetadata: { promptTokenCount: 1000, candidatesTokenCount: 200 },
      });
    }
    json(res, 404, { error: 'not found' });
  } catch (err) {
    json(res, 500, { error: String(err) });
  }
}).listen(PORT, '127.0.0.1', () => console.log(`mock LLM on ${PORT}`));
