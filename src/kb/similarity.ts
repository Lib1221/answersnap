// Question similarity for the saved answers library (spec 10.5). No embeddings in v1.

export const STRONG_MATCH = 0.6;
export const EXAMPLE_MATCH = 0.35;

const STOPWORDS = new Set(
  (
    'a an the and or but of to in on at for with by from as is are was were be been being it its this that these those ' +
    'you your yours we our us i me my do does did have has had can could would should will shall may might must ' +
    'what which who whom whose when where why how if then than so such any all some each about into over also just ' +
    'please describe tell us explain share briefly kindly let know give provide list'
  ).split(' '),
);

export function normalizeQuestion(text: string): string[] {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w && !STOPWORDS.has(w));
}

function jaccard<T>(a: Set<T>, b: Set<T>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

function trigrams(words: string[]): Set<string> {
  const s = ` ${words.join(' ')} `;
  const out = new Set<string>();
  for (let i = 0; i + 3 <= s.length; i++) out.add(s.slice(i, i + 3));
  return out;
}

/** 0.6 x word Jaccard + 0.4 x character trigram Jaccard, on normalized text. */
export function similarity(a: string, b: string): number {
  const wa = normalizeQuestion(a);
  const wb = normalizeQuestion(b);
  if (!wa.length || !wb.length) return 0;
  return 0.6 * jaccard(new Set(wa), new Set(wb)) + 0.4 * jaccard(trigrams(wa), trigrams(wb));
}

export interface Rankable {
  question: string;
  pinned: boolean;
  uses: number;
  updatedAt: string;
}

/** Best matches first; ties go to pinned, then more uses, then more recent. */
export function rankMatches<T extends Rankable>(
  question: string,
  entries: T[],
  min = EXAMPLE_MATCH,
): { entry: T; score: number }[] {
  return entries
    .map((entry) => ({ entry, score: similarity(question, entry.question) }))
    .filter((m) => m.score >= min)
    .sort(
      (a, b) =>
        b.score - a.score ||
        Number(b.entry.pinned) - Number(a.entry.pinned) ||
        b.entry.uses - a.entry.uses ||
        b.entry.updatedAt.localeCompare(a.entry.updatedAt),
    );
}

/** Normalized Levenshtein ratio, for matching choice labels (spec 12, "fuzzy >= 0.8"). */
export function ratio(a: string, b: string): number {
  const x = a.toLowerCase().trim();
  const y = b.toLowerCase().trim();
  if (!x.length && !y.length) return 1;
  const prev = Array.from({ length: y.length + 1 }, (_, i) => i);
  for (let i = 1; i <= x.length; i++) {
    let diag = prev[0]!;
    prev[0] = i;
    for (let j = 1; j <= y.length; j++) {
      const tmp = prev[j]!;
      prev[j] = Math.min(prev[j]! + 1, prev[j - 1]! + 1, diag + (x[i - 1] === y[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return 1 - prev[y.length]! / Math.max(x.length, y.length);
}
