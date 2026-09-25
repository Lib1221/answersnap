import { countWords } from '../src/llm/limits';
import type { ParsedAnswer } from '../src/llm/tagParser';

// Automatic checks (spec 16.4). Each returns pass/fail with a reason; "flag" results need a
// manual read and never fail the run.

export interface Expect {
  type?: string;
  placeholders?: boolean;
  assessment?: boolean;
  language?: 'en' | 'de';
  maxChars?: number;
  maxWords?: number;
  mustNotContain?: string[];
  mustMatch?: string;
  mustNotMatch?: string;
  oneOf?: string[];
  subsetOf?: string[];
  manual?: string;
}

export interface CheckResult {
  name: string;
  ok: boolean;
  /** Flags go to manual review and don't fail the run. */
  flag?: boolean;
  detail?: string;
}

export const BANNED_WORDS = [
  'passionate',
  'leverage',
  'synergy',
  'dynamic',
  'results-driven',
  'spearheaded',
  'delve',
  'tapestry',
  'cutting-edge',
  'seamless',
  'innovative',
  'thrilled',
];

const STOPWORDS = {
  en: ['the', 'and', 'i', 'to', 'of', 'a', 'in', 'my', 'with', 'for', 'is', 'have'],
  de: [
    'und',
    'ich',
    'die',
    'der',
    'das',
    'zu',
    'mit',
    'bei',
    'ist',
    'für',
    'nicht',
    'mein',
    'meine',
    'sie',
  ],
};

export function detectLanguage(text: string): 'en' | 'de' | 'unknown' {
  const words = text.toLowerCase().match(/\p{L}+/gu) ?? [];
  const score = (list: string[]) => words.filter((w) => list.includes(w)).length;
  const en = score(STOPWORDS.en);
  const de = score(STOPWORDS.de);
  if (en === 0 && de === 0) return 'unknown';
  return de > en ? 'de' : 'en';
}

/** Numbers in the answer that don't appear in the candidate data (possible invented facts). */
export function unsupportedNumbers(answer: string, candidateText: string): string[] {
  const nums = answer.match(/\d[\d,.]*/g) ?? [];
  const data = candidateText.replace(/,/g, '');
  return nums
    .map((n) => n.replace(/[,.]$/, '').replace(/,/g, ''))
    .filter((n) => n && !data.includes(n));
}

export function runChecks(
  parsed: ParsedAnswer,
  expect: Expect,
  ctx: { maxChars: number; maxWords?: number; candidateText: string; question: string },
): CheckResult[] {
  const a = parsed.answer;
  const results: CheckResult[] = [];
  const add = (name: string, ok: boolean, detail?: string, flag = false) =>
    results.push({ name, ok, detail, flag });

  add('no em or en dashes', !/[—–]/.test(a));
  const maxChars = expect.maxChars ?? ctx.maxChars;
  add('under the character limit', a.length <= maxChars, `${a.length} / ${maxChars}`);
  const maxWords = expect.maxWords ?? ctx.maxWords;
  if (maxWords)
    add('under the word limit', countWords(a) <= maxWords, `${countWords(a)} / ${maxWords}`);

  const hasPlaceholder = /\[\[[^\]]+\]\]/.test(a) || parsed.missing.length > 0;
  if (expect.placeholders)
    add('placeholder present', hasPlaceholder, parsed.missing.join('; ') || undefined);

  if (expect.assessment)
    add('assessment detected', parsed.type === 'assessment' && a === '', parsed.type);
  else add('not treated as an assessment', parsed.type !== 'assessment', parsed.type);

  for (const word of expect.mustNotContain ?? []) {
    add(`does not contain "${word}"`, !new RegExp(`\\b${word}\\b`, 'i').test(a));
  }
  if (expect.mustMatch)
    add(`matches ${expect.mustMatch}`, new RegExp(expect.mustMatch, 'i').test(a.trim()), a);
  if (expect.mustNotMatch)
    add('does not claim missing experience', !new RegExp(expect.mustNotMatch, 'i').test(a));
  if (expect.oneOf) add(`one of ${expect.oneOf.join(', ')}`, expect.oneOf.includes(a.trim()), a);
  if (expect.subsetOf) {
    const picked = a
      .split(/,\s*/)
      .map((s) => s.trim())
      .filter(Boolean);
    add(
      `only picks ${expect.subsetOf.join(', ')}`,
      picked.length > 0 && picked.every((p) => expect.subsetOf!.includes(p)),
      a,
    );
  }

  if (!expect.assessment) {
    const expected = expect.language ?? 'en';
    const got = detectLanguage(a);
    add(
      `answer language is ${expected}`,
      got === expected || (got === 'unknown' && a.length < 40),
      got,
    );
  }

  const banned = BANNED_WORDS.filter((w) => new RegExp(`\\b${w}\\b`, 'i').test(a));
  add('no banned words', banned.length === 0, banned.join(', ') || undefined);

  if (expect.type) add(`type is ${expect.type}`, parsed.type === expect.type, parsed.type, true);
  const numbers = unsupportedNumbers(a, `${ctx.candidateText}\n${ctx.question}`);
  add(
    'numbers found in the candidate data',
    numbers.length === 0,
    numbers.join(', ') || undefined,
    true,
  );
  if (expect.manual) add('manual review', false, expect.manual, true);
  return results;
}
