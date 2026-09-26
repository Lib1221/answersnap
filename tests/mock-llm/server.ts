// Mock LLM server for E2E (spec 16.2). Serves Anthropic-shaped and Gemini-shaped SSE, picks a
// canned answer by keyword in the request, and logs every request body for assertions.
//
// Scenarios are chosen by API key:
//   bad-key         401 (Anthropic) / 400 API_KEY_INVALID (Gemini)
//   rate-limit-key  first request 429 with retry-after 2, then success
//   overloaded-key  first two requests 529, then success
//   slow-key        streams one word every 300 ms (for Stop)
// GET /__log returns logged bodies; POST /__reset clears the log and counters.

import { readFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { join } from 'node:path';

const PROFILE = readFileSync(join(import.meta.dirname, '../fixtures/profile.json'), 'utf8');
const TRANSCRIPT = 'Jamie Park\nBackend Engineer, Lisbon\nPayments APIs with Django at Ledgerly';

/** "Fill form": answer each <field> with the canned answer for its question, as JSON. */
function batchJson(raw: string): string {
  const body = JSON.parse(raw) as { messages?: unknown; contents?: unknown };
  const turn = JSON.parse(
    `"${(JSON.stringify(body.messages ?? body.contents ?? '').match(/<fields>(.*?)<\/fields>/) ?? [])[1] ?? ''}"`,
  ) as string;
  const answers = [...turn.matchAll(/<field id="([^"]+)"[^>]*>\n<question>(.*?)<\/question>/g)].map(
    ([, id, question]) => {
      const q = question!;
      if (/full name/i.test(q))
        return {
          id,
          question: q,
          type: 'short_text',
          answer: 'Jamie Park',
          missing: [],
          notes: '',
        };
      if (/email/i.test(q))
        return {
          id,
          question: q,
          type: 'short_text',
          answer: 'jamie.park@example.com',
          missing: [],
          notes: '',
        };
      const c = CANNED.find(([re]) => re.test(q))?.[1] ?? FALLBACK;
      const tag = (t: string) => c.match(new RegExp(`<${t}>([\\s\\S]*?)</${t}>`))?.[1] ?? '';
      return {
        id,
        question: q,
        type: tag('type') || 'unclear',
        answer: tag('answer'),
        missing: tag('missing')
          .split(';')
          .map((m) => m.trim())
          .filter(Boolean),
        notes: tag('notes'),
      };
    },
  );
  return JSON.stringify({ answers });
}

/** Fact check: sentences mentioning "struggling" aren't in Jamie's resume; the rest are. */
function factCheckJson(raw: string): string {
  const body = JSON.parse(raw) as { messages?: unknown; contents?: unknown };
  const turn = JSON.stringify(body.messages ?? body.contents ?? '');
  const block = JSON.parse(
    `"${turn.match(/<answer_sentences>(.*?)<\/answer_sentences>/)?.[1] ?? ''}"`,
  ) as string;
  const checks = block
    .split('\n')
    .map((line) => line.match(/^(\d+)\. (.*)$/))
    .filter((m): m is RegExpMatchArray => m !== null)
    .map((m) =>
      /struggling/i.test(m[2]!)
        ? {
            index: Number(m[1]),
            claims: [{ claim: 'the system was struggling under heavy load', quote: null }],
            verdict: 'unsupported',
            issue: 'Your resume never mentions load problems before your work.',
          }
        : {
            index: Number(m[1]),
            claims: [
              {
                claim: 'moved report generation to Celery',
                quote: 'Cut p95 latency of the invoicing service from 900 ms to 240 ms',
              },
            ],
            verdict: 'supported',
            issue: null,
          },
    );
  return JSON.stringify({ checks });
}

/** Job fit check: a fixed analysis of Jamie against the fixture job post. */
const FIT = {
  score: 72.4,
  summary: 'You match the core Python and payments work. Kubernetes is the main gap.',
  requirements: [
    {
      requirement: 'Kubernetes in production',
      mustHave: false,
      met: false,
      evidence: null,
      advice: 'Lead with your Docker and CI work at Ledgerly.',
    },
    {
      requirement: '5+ years of Python',
      mustHave: true,
      met: true,
      evidence: 'Python since 2019 at Ledgerly and Brightpath',
      advice: null,
    },
    {
      requirement: 'Payments or billing APIs',
      mustHave: true,
      met: true,
      evidence: 'Payments APIs with Django at Ledgerly',
      advice: null,
    },
  ],
  keywords: ['Django', 'PostgreSQL', 'reconciliation', 'Django'],
  talkingPoints: ['Cut invoicing p95 latency from 900 ms to 240 ms with Celery.'],
};

/** Non-streamed replies: structured profile JSON, tool use, or an image transcription. */
function completeText(raw: string): string {
  if (/Write an answer for every field/.test(raw)) return batchJson(raw);
  if (/You check a drafted job application answer/.test(raw)) return factCheckJson(raw);
  if (/You compare a candidate with a job post/.test(raw)) return JSON.stringify(FIT);
  if (/Transcribe all readable text/.test(raw)) return TRANSCRIPT;
  if (/Extract the candidate's profile/.test(raw)) return PROFILE;
  return canned(raw);
}

const PORT = Number(process.env.MOCK_LLM_PORT ?? 4620);
const log: unknown[] = [];
const counters = new Map<string, number>();

const CANNED: [RegExp, string][] = [
  // Letter tab.
  [
    /Write a cover letter for/i,
    "<question>Write a cover letter.</question>\n<type>long_text</type>\n<answer>Dear Hiring Manager,\n\nI build payments APIs with Django at Ledgerly, where I moved report generation to Celery workers and cut p95 latency from 900 ms to 240 ms.\n\nI'd bring the same care to your backend team.\n\nBest regards,\nJamie Park</answer>\n<missing></missing>\n<notes></notes>",
  ],
  // "Fix it" after a fact check: the rewrite drops the unsupported claim. Listed first so it wins.
  [
    /state things the candidate data doesn't support/i,
    "<question>Describe a project you're proud of.</question>\n<type>long_text</type>\n<answer>I moved report generation for Ledgerly's invoicing service to Celery workers, which cut p95 latency from 900 ms to 240 ms.</answer>\n<missing></missing>\n<notes></notes>",
  ],
  [
    /Describe a project you're proud of/i,
    "<question>Describe a project you're proud of.</question>\n<type>long_text</type>\n<answer>I moved report generation for Ledgerly's invoicing service to Celery workers, which cut p95 latency from 900 ms to 240 ms. The system was struggling under heavy load before I stepped in.</answer>\n<missing></missing>\n<notes></notes>",
  ],
  [
    /Rate your English proficiency/i,
    '<question>Rate your English proficiency.</question>\n<type>single_choice</type>\n<answer>Fluent</answer>\n<missing></missing>\n<notes></notes>',
  ],
  [
    /Which of these frameworks have you used/i,
    '<question>Which of these frameworks have you used?</question>\n<type>multi_choice</type>\n<answer>Django, Flask</answer>\n<missing></missing>\n<notes></notes>',
  ],
  [
    /Time zone/i,
    '<question>Time zone</question>\n<type>single_choice</type>\n<answer>UTC+00:00 London Lisbon</answer>\n<missing></missing>\n<notes></notes>',
  ],
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
      { 'retry-after': '2' },
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

/** quota-key: gemini-3.1-flash-lite (the default) is out of its daily free quota, like Google's real error. */
function quotaScenario(res: ServerResponse, key: string, model: string): boolean {
  if (key !== 'quota-key' || model !== 'gemini-3.1-flash-lite') return false;
  json(res, 429, {
    error: {
      code: 429,
      message: 'You exceeded your current quota, please check your plan and billing details.',
      status: 'RESOURCE_EXHAUSTED',
      details: [
        {
          '@type': 'type.googleapis.com/google.rpc.QuotaFailure',
          violations: [
            { quotaId: 'GenerateRequestsPerDayPerProjectPerModel-FreeTier', quotaValue: '20' },
          ],
        },
        { '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '15s' },
      ],
    },
  });
  return true;
}

async function geminiStream(req: IncomingMessage, res: ServerResponse, model: string) {
  const raw = await readBody(req);
  log.push({ ...JSON.parse(raw), _model: model });
  const key = String(req.headers['x-goog-api-key'] ?? '');
  if (quotaScenario(res, key, model)) return;
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
            name: 'models/gemini-3.6-flash',
            displayName: 'Gemini 3.6 Flash',
            supportedGenerationMethods: ['generateContent'],
          },
          {
            name: 'models/gemini-3.5-flash',
            displayName: 'Gemini 3.5 Flash',
            supportedGenerationMethods: ['generateContent'],
          },
        ],
      });
    }
    const geminiModel = url.pathname.match(/^\/v1beta\/models\/([^/:]+):/)?.[1] ?? '';
    if (/^\/v1beta\/models\/[^/]+:streamGenerateContent$/.test(url.pathname))
      return await geminiStream(req, res, geminiModel);
    if (/^\/v1beta\/models\/[^/]+:generateContent$/.test(url.pathname)) {
      const raw = await readBody(req);
      log.push({ ...JSON.parse(raw), _model: geminiModel });
      const gkey = String(req.headers['x-goog-api-key'] ?? '');
      if (quotaScenario(res, gkey, geminiModel)) return;
      if (scenario(res, gkey, true)) return;
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
