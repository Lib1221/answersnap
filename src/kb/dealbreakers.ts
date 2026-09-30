import { DealbreakersSchema, type Dealbreakers } from '@/storage/schema';
import { IN_AFRICA } from './resume/tailorApply';
import type { JobPost } from './resume/tailoring';

// "Should I apply?": the candidate's own dealbreakers, checked in code against a job post
// before any tailoring (no AI, no cost). Every rule is off until the candidate sets it.

export { DealbreakersSchema, type Dealbreakers };
export const NO_DEALBREAKERS: Dealbreakers = DealbreakersSchema.parse({});

export interface Verdict {
  /** Dealbreakers the post hits: each one sentence. Empty means go ahead. */
  hits: string[];
  /** Things worth knowing that aren't dealbreakers ("No pay in the post"). */
  notes: string[];
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const has = (text: string, word: string) =>
  !!word.trim() &&
  new RegExp(`(^|[^\\p{L}\\p{N}])${esc(word.trim())}($|[^\\p{L}\\p{N}])`, 'iu').test(text);

// ---- Where.

const EUROPE =
  /\b(europe|european union|eu|portugal|spain|france|germany|italy|netherlands|belgium|ireland|austria|switzerland|poland|czech|slovakia|hungary|romania|bulgaria|greece|croatia|slovenia|serbia|sweden|norway|denmark|finland|estonia|latvia|lithuania|luxembourg|malta|cyprus|iceland|ukraine|united kingdom|uk|england|scotland|wales|lisbon|berlin|paris|madrid|london|amsterdam|dublin|warsaw)\b/i;
const MIDDLE_EAST =
  /\b(middle east|uae|united arab emirates|dubai|saudi arabia|qatar|kuwait|bahrain|oman|israel|jordan|lebanon|turkey|türkiye)\b/i;

/** Regions a job may name, and whether one of the candidate's places lies in it. */
const REGIONS: [RegExp, (place: string) => boolean][] = [
  [
    /\bEMEA\b/i,
    (p) => IN_AFRICA.test(p) || EUROPE.test(p) || MIDDLE_EAST.test(p) || /\bemea\b/i.test(p),
  ],
  [/\b(europe|european union|EU)\b/i, (p) => EUROPE.test(p)],
  [/\bafrica\b/i, (p) => IN_AFRICA.test(p) || /\bafrica\b/i.test(p)],
  [/\bmiddle east\b/i, (p) => MIDDLE_EAST.test(p)],
];

type Workplace = 'remote' | 'hybrid' | 'on-site' | '';

function workplaceOf(job: JobPost): Workplace {
  const said = `${job.workplace} ${job.location}`;
  if (/\bhybrid\b/i.test(said)) return 'hybrid';
  if (/\bon-?site\b/i.test(said)) return 'on-site';
  if (/\bremote\b/i.test(said)) return 'remote';
  return '';
}

function placeHits(job: JobPost, d: Dealbreakers): string[] {
  const where = workplaceOf(job);
  const out: string[] = [];
  if (d.remoteOnly && (where === 'hybrid' || where === 'on-site'))
    out.push(
      `It's ${where === 'hybrid' ? 'a hybrid' : 'an on-site'} job, and you only want remote work.`,
    );
  const places = d.places.map((p) => p.trim()).filter(Boolean);
  // The job's place, without the workplace word: "United States (Remote)" -> "United States".
  const loc = job.location
    .replace(/\((remote|hybrid|on-?site)\)/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!places.length || !loc || /\b(worldwide|anywhere|global)\b/i.test(loc)) return out;
  const inside =
    places.some((p) => has(loc, p) || has(p, loc)) ||
    REGIONS.some(([region, holds]) => region.test(loc) && places.some(holds));
  if (!inside)
    out.push(
      where === 'remote'
        ? `Remote in ${loc} only, outside where you can work. LinkedIn marks applicants from elsewhere "Not a fit".`
        : `It's in ${loc}, outside where you can work (${places.join(', ')}).`,
    );
  return out;
}

// ---- Pay.

const CURRENCIES: [RegExp, string][] = [
  [/^(C\$|CA\$|CAD)$/i, 'CAD'],
  [/^(A\$|AU\$|AUD)$/i, 'AUD'],
  [/^(\$|US\$|USD)$/i, 'USD'],
  [/^(€|EUR)$/i, 'EUR'],
  [/^(£|GBP)$/i, 'GBP'],
  [/^(₹|INR)$/i, 'INR'],
  [/^(ETB|Br|birr)$/i, 'ETB'],
  [/^(KES|KSh)$/i, 'KES'],
  [/^(NGN|₦)$/i, 'NGN'],
  [/^(ZAR|R)$/, 'ZAR'],
];
const CUR = 'C\\$|CA\\$|A\\$|AU\\$|US\\$|\\$|€|£|₹|₦|USD|EUR|GBP|CAD|AUD|INR|ETB|KES|NGN|ZAR';
const AMOUNT = '\\d[\\d,.]*\\s?[kKmM]?\\b';
const PAY = new RegExp(
  `(${CUR})\\s?(${AMOUNT})(?:\\s*(?:-|–|—|to)\\s*(?:${CUR})?\\s?(${AMOUNT}))?|(${AMOUNT})(?:\\s*(?:-|–|—|to)\\s*(${AMOUNT}))?\\s?(${CUR})\\b`,
  'g',
);

function amount(raw: string): number {
  const m = raw.trim().match(/^([\d,.]+)\s?([kKmM]?)$/);
  if (!m) return NaN;
  const digits = m[1]!.replace(/,(?=\d{3}\b)/g, '').replace(/,/g, '.');
  const n = Number(digits);
  return m[2]?.toLowerCase() === 'k' ? n * 1000 : m[2]?.toLowerCase() === 'm' ? n * 1e6 : n;
}

export interface Pay {
  currency: string;
  low: number;
  high: number;
  period: Dealbreakers['period'];
}

/** The pay a post states: currency, range, and period (read from the words after it). */
export function payIn(text: string): Pay | null {
  for (const m of text.matchAll(PAY)) {
    const cur = m[1] ?? m[6]!;
    const currency = CURRENCIES.find(([re]) => re.test(cur))?.[1];
    const low = amount(m[2] ?? m[4]!);
    const high = (m[3] ?? m[5]) ? amount((m[3] ?? m[5])!) : low;
    if (!currency || !Number.isFinite(low) || !Number.isFinite(high) || !low) continue;
    const after = text.slice(m.index! + m[0].length, m.index! + m[0].length + 30);
    const period: Pay['period'] | null = /^\s*(\/|per|an?|each)?\s*(hour|hr)\b|^\s*hourly/i.test(
      after,
    )
      ? 'hour'
      : /^\s*(\/|per|an?|each)?\s*(month|mo)\b|^\s*monthly/i.test(after)
        ? 'month'
        : /^\s*(\/|per|an?|each)?\s*(year|yr|annum)\b|^\s*(annually|yearly|annual)/i.test(after)
          ? 'year'
          : high >= 10_000
            ? 'year'
            : high <= 300
              ? 'hour'
              : null;
    if (period) return { currency, low: Math.min(low, high), high: Math.max(low, high), period };
  }
  return null;
}

const PER_YEAR = { year: 1, month: 12, hour: 2080 } as const;
const money = (n: number, currency: string, period: string) =>
  `${currency} ${Math.round(n).toLocaleString('en-US')} a ${period}`;

function payHits(job: JobPost, d: Dealbreakers, notes: string[]): string[] {
  if (!d.minPay) return [];
  const pay = payIn(job.text);
  if (!pay) {
    notes.push('The post states no pay.');
    return [];
  }
  if (pay.currency !== d.currency.toUpperCase()) {
    notes.push(`The post pays in ${pay.currency}; your minimum is in ${d.currency}.`);
    return [];
  }
  // In the candidate's period: an hourly rate is 2,080 hours a year.
  const top = (pay.high * PER_YEAR[pay.period]) / PER_YEAR[d.period];
  return top < d.minPay
    ? [
        `It pays up to ${money(top, pay.currency, d.period)}; your minimum is ${money(d.minPay, d.currency, d.period)}.`,
      ]
    : [];
}

// ---- Everything.

const NO_SPONSOR =
  /\b(no|not|unable to|cannot|can't|won't|will not|do not|don't|does not)\s+(provide\s+|offer\s+|able to\s+)?(visa\s+|work\s+)?sponsor|without (visa |work )?sponsorship|sponsorship (is )?(not|un)(available|offered|provided)/i;

export function checkDealbreakers(job: JobPost, d: Dealbreakers): Verdict {
  const notes: string[] = [];
  const hits = [...placeHits(job, d)];
  if (d.needsSponsorship && NO_SPONSOR.test(job.text))
    hits.push("The post doesn't sponsor visas, and you need sponsorship.");
  hits.push(...payHits(job, d, notes));
  for (const w of d.titleWords) if (has(job.title, w)) hits.push(`The title says "${w.trim()}".`);
  for (const c of d.companies)
    if (c.trim() && (has(job.company, c) || has(c, job.company)))
      hits.push(`It's at ${job.company}, a company on your list to skip.`);
  for (const w of d.avoidWords)
    if (has(`${job.title}\n${job.text}`, w)) hits.push(`The post mentions "${w.trim()}".`);
  return { hits, notes };
}
