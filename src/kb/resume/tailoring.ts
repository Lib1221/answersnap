import { storage } from 'wxt/utils/storage';
import { z } from 'zod';
import { plainText } from '../richText';

// One-click tailoring: a job post read from a page (LinkedIn's button, or the job saved in the side
// panel) becomes a job-specific copy of the master resume, with a cover letter. This file holds the
// data shapes, the request hand-off between the service worker and the builder page, and the
// deterministic checks (keyword match score, number guard) that keep the AI's edits honest.

const s = z.string().default('');

/** Longest job post text kept: LinkedIn posts are 2,000 to 8,000 characters. */
export const JOB_POST_MAX = 20_000;
/** A job post shorter than this is not a job post (a snippet, a login wall). */
export const JOB_POST_MIN = 80;

export const JobPostSchema = z.object({
  url: z.string().max(2000).default(''),
  hostname: z.string().min(1).max(253),
  title: z.string().max(300).default(''),
  company: z.string().max(300).default(''),
  location: z.string().max(300).default(''),
  /** Remote, Hybrid, On-site, as the page states it. */
  workplace: z.string().max(60).default(''),
  text: z.string().min(JOB_POST_MIN).max(JOB_POST_MAX),
});
export type JobPost = z.infer<typeof JobPostSchema>;

/** Clean a job post from a page: trims, caps the text, and validates. Null when unusable. */
export function parseJobPost(raw: unknown): JobPost | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  const parsed = JobPostSchema.safeParse({
    url: str(r.url, 2000),
    hostname: str(r.hostname, 253),
    title: str(r.title, 300),
    company: str(r.company, 300),
    location: str(r.location, 300),
    workplace: str(r.workplace, 60),
    text: str(r.text, JOB_POST_MAX)
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n'),
  });
  return parsed.success ? parsed.data : null;
}

// ---- Hand-off: the service worker saves the request, the builder page opened with ?tailor=<id>
// reads it. storage.session: never on disk, gone when Chrome closes.

export const TailorRequestSchema = z.object({
  id: z.string(),
  job: JobPostSchema,
  applicationId: z.string().nullable(),
  createdAt: z.string(),
});
export type TailorRequest = z.infer<typeof TailorRequestSchema>;

/** A request older than this is stale (the tab was left and reopened much later). */
export const TAILOR_REQUEST_TTL_MS = 6 * 60 * 60 * 1000;

const requestKey = (id: string) => `session:tailorRequest:${id}` as const;

export async function saveTailorRequest(
  job: JobPost,
  applicationId: string | null,
  now = new Date(),
): Promise<TailorRequest> {
  const req: TailorRequest = {
    id: `t${now.getTime().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
    job,
    applicationId,
    createdAt: now.toISOString(),
  };
  await storage.setItem(requestKey(req.id), req);
  return req;
}

export async function getTailorRequest(
  id: string,
  now = Date.now(),
): Promise<TailorRequest | null> {
  if (!/^[a-z0-9]{4,40}$/i.test(id)) return null;
  const parsed = TailorRequestSchema.safeParse(await storage.getItem<unknown>(requestKey(id)));
  if (!parsed.success) return null;
  if (now - Date.parse(parsed.data.createdAt) > TAILOR_REQUEST_TTL_MS) {
    await storage.removeItem(requestKey(id));
    return null;
  }
  return parsed.data;
}

export async function dropTailorRequest(id: string): Promise<void> {
  await storage.removeItem(requestKey(id));
}

// ---- What a tailored resume remembers about its job.

export const KeywordSchema = z.object({
  term: z.string().min(1).max(80),
  /** Other spellings and full forms: "ML" and "machine learning". */
  aliases: z.array(z.string().max(80)).max(6).default([]),
  importance: z.enum(['must', 'nice']).default('must'),
});
export type Keyword = z.infer<typeof KeywordSchema>;

export const EligibilitySchema = z.object({
  text: z.string().min(1).max(300),
  /** block: the candidate clearly doesn't meet it; warn: unclear or partly. */
  level: z.enum(['block', 'warn']),
});
export type Eligibility = z.infer<typeof EligibilitySchema>;

/** Something the tailoring added that isn't in the candidate's data: shown for review. */
export const AssumedSchema = z.object({
  id: z.string(),
  /** line: a whole new line; skill: a term added to a skills line; claim: a keyword or number
   * that a reworded line or the summary now states. */
  kind: z.enum(['line', 'skill', 'claim']),
  text: z.string(),
  /** Where it is, for the reader: "Experience: Ledgerly", "Summary". */
  where: z.string(),
  sectionId: z.string().nullable().default(null),
  entryId: z.string().nullable().default(null),
});
export type Assumed = z.infer<typeof AssumedSchema>;

export const TailoringSchema = z.object({
  /** The master resume this copy was made from. */
  sourceResumeId: s,
  applicationId: z.string().nullable().default(null),
  job: JobPostSchema,
  keywords: z.array(KeywordSchema).default([]),
  eligibility: z.array(EligibilitySchema).default([]),
  /** Keyword match of the master resume, for the before and after. */
  scoreBefore: z.number().min(0).max(100).default(0),
  assumed: z.array(AssumedSchema).default([]),
  /** Lines and entries left out, most of them to fit two pages. */
  trimmed: z.array(z.string()).default([]),
  createdAt: s,
});
export type Tailoring = z.infer<typeof TailoringSchema>;

export const CoverLetterSchema = z.object({
  /** Plain text: greeting, paragraphs separated by blank lines, sign-off. */
  text: s,
  /** Shown under the header: "Hiring team, Acme". */
  recipient: s,
  date: s,
  updatedAt: s,
});
export type CoverLetter = z.infer<typeof CoverLetterSchema>;

// ---- Keyword match: deterministic, so the score before and after can be trusted. Recruiters'
// searches are literal (Greenhouse, Taleo) while ATS AI maps synonyms, so a term counts when its
// exact form, an alias, or a known equivalent appears as a whole word.

/** Lowercase words with the characters that make tech names (c++, c#, node.js, ci/cd) kept. */
export function normalizeForMatch(text: string): string {
  const t = text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[’'`]/g, '')
    // "CI / CD" and "CI/CD" are the same term.
    .replace(/\s*\/\s*/g, '/')
    .replace(/[^\p{L}\p{N}+#./&]+/gu, ' ')
    // A dot, slash, or ampersand that ends a word is punctuation, not part of a name ("python.").
    .replace(/[./&]+(?=\s|$)/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return ` ${t} `;
}

/** Equivalent names, any one of which counts for the others. Kept short and unambiguous. */
const EQUIVALENT: string[][] = [
  ['aws', 'amazon web services'],
  ['gcp', 'google cloud platform', 'google cloud'],
  ['azure', 'microsoft azure'],
  ['kubernetes', 'k8s'],
  ['node.js', 'nodejs', 'node js'],
  ['postgresql', 'postgres'],
  ['javascript', 'js'],
  ['typescript', 'ts'],
  ['machine learning', 'ml'],
  ['artificial intelligence', 'ai'],
  ['natural language processing', 'nlp'],
  ['large language models', 'large language model', 'llm', 'llms'],
  ['ci/cd', 'cicd', 'ci cd', 'continuous integration'],
  ['react', 'react.js', 'reactjs'],
  ['vue', 'vue.js', 'vuejs'],
  ['next.js', 'nextjs'],
  ['.net', 'dotnet'],
  ['golang', 'go'],
  ['scikit-learn', 'scikit learn', 'sklearn'],
  ['rest', 'restful', 'rest api', 'rest apis', 'restful api', 'restful apis'],
  ['mongodb', 'mongo'],
  ['sql server', 'mssql', 'ms sql'],
  ['power bi', 'powerbi'],
  ['object-oriented programming', 'oop'],
  ['data structures and algorithms', 'data structures & algorithms', 'dsa'],
];
const EQUIV = new Map<string, string[]>();
for (const group of EQUIVALENT)
  for (const name of group) EQUIV.set(normalizeForMatch(name).trim(), group);

/**
 * Names that are also ordinary words or letters (Go, C, R, Swift...): matched as written, and not
 * inside compounds, so "go-to-market", "C-level", and "a swift reply" don't count.
 */
const AMBIGUOUS = new Set([
  'go',
  'c',
  'r',
  'swift',
  'rust',
  'dart',
  'julia',
  'spring',
  'express',
  'chef',
  'ts',
  'js',
  'ml',
  'ai',
]);
/** Names that another, longer name contains: "React" alone isn't "React Native". */
const NOT_FOLLOWED: Record<string, RegExp> = {
  react: /^\s+native\b/i,
  java: /^\s*script\b/i,
};

function variants(term: string): string[] {
  const base = normalizeForMatch(term).trim();
  if (!base) return [];
  const out = new Set([base]);
  // Plurals: "API" / "APIs", "pipelines" / "pipeline", "processes" / "process", "libraries" / "library".
  if (/[a-z]$/.test(base)) {
    out.add(`${base}s`);
    if (/(s|x|z|ch|sh)$/.test(base)) out.add(`${base}es`);
    if (/[^aeiou]y$/.test(base)) out.add(`${base.slice(0, -1)}ies`);
  }
  if (/[^aeiou]ies$/.test(base)) out.add(`${base.slice(0, -3)}y`);
  if (/(s|x|z|ch|sh)es$/.test(base)) out.add(base.slice(0, -2));
  else if (/[a-z]s$/.test(base) && base.length > 3) out.add(base.slice(0, -1));
  // "Scikit-learn" and "scikit learn" and "scikitlearn".
  if (base.includes(' ')) out.add(base.replace(/ /g, ''));
  return [...out];
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * An ambiguous short name, as written in the text: its own case, no hyphen, dot, or ampersand
 * compound ("R&D" isn't R).
 */
function hasExact(raw: string, name: string): boolean {
  const re = new RegExp(
    `(?<![\\p{L}\\p{N}+#./&-])${escapeRe(name)}(?![\\p{L}\\p{N}+#&-]|\\.\\p{L})`,
    'gu',
  );
  for (const m of raw.matchAll(re)) {
    const after = raw.slice(m.index + m[0].length);
    const not = NOT_FOLLOWED[name.toLowerCase()];
    if (!not || !not.test(after)) return true;
  }
  return false;
}

function hasName(raw: string, norm: string, name: string): boolean {
  const key = normalizeForMatch(name).trim();
  if (!key) return false;
  if (AMBIGUOUS.has(key)) {
    // The name capitalized ("Go", "GO"), or as the post wrote it when that isn't all lowercase:
    // "go" and "ml" in lowercase are words ("ready to go"), whatever list they come from.
    const forms = new Set([key.toUpperCase(), key[0]!.toUpperCase() + key.slice(1)]);
    if (name.trim() !== key) forms.add(name.trim());
    return [...forms].some((f) => hasExact(raw, f));
  }
  const not = NOT_FOLLOWED[key];
  // A slash joins names ("ci/cd") or lists them ("git/github"): try the text both ways.
  const texts = norm.includes('/') ? [norm, norm.replace(/\//g, ' / ')] : [norm];
  return variants(name).some((v) =>
    texts.some((t) => {
      const needle = ` ${v} `;
      let at = t.indexOf(needle);
      while (at !== -1) {
        if (!not || !not.test(t.slice(at + needle.length - 1))) return true;
        at = t.indexOf(needle, at + 1);
      }
      return false;
    }),
  );
}

/** Does the text contain the keyword, one of its aliases, or a known equivalent? */
export function containsKeyword(
  raw: string,
  k: Pick<Keyword, 'term' | 'aliases'>,
  norm = normalizeForMatch(raw),
): boolean {
  const names = new Set<string>();
  for (const n of [k.term, ...k.aliases]) {
    names.add(n);
    for (const eq of EQUIV.get(normalizeForMatch(n).trim()) ?? []) names.add(eq);
  }
  return [...names].some((n) => hasName(raw, norm, n));
}

export interface KeywordMatch {
  /** 0 to 100: must-haves weigh 70%, nice-to-haves 30% (whichever exist). */
  score: number;
  found: Keyword[];
  missing: Keyword[];
  /** "X of Y must-haves". */
  mustFound: number;
  mustTotal: number;
}

export function matchKeywords(text: string, keywords: Keyword[]): KeywordMatch {
  const norm = normalizeForMatch(text);
  const found: Keyword[] = [];
  const missing: Keyword[] = [];
  for (const k of keywords) (containsKeyword(text, k, norm) ? found : missing).push(k);
  const must = keywords.filter((k) => k.importance === 'must');
  const nice = keywords.filter((k) => k.importance === 'nice');
  const cov = (list: Keyword[]) =>
    list.length ? list.filter((k) => found.includes(k)).length / list.length : null;
  const m = cov(must);
  const n = cov(nice);
  const score = m === null ? (n ?? 0) : n === null ? m : 0.7 * m + 0.3 * n;
  return {
    score: Math.round(100 * score),
    found,
    missing,
    mustFound: must.filter((k) => found.includes(k)).length,
    mustTotal: must.length,
  };
}

// ---- Number guard: a reworded line may not invent a metric.

/**
 * The numbers a line states ("80,000+ orders", "~12%", "1.5x", "900ms", "10k", "$2M"),
 * normalized. Digits inside names (S3, EC2, K8s, Web3, 3D, 5G) and ordinals (3rd) don't count.
 */
export function numbersIn(text: string): string[] {
  const out: string[] = [];
  const re =
    /(?<![\p{L}\d.,])(\d+(?:[.,]\d+)*)(?=(?:x|k|m|b|bn|ms|s|secs?|mins?|h|hrs?|yrs?|mo|wks?|kb|mb|gb|tb|pb|rps|qps|tps|fps|pp)?(?![\p{L}\d]))/giu;
  for (const m of text.matchAll(re)) {
    const raw = m[1]!;
    // "50,000" and "50000" are the same number; "1.5" keeps its point.
    const n = /^\d{1,3}(,\d{3})+$/.test(raw) ? raw.replace(/,/g, '') : raw.replace(',', '.');
    out.push(n.replace(/\.0+$/, ''));
  }
  return out;
}

/** True when every number in `next` also appears in `source`. */
export function keepsNumbers(source: string, next: string): boolean {
  const allowed = new Set(numbersIn(source));
  return numbersIn(next).every((n) => allowed.has(n));
}

/** Plain text of rich text, for matching. */
export const richPlain = (text: string) => plainText(text);
