import type { FieldInfo, LengthPref } from '@/storage/schema';

// Length and limit rules (spec 11.4).

export interface Limits {
  /** Smallest character limit found, or the default for the field kind. */
  maxChars: number;
  /** True when maxChars came from the page rather than a default. */
  explicitChars: boolean;
  maxWords?: number;
}

const DEFAULT_CHARS: Partial<Record<FieldInfo['kind'], number>> = {
  input: 300,
  textarea: 2500,
  contenteditable: 2500,
};

function num(s: string): number {
  return parseInt(s.replace(/[,\s.](?=\d{3}\b)/g, ''), 10);
}

const N = String.raw`(\d{1,3}(?:[,.\s]\d{3})+|\d+)`;

const CHAR_PATTERNS = [
  new RegExp(
    String.raw`(?:max(?:imum)?|up to|no more than|at most|limit(?:ed)?(?: to)?:?|within)\s*${N}\s*(?:characters|chars)`,
    'gi',
  ),
  new RegExp(
    String.raw`${N}\s*(?:characters|chars)\s*(?:max(?:imum)?|or less|or fewer|limit)`,
    'gi',
  ),
  new RegExp(String.raw`limit:?\s*${N}\b(?!\s*words)`, 'gi'),
];

/** Live counters like "0/1000". Only read from field hints: in question text they look like dates. */
const COUNTER_PATTERN = new RegExp(String.raw`\b\d+\s*/\s*${N}\b`, 'g');

const WORD_PATTERNS = [
  new RegExp(
    String.raw`(?:max(?:imum)?|up to|no more than|at most|in|within|limit(?:ed)? to)\s*${N}\s*words`,
    'gi',
  ),
  new RegExp(String.raw`${N}\s*words\s*(?:max(?:imum)?|or less|or fewer|limit)`, 'gi'),
];

function collect(text: string, patterns: RegExp[]): number[] {
  const found: number[] = [];
  for (const re of patterns) {
    re.lastIndex = 0;
    for (const m of text.matchAll(re)) {
      const n = num(m[1]!);
      if (Number.isFinite(n) && n > 0) found.push(n);
    }
  }
  return found;
}

/** Parse limits from the question text, the field hint, and maxlength. Smallest wins. */
export function parseLimits(questionText: string, field?: FieldInfo): Limits {
  const text = [questionText, field?.hint, field?.placeholder, field?.label]
    .filter(Boolean)
    .join('\n');
  const chars = collect(text, CHAR_PATTERNS);
  if (field?.hint) chars.push(...collect(field.hint, [COUNTER_PATTERN]));
  if (field?.maxLength) chars.push(field.maxLength);
  const words = collect(text, WORD_PATTERNS);
  const explicitChars = chars.length > 0;
  const fallback = DEFAULT_CHARS[field?.kind ?? 'textarea'] ?? 2500;
  return {
    maxChars: explicitChars ? Math.min(...chars) : fallback,
    explicitChars,
    maxWords: words.length ? Math.min(...words) : undefined,
  };
}

/** Human description of the target length for <options>. */
export function lengthGuide(
  pref: LengthPref,
  field: FieldInfo | undefined,
  limits: Limits,
): string {
  const capped = (s: string) => `${s}, always under ${limits.maxChars} characters`;
  switch (pref) {
    case 'short':
      return capped('40 to 70 words');
    case 'medium':
      return capped('100 to 160 words');
    case 'long':
      return capped('200 to 300 words');
    case 'auto':
      if (field?.kind === 'input')
        return 'one or two sentences (or just the value, if the question wants one)';
      return limits.explicitChars
        ? `at most ${Math.floor(limits.maxChars * 0.7)} characters`
        : 'about 120 words';
  }
}

export function countWords(text: string): number {
  const t = text.trim();
  return t ? t.split(/\s+/).length : 0;
}
