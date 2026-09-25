// Answer quality evals (spec 16.4). Runs Appendix B against the real API with the same prompt
// code the side panel uses, then writes evals/report.md.
//
//   ANTHROPIC_API_KEY=... pnpm eval
//   GEMINI_API_KEY=... pnpm eval --provider gemini
//   pnpm eval --profile evals/profile.local.json --model claude-opus-5-5 --only 1,4,16

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { defaultSettings } from '../src/config/defaults';
import {
  buildSystemBlocks,
  buildUserTurn,
  candidateBlock,
  todayIso,
} from '../src/kb/contextBuilder';
import {
  CandidateProfileSchema,
  filledStandardAnswers,
  StandardAnswersSchema,
} from '../src/kb/profileSchema';
import { parseLimits } from '../src/llm/limits';
import { createProvider } from '../src/llm/provider';
import { LlmError } from '../src/llm/errors';
import { parseTagged } from '../src/llm/tagParser';
import { EMPTY_USAGE, type Usage } from '../src/llm/types';
import type { FieldInfo, PendingCapture, Provider } from '../src/storage/schema';
import { runChecks, type CheckResult, type Expect } from './checks';

interface Question {
  id: number;
  question: string;
  fieldKind: FieldInfo['kind'];
  inputType?: string;
  maxLength?: number;
  pageText?: string;
  jobContext?: string;
  options?: string[];
  expect: Expect;
}

const root = join(import.meta.dirname, '..');
const { values: args } = parseArgs({
  options: {
    provider: { type: 'string' },
    model: { type: 'string' },
    profile: { type: 'string', default: 'tests/fixtures/profile.json' },
    standard: { type: 'string' },
    only: { type: 'string' },
    delay: { type: 'string' },
    out: { type: 'string', default: 'evals/report.md' },
  },
});

const provider = (args.provider ??
  (process.env.ANTHROPIC_API_KEY ? 'anthropic' : 'gemini')) as Provider;
const apiKey =
  provider === 'anthropic' ? process.env.ANTHROPIC_API_KEY : process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error(
    `Set ${provider === 'anthropic' ? 'ANTHROPIC_API_KEY' : 'GEMINI_API_KEY'} to run evals.`,
  );
  process.exit(2);
}
const settings = { ...defaultSettings(provider), sendScreenshot: false };
if (args.model) settings.model = args.model;
// Gemini's free tier allows about 5 requests a minute.
const delayMs = Number(args.delay ?? (provider === 'gemini' ? 13_000 : 0));
const QUESTION_RETRIES = 2;
const QUESTION_RETRY_WAIT_MS = 65_000;

const profile = CandidateProfileSchema.parse(
  JSON.parse(readFileSync(join(root, args.profile!), 'utf8')),
);
const standard = args.standard
  ? StandardAnswersSchema.parse(JSON.parse(readFileSync(join(root, args.standard), 'utf8')))
  : null;
const data = { profile, standardAnswers: filledStandardAnswers(standard), sources: [] };
const system = buildSystemBlocks(settings, data);
const candidateText = candidateBlock(data);

const only = args.only ? new Set(args.only.split(',').map(Number)) : null;
const questions = (
  JSON.parse(readFileSync(join(root, 'evals/questions.json'), 'utf8')) as Question[]
).filter((q) => !only || only.has(q.id));
const llm = createProvider(provider, apiKey);

interface Row {
  q: Question;
  answer: string;
  type: string;
  missing: string[];
  notes: string;
  usage: Usage;
  ms: number;
  checks: CheckResult[];
  error?: string;
}
const rows: Row[] = [];

for (const [i, q] of questions.entries()) {
  if (i > 0 && delayMs) await new Promise((r) => setTimeout(r, delayMs));
  const field: FieldInfo = {
    targetId: 'f',
    kind: q.fieldKind,
    confidence: 'below',
    ...(q.inputType ? { inputType: q.inputType } : {}),
    ...(q.maxLength ? { maxLength: q.maxLength } : {}),
    ...(q.options ? { options: q.options } : {}),
  };
  const capture: PendingCapture = {
    id: `eval-${q.id}`,
    createdAt: Date.now(),
    mode: 'question',
    tabId: 0,
    windowId: 0,
    pageText: q.pageText ?? q.question,
    hiddenTextChars: 0,
    page: {
      title: 'Application',
      hostname: 'jobs.example.com',
      path: '/apply',
      lang: q.expect.language ?? 'en',
    },
    field,
    candidates: [field],
  };
  const limits = parseLimits(capture.pageText, field);
  const content = buildUserTurn({
    capture,
    settings,
    limits,
    today: todayIso(),
    jobContext: q.jobContext,
  });
  const t0 = Date.now();
  process.stdout.write(`#${q.id} ${q.question.slice(0, 60)} ... `);
  try {
    // Free tiers throw "busy" and per-minute quota errors; wait out the minute and try again.
    let result: Awaited<ReturnType<typeof llm.stream>> | undefined;
    for (let attempt = 0; ; attempt++) {
      try {
        result = await llm.stream(
          {
            model: settings.model,
            maxTokens: settings.maxOutputTokens,
            system,
            messages: [{ role: 'user', content }],
          },
          new AbortController().signal,
          () => {},
        );
        break;
      } catch (err) {
        const retryable =
          err instanceof LlmError && ['rate_limit', 'overloaded', 'server'].includes(err.kind);
        if (!retryable || attempt >= QUESTION_RETRIES) throw err;
        process.stdout.write(`(${err.kind}, waiting ${QUESTION_RETRY_WAIT_MS / 1000} s) `);
        await new Promise((r) => setTimeout(r, QUESTION_RETRY_WAIT_MS));
      }
    }
    const parsed = parseTagged(result!.text);
    const checks = runChecks(parsed, q.expect, {
      maxChars: limits.maxChars,
      maxWords: limits.maxWords,
      candidateText,
      question: capture.pageText,
    });
    const failed = checks.filter((c) => !c.ok && !c.flag);
    console.log(failed.length ? `FAIL (${failed.map((c) => c.name).join('; ')})` : 'ok');
    rows.push({
      q,
      answer: parsed.answer,
      type: parsed.type,
      missing: parsed.missing,
      notes: parsed.notes,
      usage: result!.usage,
      ms: Date.now() - t0,
      checks,
    });
  } catch (err) {
    console.log(`ERROR ${String(err).slice(0, 200)}`);
    rows.push({
      q,
      answer: '',
      type: '',
      missing: [],
      notes: '',
      usage: EMPTY_USAGE,
      ms: Date.now() - t0,
      checks: [],
      error: String(err),
    });
  }
}

// Report ---------------------------------------------------------------------------------------
const failures = rows.filter((r) => r.error || r.checks.some((c) => !c.ok && !c.flag));
const flags = rows.filter((r) => r.checks.some((c) => !c.ok && c.flag));
const cacheReads = rows.slice(1).filter((r) => r.usage.cacheReadTokens > 0).length;
const esc = (s: string) => s.replace(/\|/g, '\\|').replace(/\n/g, '<br>');
const lines = [
  '# AnswerSnap eval report',
  '',
  `- Date: ${todayIso()}`,
  `- Provider: ${provider}, model: ${settings.model}`,
  `- Profile: ${args.profile}`,
  `- Questions: ${rows.length}. Automatic checks failed on ${failures.length}. Flagged for manual review: ${flags.length}.`,
  `- Answers after the first that read from the prompt cache: ${cacheReads} of ${Math.max(0, rows.length - 1)}`,
  '',
  'Release bar: every automatic check passes on the fixture profile, and a manual read finds no invented facts.',
  '',
];
for (const r of rows) {
  lines.push(`## ${r.q.id}. ${r.q.question}`, '');
  if (r.error) {
    lines.push(`**Error:** ${esc(r.error)}`, '');
    continue;
  }
  lines.push(`> ${r.answer ? esc(r.answer) : '(empty)'}`, '');
  lines.push(
    `Type ${r.type}. ${r.answer.length} characters. Missing: ${r.missing.join('; ') || 'none'}.${r.notes ? ` Note: ${esc(r.notes)}` : ''}`,
    `Usage: in ${r.usage.inputTokens + r.usage.cacheReadTokens + r.usage.cacheWriteTokens} (${r.usage.cacheReadTokens} cached), out ${r.usage.outputTokens}, ${r.ms} ms.`,
    '',
    '| Check | Result | Detail |',
    '|---|---|---|',
    ...r.checks.map(
      (c) =>
        `| ${c.name} | ${c.ok ? 'pass' : c.flag ? 'review' : '**FAIL**'} | ${esc(c.detail ?? '')} |`,
    ),
    '',
  );
}
writeFileSync(join(root, args.out!), lines.join('\n'));
console.log(
  `\n${failures.length ? `${failures.length} question(s) failed automatic checks` : 'All automatic checks passed'}. Report: ${args.out}`,
);
process.exit(failures.length ? 1 : 0);
