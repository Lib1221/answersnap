import {
  buildSystemBlocks,
  buildUserTurn,
  todayIso,
  type CandidateData,
} from '@/kb/contextBuilder';
import type { Settings } from '@/storage/schema';
import type { Requirements } from './requirements';
import { parseTagged } from './tagParser';
import type { LlmProvider } from './types';

// Motivation letter for a master's programme or scholarship (the Study tab). The programme's own
// page says what the letter must cover; the applicant's reasons and goals are theirs to give, so
// what they didn't say comes back as a [[placeholder]], never as an invented motive.

export const DEFAULT_WORD_LIMIT = 500;
export const MIN_WORD_LIMIT = 150;
export const MAX_WORD_LIMIT = 1500;

export interface MotivationInput {
  program: string;
  institution: string;
  /** The most words the call allows. */
  wordLimit: number;
  /** Why this programme, in the applicant's own words. */
  why: string;
  /** What they want to do after it. */
  goals: string;
}

export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * The letter's length limit as the call states it for its motivation letter or statement:
 * "max 500 words", "3000 characters" (about 6 per word), "one page" (about 450 words).
 */
export function letterLimitFrom(r: Requirements | null): number | null {
  const doc = r?.documents.find((d) =>
    /motivation|statement of purpose|personal statement|letter of intent|cover letter/i.test(
      `${d.name} ${d.details}`,
    ),
  );
  if (!doc) return null;
  const text = `${doc.name} ${doc.details}`.replace(/(\d)[,.](\d{3})\b/g, '$1$2');
  const words = text.match(/(\d{2,5})\s*words?/i);
  const chars = text.match(/(\d{3,6})\s*(?:characters?|chars?)/i);
  const pages = text.match(/\b(one|two|1|2)\s*(?:A4\s*)?pages?\b/i);
  const limit = words
    ? Number(words[1])
    : chars
      ? Math.floor(Number(chars[1]) / 6)
      : pages
        ? /one|1/i.test(pages[1]!)
          ? 450
          : 900
        : null;
  return limit ? Math.min(MAX_WORD_LIMIT, Math.max(MIN_WORD_LIMIT, limit)) : null;
}

export function motivationQuestion(m: MotivationInput): string {
  const target = [m.program.trim(), m.institution.trim() && `at ${m.institution.trim()}`]
    .filter(Boolean)
    .join(' ');
  // Aim a little under the limit: models overshoot, and the limit is a hard rule of the call.
  const aim = Math.round(m.wordLimit * 0.9);
  return [
    `Write a motivation letter for ${target || 'the programme in <job_context>'}.`,
    'The programme or scholarship page is in <job_context>. If it says what the letter must cover (questions to answer, selection criteria, structure), follow that, in its order.',
    `Otherwise cover, in this order: why this programme at this institution (name two or three specific things from the page: courses, tracks, labs, the scholarship's aims); the applicant's academic background and the work that prepared them, with concrete results from the candidate data; what they want to do after the programme and how the programme leads there; what they would bring to the cohort.`,
    m.why.trim()
      ? `Why this programme, in the applicant's own words (use it, keep its meaning): ${m.why.trim()}`
      : 'The applicant gave no reason for choosing this programme: write [[why you chose this programme]] where it belongs instead of inventing one.',
    m.goals.trim()
      ? `What the applicant wants to do afterwards, in their own words: ${m.goals.trim()}`
      : 'The applicant gave no plan for afterwards: write [[what you want to do after the programme]] instead of inventing one.',
    "Facts about the applicant come only from the candidate data and the two statements above. Never invent grades, awards, publications, family or financial circumstances, or feelings about the country. Facts about the programme come only from the page: don't praise rankings or reputation it doesn't state.",
    `Length: about ${aim} words and never more than ${m.wordLimit} words. Format: "Dear Admissions Committee," (or the body the page names), the paragraphs, then a sign-off and the applicant's name. Plain text with a blank line between paragraphs. Specific and sincere, no flattery, no clichés ("since childhood", "passionate", "prestigious"). The greeting and sign-off are part of the letter.`,
  ].join('\n');
}

export interface MotivationLetter {
  text: string;
  /** What the applicant still has to fill in (the [[placeholders]]). */
  missing: string[];
}

export async function runMotivationLetter(opts: {
  provider: LlmProvider;
  model: string;
  settings: Settings;
  data: CandidateData;
  input: MotivationInput;
  /** Text of the saved programme or call page. */
  pageText: string;
  hostname: string;
  signal?: AbortSignal;
}): Promise<MotivationLetter> {
  // "Stick to my profile" rules whatever the setting: a committee checks every claim.
  const settings: Settings = { ...opts.settings, fillGaps: false, sendScreenshot: false };
  const limit = Math.min(
    MAX_WORD_LIMIT,
    Math.max(MIN_WORD_LIMIT, Math.round(opts.input.wordLimit)),
  );
  const input = { ...opts.input, wordLimit: limit };
  const maxChars = limit * 9;
  const ask = async (question: string) => {
    const content = buildUserTurn({
      capture: {
        id: `motivation-${Date.now()}`,
        createdAt: Date.now(),
        mode: 'question',
        tabId: -1,
        windowId: -1,
        pageText: question,
        hiddenTextChars: 0,
        page: { title: input.program, hostname: opts.hostname, path: '', lang: '' },
        candidates: [],
      },
      settings,
      limits: { maxChars, explicitChars: false },
      today: todayIso(),
      jobContext: opts.pageText,
      length: `a letter of about ${Math.round(limit * 0.9)} words, never more than ${limit} words`,
    });
    const result = await opts.provider.complete(
      {
        model: opts.model,
        maxTokens: Math.min(4096, Math.round(limit * 2.2) + 400),
        system: buildSystemBlocks(settings, opts.data),
        messages: [{ role: 'user', content }],
      },
      opts.signal,
    );
    return parseTagged(result.text);
  };

  let out = await ask(motivationQuestion(input));
  if (!out.answer.trim()) throw new Error('The letter came back empty.');
  // The call's limit is a hard rule: one more try when the letter runs over.
  if (countWords(out.answer) > limit) {
    const shorter = await ask(
      `${motivationQuestion(input)}\nYour last draft had ${countWords(out.answer)} words, over the limit. Rewrite it in at most ${Math.round(limit * 0.85)} words: keep the facts and the order, cut repetition and general statements.`,
    );
    if (shorter.answer.trim() && countWords(shorter.answer) < countWords(out.answer)) out = shorter;
  }
  const placeholders = [...out.answer.matchAll(/\[\[([^\]]+)\]\]/g)].map((m) => m[1]!.trim());
  return {
    text: out.answer.slice(0, maxChars),
    missing: placeholders.length ? [...new Set(placeholders)] : out.missing,
  };
}
