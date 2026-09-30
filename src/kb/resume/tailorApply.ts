import { plainText, splitRich, type Unit } from '../richText';
import {
  newEntry,
  newId,
  newSection,
  sectionTitle,
  SECTION_SETUP,
  type Entry,
  type Resume,
  type Section,
} from './model';
import { formatDates, formatPlace } from './format';
import {
  containsKeyword,
  keepsNumbers,
  matchKeywords,
  normalizeForMatch,
  numbersIn,
  type Assumed,
  type Eligibility,
  type JobPost,
  type Keyword,
  type Tailoring,
} from './tailoring';

// Applying a tailoring to a copy of the master resume. The AI proposes, this file decides: every
// line it rewrites is checked against the line it came from, new lines follow the candidate's
// "answer confidently" setting and never carry numbers, experience and education keep their
// order and entries, and anything the candidate's data doesn't show is listed for review.

/** The AI's proposal, as parsed from its JSON (src/llm/tailor.ts). */
export interface TailorPatch {
  job: { title: string; company: string; location: string; workplace: string };
  keywords: Keyword[];
  eligibility: Eligibility[];
  headline: string;
  summary: string;
  entries: { id: string; lines: { from: string | null; text: string }[] }[];
  order: { section: string; entries: string[] }[];
  hide: string[];
}

/** Sections whose entries may be reordered or left out for a job. Jobs and degrees never are. */
const FLEXIBLE: ReadonlySet<Section['type']> = new Set([
  'projects',
  'skills',
  'certificates',
  'courses',
  'awards',
  'publications',
  'volunteering',
  'organisations',
  'interests',
  'languages',
  'custom',
]);
/** Sections whose entries may be left out entirely for a job. */
const HIDEABLE: ReadonlySet<Section['type']> = new Set([
  'projects',
  'certificates',
  'courses',
  'awards',
  'publications',
  'volunteering',
  'organisations',
  'custom',
]);
/** Fewest lines an experience entry keeps after tailoring. */
const MIN_JOB_LINES = 2;
const MAX_LINE_CHARS = 400;
const MAX_HEADLINE_CHARS = 160;

// ---- The outline the AI sees: short ids for sections (S1), entries (E1), and lines (E1.2).

export interface Outline {
  text: string;
  sections: Map<string, string>;
  entries: Map<string, { sectionId: string; entryId: string }>;
}

function entryHead(sec: Section, e: Entry): string {
  const dates = formatDates(e, { dateFormat: 'MM/YYYY', presentLabel: 'Present' });
  return [e.title, e.subtitle, e.info, dates, formatPlace(e)]
    .map((x) => x.trim())
    .filter(Boolean)
    .join(' | ');
}

export function outlineResume(r: Resume): Outline {
  const sections = new Map<string, string>();
  const entries = new Map<string, { sectionId: string; entryId: string }>();
  const out: string[] = [];
  if (r.personal.fullName) out.push(`Name: ${r.personal.fullName}`);
  if (r.personal.jobTitle) out.push(`Title line: ${r.personal.jobTitle}`);
  if (r.personal.location) out.push(`Location: ${r.personal.location}`);
  let s = 0;
  let e = 0;
  for (const sec of r.sections) {
    if (sec.hidden) continue;
    s += 1;
    const sid = `S${s}`;
    sections.set(sid, sec.id);
    out.push(`[${sid}] ${sectionTitle(sec)} (${sec.type})`);
    if (SECTION_SETUP[sec.type].textOnly) {
      if (sec.text.trim()) out.push(sec.text.trim());
      continue;
    }
    for (const entry of sec.entries) {
      if (entry.hidden) continue;
      e += 1;
      const eid = `E${e}`;
      entries.set(eid, { sectionId: sec.id, entryId: entry.id });
      out.push(` [${eid}] ${entryHead(sec, entry) || '(untitled)'}`);
      splitRich(entry.description).forEach((u, i) =>
        out.push(`  [${eid}.${i + 1}] ${u.text.replace(/^(- |\d+\. )/, '')}`),
      );
    }
  }
  return { text: out.join('\n'), sections, entries };
}

// ---- Plain text of a resume, for keyword matching.

export function resumeText(r: Resume): string {
  const parts: string[] = [r.personal.jobTitle];
  for (const sec of r.sections) {
    if (sec.hidden) continue;
    parts.push(sectionTitle(sec));
    if (SECTION_SETUP[sec.type].textOnly) parts.push(plainText(sec.text));
    for (const e of sec.entries)
      if (!e.hidden) parts.push(e.title, e.subtitle, e.info, plainText(e.description));
  }
  return parts.filter(Boolean).join('\n');
}

// ---- Eligibility: a small model can misplace a country in a region; catch the clear cases.

export const IN_AFRICA =
  /\b(ethiopia|kenya|nigeria|ghana|egypt|morocco|tunisia|algeria|south africa|rwanda|uganda|tanzania|senegal|cameroon|ivory coast|côte d[’']ivoire|zambia|zimbabwe|botswana|namibia|mozambique|malawi|sudan|somalia|eritrea|djibouti|madagascar|mauritius|angola|congo|benin|togo|burkina faso|mali|niger|chad|libya|gabon|liberia|sierra leone|guinea|gambia|lesotho|eswatini|addis ababa|nairobi|lagos|accra|cairo|kigali|kampala)\b/i;

/**
 * EMEA, Africa, or a worldwide region, which include every African country. "Anywhere in the US"
 * and South Africa (a country) don't count.
 */
function namesWideRegion(text: string): boolean {
  return /\b(emea|africa|worldwide|global|anywhere(?!\s+(?:in|within|across|inside)\b))\b/i.test(
    text.replace(/\bsouth africa\b/gi, ''),
  );
}

/** A country or region more specific than EMEA or worldwide: a limit of its own. */
function namesOtherRegion(text: string): boolean {
  return (
    /\b(?:US|USA|U\.S\.(?:A\.)?)(?![\p{L}])/u.test(text) ||
    /\b(?:united states|north america|americas?|canada|united kingdom|uk|britain|european union|eu|europe|european|latam|apac|asia|india|australia|new zealand|singapore|japan|china|brazil|mexico|germany|netherlands|france|spain|italy|ireland|poland|portugal|switzerland|sweden|israel|uae|south africa)\b/i.test(
      text,
    )
  );
}

/**
 * An eligibility item that says a candidate in Africa is outside EMEA, Africa, or a worldwide
 * region: wrong, since those include every African country.
 */
export function wrongRegionClaim(text: string, candidateLocation: string): boolean {
  if (!IN_AFRICA.test(candidateLocation)) return false;
  return (
    namesWideRegion(text) &&
    /\b(outside|not (?:in|within|part of)|isn[’']t in|is not in)\b/i.test(text)
  );
}

/**
 * An item about a region the candidate is in ("which falls within the EMEA region", or any EMEA,
 * Africa, or worldwide item for a candidate in Africa): not a limit. Items with a caveat ("but",
 * "not") or about something else as well (time zone hours, work authorization) stay.
 */
export function regionMet(text: string, candidateLocation: string): boolean {
  if (!namesWideRegion(text)) return false;
  if (
    /\b(outside|not|excluded|but|however|although|though|except|unless|only)\b|n[’']t\b/i.test(text)
  )
    return false;
  const rest = text.replace(candidateLocation, '').replace(/\((?:gmt|utc)[^)]*\)/gi, '');
  if (
    /\b(time ?zones?|hours?|overlap|cet|cest|utc|gmt|authori[sz]|visa|citizen|relocat|clearance|travel|on-?site|office|hybrid|degree)/i.test(
      rest,
    ) ||
    namesOtherRegion(rest)
  )
    return false;
  // Only when the item itself says the candidate is inside: dropping a real limit costs more
  // than showing one that isn't.
  return /\b(falls? within|(?:is|are|lies?) (?:with)?in|part of|inside|included in)\b/i.test(text);
}

/**
 * "5+ years of experience required" when the dated jobs already add up to 5 or more. Years of one
 * skill ("5+ years of React Native"), a caveat ("none", "but"), or a degree stay.
 */
export function yearsMet(text: string, years: number): boolean {
  if (!years) return false;
  if (/\b(none|no|not|but|only|without|however|although)\b|n[’']t\b/i.test(text)) return false;
  if (/\b(degree|visa|authori[sz])/i.test(text)) return false;
  if (
    /\byears? (?:of|with|in|using) (?!(?:professional |relevant |industry |work |hands-on |total )?experience\b)/i.test(
      text,
    ) ||
    /\bexperience (?:with|in|using|building|on)\b/i.test(text)
  )
    return false;
  const all = [...text.matchAll(/\b(\d{1,2})\+?\s*(?:years?|yrs?)\b/gi)].map((m) => Number(m[1]));
  return all.length > 0 && years >= Math.max(...all);
}

// ---- Seniority and years: claims a title line or summary may not raise.

const SENIORITY =
  /\b(senior|sr|lead|principal|staff|head|chief|director|manager|vp|vice president|architect)\b/gi;

/** Seniority words in a title line that none of the candidate's own titles contain. */
export function unheldSeniority(headline: string, master: Resume): string[] {
  const held = [
    master.personal.jobTitle,
    ...master.sections
      .filter((s) => s.type === 'experience')
      .flatMap((s) => s.entries.map((e) => e.title)),
  ]
    .join(' ')
    .toLowerCase();
  const words = new Set(
    [...headline.matchAll(SENIORITY)].map((m) => m[1]!.toLowerCase().replace(/^sr$/, 'senior')),
  );
  return [...words].filter((w) => !new RegExp(`\\b${w}\\b`).test(held));
}

const ROLE =
  '(?:(?:software|backend|back-end|frontend|front-end|full[- ]stack|data|ml|machine learning|ai|devops|platform|cloud|mobile|web|security|qa|product|engineering|research|solutions?|systems?)\\s+)*(?:engineers?|developers?|scientists?|analysts?|architects?|designers?|consultants?|leads?)';
const TITLE_SENIORITY = new RegExp(
  `\\b(senior|sr|lead|principal|staff|head|chief|director|manager|vp|architect)\\.?\\s+${ROLE}\\b|\\b(?:tech|team|technical)\\s+(lead)\\b|\\b(head|director|vp)\\s+of\\b|\\b(?:engineering|product|project|program|delivery)\\s+(manager)\\b|\\b(?:software|solutions?|cloud|data|systems?|enterprise|ml|ai)\\s+(architect)\\b`,
  'gi',
);

/**
 * Seniority a summary claims as a title ("Senior backend engineer", "tech lead", "head of data")
 * that none of the candidate's own titles show. "Lead a team" and "product managers" aren't titles.
 */
export function summarySeniority(summary: string, master: Resume): string[] {
  const words = new Set<string>();
  for (const m of summary.matchAll(TITLE_SENIORITY)) {
    const w = (m[1] ?? m[2] ?? m[3] ?? m[4] ?? m[5])!.toLowerCase();
    words.add(w === 'sr' ? 'senior' : w);
  }
  return [...words].filter((w) => unheldSeniority(w, master).length > 0);
}

const monthIndex = (ym: string): number | null => {
  const m = ym.match(/^(\d{4})(?:-(\d{2}))?$/);
  return m ? Number(m[1]) * 12 + (m[2] ? Number(m[2]) - 1 : 0) : null;
};

/** Years of experience from the dated jobs, overlaps counted once (to the nearest half year). */
export function experienceYears(master: Resume, now = new Date()): number {
  const nowIdx = now.getFullYear() * 12 + now.getMonth();
  const spans: [number, number][] = [];
  for (const s of master.sections)
    if (s.type === 'experience')
      for (const e of s.entries) {
        const start = monthIndex(e.start);
        const end = e.present ? nowIdx : monthIndex(e.end);
        if (start !== null && end !== null && end >= start) spans.push([start, end + 1]);
      }
  spans.sort((a, b) => a[0] - b[0]);
  let months = 0;
  let [from, to] = [-1, -1];
  for (const [a, b] of spans) {
    if (a > to) {
      months += to - from;
      [from, to] = [a, b];
    } else to = Math.max(to, b);
  }
  months += to - from;
  return Math.round((months / 12) * 2) / 2;
}

/** "5+ years", "5 years" in a text: the numbers claimed. */
function yearsClaimed(text: string): number[] {
  return [...plainText(text).matchAll(/\b(\d{1,2})(?:\.\d)?\+?\s*(?:years?|yrs?)\b/gi)].map((m) =>
    Number(m[1]),
  );
}

// ---- Rebuilding a description from its pieces.

function stripMarker(text: string): string {
  return text.replace(/^(- |\d+\. )/, '').trim();
}

/** Paragraphs stay paragraphs, list items become "- " bullets (numbered lists are renumbered). */
export function joinUnits(units: Unit[]): string {
  const out: string[] = [];
  let prev: Unit['kind'] | null = null;
  let n = 0;
  let numbered = false;
  for (const u of units) {
    const body = stripMarker(u.text);
    if (!body) continue;
    if (u.kind === 'p') {
      if (prev) out.push('');
      out.push(body);
      n = 0;
    } else {
      if (prev === 'p') out.push('');
      const isNumbered = /^\d+\. /.test(u.text);
      if (isNumbered) {
        n = prev === 'li' && numbered ? n + 1 : 1;
        out.push(`${n}. ${body}`);
      } else out.push(`- ${body}`);
      numbered = isNumbered;
    }
    prev = u.kind;
  }
  return out.join('\n');
}

/** Items of a skills line: "Python, Java, React" or "Git / GitHub". */
/** Items of a skills line, split on commas and the like, never inside parentheses. */
function skillItems(line: string): string[] {
  const text = stripMarker(line);
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of text) {
    if (ch === '(' || ch === '[') depth++;
    if ((ch === ')' || ch === ']') && depth) depth--;
    if (!depth && /[,;|•·]/.test(ch)) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out.map((x) => x.trim()).filter(Boolean);
}

/** A skills line's leading group label ("**Languages:** "), kept in front and in its own marks. */
const SKILL_LABEL = /^(\*{0,3}[^:*,\n]{2,40}?\*{0,3}:\*{0,3}\s+)(?=\S)/;

function splitLabel(line: string): { label: string; items: string[] } {
  const body = stripMarker(line);
  const label = body.match(SKILL_LABEL)?.[1] ?? '';
  return { label, items: skillItems(body.slice(label.length)) };
}

// ---- What a rewrite must keep: the line's tools and terms, and its tense.

/**
 * The technical terms of a line: items in parentheses, acronyms, capitalized names, and words
 * with digits or symbols (TF-IDF, Node.js, CI/CD). The first word (a verb) doesn't count.
 */
export function termsOf(line: string): string[] {
  const plain = plainText(stripMarker(line));
  const out = new Set<string>();
  for (const m of plain.matchAll(/\(([^)]+)\)/g))
    for (const part of m[1]!.split(/\s*(?:,|;|\band\b|\bor\b)\s*/))
      if (part.trim() && part.trim().length <= 40) out.add(part.trim());
  const words = [...plain.matchAll(/[\p{L}][\p{L}\p{N}+#.\-/]*[\p{L}\p{N}+#]|[\p{L}]/gu)];
  words.forEach((m, i) => {
    const w = m[0];
    if (i === 0 || w.length < 2) return;
    if (/\p{Lu}.*\p{Lu}|[\p{N}+#]|[.\-/]\p{L}/u.test(w) || /^\p{Lu}/u.test(w)) out.add(w);
  });
  return [...out];
}

const PAST_IRREGULAR = new Set(
  'built led ran wrote made drove grew won cut set took gave sold taught brought kept held met spoke chose began became found shipped spent sent put read saw thought told understood went oversaw undertook rebuilt rewrote overcame withdrew'.split(
    ' ',
  ),
);
/** Does a line start with a past-tense verb ("Built", "Designed")? */
function startsPast(line: string): boolean {
  const w =
    plainText(stripMarker(line))
      .split(/\s/)[0]
      ?.toLowerCase()
      .replace(/[^a-z]/g, '') ?? '';
  return PAST_IRREGULAR.has(w) || (/ed$/.test(w) && w.length > 3);
}

/**
 * Why a rewrite of a line can't be used, or null when it can: it changed a number, dropped one of
 * the line's tools or terms, changed its tense, or brought in a job keyword the candidate's data
 * never mentions.
 */
export function rewriteProblem(
  source: string,
  next: string,
  keywords: Keyword[],
  knownRaw: string,
  knownNorm: string,
): string | null {
  if (!keepsNumbers(source, next)) return 'changed a number';
  const nextNorm = normalizeForMatch(next);
  const dropped = termsOf(source).filter(
    (t) => !nextNorm.includes(` ${normalizeForMatch(t).trim()} `),
  );
  if (dropped.length) return `dropped ${dropped.join(', ')}`;
  if (startsPast(source) && !startsPast(next)) return 'changed the tense';
  const sourceNorm = normalizeForMatch(source);
  const added = keywords.filter(
    (k) =>
      containsKeyword(next, k, nextNorm) &&
      !containsKeyword(source, k, sourceNorm) &&
      !containsKeyword(knownRaw, k, knownNorm),
  );
  if (added.length) return `added ${added.map((k) => k.term).join(', ')}`;
  return null;
}

/** Bold spans of the original line ("**2 million** requests") put back when the rewrite kept the words. */
export function restoreBold(source: string, next: string): string {
  let out = next;
  for (const m of source.matchAll(/\*\*(.+?)\*\*/g)) {
    const span = m[1]!;
    if (out.includes(`**${span}**`)) continue;
    const at = out.indexOf(span);
    // Only a whole occurrence that isn't already inside bold marks.
    if (at !== -1 && !/\*\*$/.test(out.slice(0, at)))
      out = `${out.slice(0, at)}**${span}**${out.slice(at + span.length)}`;
  }
  return out;
}

/** A rewrite ends like its source line: no closing period on a line that had none. */
export function endLike(source: string, next: string): string {
  if (/[.!?]\**\s*$/.test(source)) return next;
  return next.replace(/\.(\**)\s*$/, '$1');
}

/**
 * A skills line after tailoring: every original item kept (in the new order where the model
 * reordered them), plus only the job's keywords the resume doesn't list anywhere else.
 */
function mergeSkills(
  source: string,
  next: string,
  keywords: Keyword[],
  elsewhere: string,
): { text: string; added: string[] } {
  const norm = (x: string) => normalizeForMatch(x).trim();
  const { label, items: orig } = splitLabel(source);
  const origSet = new Set(orig.map(norm));
  const elsewhereNorm = normalizeForMatch(elsewhere);
  const out: string[] = [];
  const added: string[] = [];
  /** Originals the job's spelling of the same name replaced ("Postgres" for "PostgreSQL"). */
  const replaced = new Set<string>();
  const isKeyword = (n: string) =>
    keywords.some((k) => [k.term, ...k.aliases].some((t) => norm(t) === n));
  for (const raw of splitLabel(next).items) {
    // "Tools & Platforms: Docker": the model named the group inside the line.
    const item = raw.replace(/^[^:]{2,40}:\s+(?=\S)/, (m) => (origSet.has(norm(m)) ? m : ''));
    const n = norm(item);
    if (!n || out.some((o) => norm(o) === n)) continue;
    // An original item as the resume writes it, whatever case or punctuation the model gave it.
    if (origSet.has(n)) {
      if (!replaced.has(n)) out.push(orig.find((o) => norm(o) === n) ?? item);
      continue;
    }
    // The same name as an original, spelled another way: one of them, never both. The job's
    // spelling wins, since recruiters search for it.
    const twin = orig.find(
      (o) =>
        containsKeyword(o, { term: item, aliases: [] }) &&
        containsKeyword(item, { term: o, aliases: [] }),
    );
    if (twin) {
      if (out.some((o) => norm(o) === norm(twin)) || !isKeyword(n)) continue;
      replaced.add(norm(twin));
      out.push(item.replace(/\.$/, ''));
      continue;
    }
    if (
      keywords.some((k) => containsKeyword(item, k)) &&
      !keywords.some(
        (k) => containsKeyword(item, k) && containsKeyword(elsewhere, k, elsewhereNorm),
      )
    ) {
      const clean = item.replace(/\.$/, '');
      out.push(clean);
      added.push(clean);
    }
  }
  for (const item of orig)
    if (!replaced.has(norm(item)) && !out.some((o) => norm(o) === norm(item))) out.push(item);
  return { text: label + out.join(', '), added };
}

// ---- Apply.

export interface ApplyContext {
  job: JobPost;
  applicationId: string | null;
  /** Everything known about the candidate (master resume and other data), for honesty checks. */
  knownText: string;
  /** "Answer confidently": new lines for uncovered requirements are allowed, and flagged. */
  fillGaps: boolean;
  now?: Date;
}

export interface ApplyResult {
  resume: Resume;
  /** Proposals refused by the checks, for the report and for tests. */
  rejected: string[];
}

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

function whereLabel(sec: Section, e?: Entry): string {
  const name = sectionTitle(sec);
  const what = e ? e.subtitle || e.title : '';
  return what ? `${name}: ${what}` : name;
}

export function applyTailoring(master: Resume, patch: TailorPatch, ctx: ApplyContext): ApplyResult {
  const now = (ctx.now ?? new Date()).toISOString();
  const outline = outlineResume(master);
  const r = clone(master);
  // A photo the design doesn't show isn't copied into every tailored copy (storage is limited).
  if (r.design.photo === 'none') r.personal.photo = '';
  const rejected: string[] = [];
  const assumed: Assumed[] = [];
  const known = normalizeForMatch(ctx.knownText);
  const knownRaw = ctx.knownText;
  const knownNumbers = new Set(numbersIn(ctx.knownText));
  const addAssumed = (a: Omit<Assumed, 'id'>) => assumed.push({ id: newId('a'), ...a });

  const findEntry = (eid: string) => {
    const ref = outline.entries.get(eid.trim().toUpperCase());
    if (!ref) return null;
    const sec = r.sections.find((x) => x.id === ref.sectionId);
    const entry = sec?.entries.find((x) => x.id === ref.entryId);
    return sec && entry ? { sec, entry, eid: eid.trim().toUpperCase() } : null;
  };

  // Title line.
  const headline = patch.headline.replace(/\s+/g, ' ').trim();
  if (headline && headline.length <= MAX_HEADLINE_CHARS) {
    r.personal.jobTitle = headline;
    for (const w of unheldSeniority(headline, master))
      addAssumed({
        kind: 'claim',
        text: `Your title line says "${w}", a level your own job titles don't show.`,
        where: 'Title line',
        sectionId: null,
        entryId: null,
      });
  }
  const years = experienceYears(master, ctx.now);

  // Summary: into the profile section (added at the top when the master has none).
  const summary = patch.summary.trim();
  if (summary) {
    let profile = r.sections.find((x) => x.type === 'profile');
    if (!profile) {
      profile = newSection('profile');
      r.sections.unshift(profile);
    }
    profile.hidden = false;
    profile.text = summary;
    for (const w of summarySeniority(summary, master))
      addAssumed({
        kind: 'claim',
        text: `The summary says "${w}", a level your own job titles don't show.`,
        where: sectionTitle(profile),
        sectionId: profile.id,
        entryId: null,
      });
    for (const claimed of yearsClaimed(summary))
      if (years && claimed > years + 0.5)
        addAssumed({
          kind: 'claim',
          text: `The summary says ${claimed} years; your dated jobs add up to about ${years}.`,
          where: sectionTitle(profile),
          sectionId: profile.id,
          entryId: null,
        });
    for (const n of numbersIn(summary))
      if (!knownNumbers.has(n))
        addAssumed({
          kind: 'claim',
          text: `The summary says "${n}". Check it's true.`,
          where: sectionTitle(profile),
          sectionId: profile.id,
          entryId: null,
        });
  }

  // Lines of entries.
  for (const change of patch.entries) {
    const found = findEntry(change.id);
    if (!found) {
      rejected.push(`Unknown entry ${change.id}`);
      continue;
    }
    const { sec, entry, eid } = found;
    const source = splitRich(entry.description);
    const used = new Set<number>();
    const next: Unit[] = [];
    const isSkills = sec.type === 'skills';
    for (const line of change.lines) {
      const text = line.text.replace(/\s+/g, ' ').trim().slice(0, MAX_LINE_CHARS);
      if (!text) continue;
      const m = line.from
        ?.trim()
        .toUpperCase()
        .match(/^(E\d+)\.(\d+)$/);
      if (line.from && m) {
        const idx = Number(m[2]) - 1;
        if (m[1] !== eid || !source[idx] || used.has(idx)) {
          rejected.push(`${eid}: line ${line.from} isn't one of its lines`);
          continue;
        }
        used.add(idx);
        const src = source[idx]!;
        if (isSkills) {
          // Skills lines keep every item; only the job's missing keywords may join them.
          // Everything else in the resume, this entry's other lines included.
          const elsewhere = resumeText({
            ...r,
            sections: r.sections.map((x) =>
              x.id === sec.id
                ? {
                    ...x,
                    entries: x.entries.map((e) =>
                      e.id === entry.id
                        ? { ...e, description: joinUnits(source.filter((_, j) => j !== idx)) }
                        : e,
                    ),
                  }
                : x,
            ),
          });
          const merged = mergeSkills(src.text, text, patch.keywords, elsewhere);
          next.push({ kind: src.kind, text: merged.text });
          for (const item of merged.added)
            if (!containsKeyword(knownRaw, { term: item, aliases: [] }, known))
              addAssumed({
                kind: 'skill',
                text: item,
                where: whereLabel(sec, entry),
                sectionId: sec.id,
                entryId: entry.id,
              });
          continue;
        }
        const problem = rewriteProblem(src.text, text, patch.keywords, knownRaw, known);
        if (problem) {
          // Keep the original line: a rewrite may only reword what's true.
          rejected.push(`${eid}.${idx + 1}: ${problem}`);
          next.push(src);
          continue;
        }
        const bolded = endLike(src.text, restoreBold(src.text, text));
        next.push({ kind: src.kind, text: /^\d+\. /.test(src.text) ? `1. ${bolded}` : bolded });
        continue;
      }
      // A new line: only when answering confidently, never with numbers.
      if (!ctx.fillGaps) {
        rejected.push(`${eid}: new line not allowed`);
        continue;
      }
      if (numbersIn(text).length) {
        rejected.push(`${eid}: new line with a number`);
        continue;
      }
      // A skills list takes items ("PyTorch, TensorFlow"), not sentences.
      if (isSkills && skillItems(text).some((item) => item.split(/\s+/).length > 4)) {
        rejected.push(`${eid}: new skills line reads like a sentence`);
        continue;
      }
      const body = stripMarker(text);
      const added = isSkills ? body.replace(/\.$/, '') : endLike(source[0]?.text ?? '', body);
      next.push({ kind: 'li', text: added });
      addAssumed({
        kind: isSkills ? 'skill' : 'line',
        text: added,
        where: whereLabel(sec, entry),
        sectionId: sec.id,
        entryId: entry.id,
      });
    }
    // Skills lines keep every item, so a line the patch left out (or emptied) stays too.
    if (isSkills) source.forEach((u, i) => used.has(i) || next.push(u));
    // A job keeps at least two of its own lines (or all it had), whatever lines were added:
    // refill from its own lines, in order.
    if (sec.type === 'experience') {
      const keep = Math.min(MIN_JOB_LINES, source.length);
      for (let i = 0; used.size < keep && i < source.length; i++)
        if (!used.has(i)) {
          used.add(i);
          next.push(source[i]!);
        }
    }
    if (!next.length && source.length) continue; // nothing usable: leave the entry as it was
    entry.description = joinUnits(next);
  }

  // Order within flexible sections.
  for (const o of patch.order) {
    const sectionId = outline.sections.get(o.section.trim().toUpperCase());
    const sec = r.sections.find((x) => x.id === sectionId);
    if (!sec || !FLEXIBLE.has(sec.type)) continue;
    const wanted: string[] = [];
    for (const eid of o.entries) {
      const f = findEntry(eid);
      if (f && f.sec.id === sec.id && !wanted.includes(f.entry.id)) wanted.push(f.entry.id);
    }
    const rank = (id: string) => {
      const i = wanted.indexOf(id);
      return i === -1 ? wanted.length : i;
    };
    sec.entries = sec.entries
      .map((entry, i) => ({ entry, i }))
      .sort((a, b) => rank(a.entry.id) - rank(b.entry.id) || a.i - b.i)
      .map((x) => x.entry);
  }

  // Entries left out for this job: only in hideable sections, and one always stays.
  const trimmed: string[] = [];
  for (const eid of patch.hide) {
    const f = findEntry(eid);
    if (!f || !HIDEABLE.has(f.sec.type)) continue;
    const visible = f.sec.entries.filter((x) => !x.hidden);
    if (visible.length <= 1) continue;
    // Never hide the only place a job keyword appears.
    if (losesKeyword(r, f.entry, patch.keywords)) continue;
    f.entry.hidden = true;
    trimmed.push(`Left out for this job: ${f.entry.title || f.entry.subtitle}`);
  }

  // Job keywords the tailored resume now states but the candidate's data never does, at each
  // place a reader sees them (title line, summary, entries). A place that already flags the
  // keyword (a new line or skill) isn't flagged twice; a flag elsewhere doesn't count.
  for (const k of patch.keywords) {
    if (containsKeyword(knownRaw, k, known)) continue;
    for (const hit of keywordPlaces(r, k)) {
      const flagged = assumed.some(
        (a) =>
          a.sectionId === hit.sectionId && a.entryId === hit.entryId && containsKeyword(a.text, k),
      );
      if (flagged) continue;
      addAssumed({
        kind: 'claim',
        text: `Mentions "${k.term}", which isn't in your resume or profile.`,
        where: hit.where,
        sectionId: hit.sectionId,
        entryId: hit.entryId,
      });
    }
  }

  const job = ctx.job;
  const one = (x: string, max: number) => x.replace(/\s+/g, ' ').trim().slice(0, max);
  const company = one(patch.job.company, 300) || job.company;
  const title = one(patch.job.title, 300) || job.title;
  const tailoring: Tailoring = {
    sourceResumeId: master.id,
    applicationId: ctx.applicationId,
    job: {
      ...job,
      title: title || job.title,
      company: company || job.company,
      location: job.location || one(patch.job.location, 300),
      workplace: job.workplace || one(patch.job.workplace, 60),
    },
    keywords: dedupeKeywords(patch.keywords),
    eligibility: patch.eligibility
      .map((e) => ({ ...e, text: one(e.text, 300) }))
      .filter((e) => e.text)
      .filter((e) => !wrongRegionClaim(e.text, master.personal.location))
      .filter((e) => !regionMet(e.text, master.personal.location))
      .filter((e) => !yearsMet(e.text, years))
      .slice(0, 8),
    scoreBefore: matchKeywords(resumeText(master), patch.keywords).score,
    assumed,
    trimmed,
    createdAt: now,
  };

  return {
    resume: {
      ...r,
      id: newId('r'),
      name:
        [company, title].filter(Boolean).join(' – ').slice(0, 120) || `${master.name} (tailored)`,
      createdAt: now,
      updatedAt: now,
      master: false,
      tailoring,
      coverLetter: null,
    },
    rejected,
  };
}

function dedupeKeywords(list: Keyword[]): Keyword[] {
  const seen = new Set<string>();
  const out: Keyword[] = [];
  for (const k of list) {
    const term = k.term.replace(/\s+/g, ' ').trim();
    const key = normalizeForMatch(term).trim();
    if (!key || term.length > 80 || seen.has(key)) continue;
    seen.add(key);
    out.push({
      ...k,
      term,
      aliases: k.aliases
        .map((a) => a.replace(/\s+/g, ' ').trim())
        .filter((a) => a && a.length <= 80)
        .slice(0, 6),
    });
  }
  return out.slice(0, 30);
}

interface Place {
  where: string;
  sectionId: string | null;
  entryId: string | null;
}

/** Every visible place a keyword appears: the title line, a text section, or an entry. */
function keywordPlaces(r: Resume, k: Keyword): Place[] {
  const out: Place[] = [];
  if (containsKeyword(r.personal.jobTitle, k))
    out.push({ where: 'Title line', sectionId: null, entryId: null });
  for (const sec of r.sections) {
    if (sec.hidden) continue;
    if (SECTION_SETUP[sec.type].textOnly && containsKeyword(plainText(sec.text), k))
      out.push({ where: sectionTitle(sec), sectionId: sec.id, entryId: null });
    for (const e of sec.entries) {
      if (e.hidden) continue;
      const text = [e.title, e.subtitle, e.info, plainText(e.description)].join('\n');
      if (containsKeyword(text, k))
        out.push({ where: whereLabel(sec, e), sectionId: sec.id, entryId: e.id });
    }
  }
  return out;
}

/** Would leaving out this entry (or a line of it) drop a job keyword the resume shows nowhere else? */
function losesKeyword(r: Resume, entry: Entry, keywords: Keyword[], line?: Unit): boolean {
  if (!keywords.length) return false;
  const without: Resume = {
    ...r,
    sections: r.sections.map((s) => ({
      ...s,
      entries: s.entries.map((e) => {
        if (e.id !== entry.id) return e;
        if (!line) return { ...e, hidden: true };
        return {
          ...e,
          description: joinUnits(splitRich(e.description).filter((u) => u.text !== line.text)),
        };
      }),
    })),
  };
  const before = matchKeywords(resumeText(r), keywords);
  const after = matchKeywords(resumeText(without), keywords);
  return after.found.length < before.found.length;
}

// ---- Fitting a tailored resume to its page limit, one small cut at a time.

export interface Trim {
  resume: Resume;
  note: string;
}

/**
 * The next cut when a tailored resume runs over its page limit, or null when nothing more can go.
 * Cuts, in order: projects beyond the best two; the last (least relevant) line of the longest job
 * or project, keeping two lines each; projects beyond the best one. Jobs, degrees, skills, and the
 * summary are never cut.
 */
export function nextTrim(resume: Resume): Trim | null {
  const r = clone(resume);
  const keywords = r.tailoring?.keywords ?? [];
  const projects = r.sections.filter((s) => !s.hidden && HIDEABLE.has(s.type));
  const visibleProjects = projects.flatMap((s) =>
    s.entries.filter((e) => !e.hidden).map((e) => ({ s, e })),
  );
  // The least relevant project (last) that doesn't carry a keyword found nowhere else, else the
  // last one when every candidate does (the page limit wins over one keyword).
  const hideLast = (min: number, safeOnly: boolean): Trim | null => {
    if (visibleProjects.length <= min) return null;
    const pick = [...visibleProjects]
      .reverse()
      .find(({ e }) => !safeOnly || !losesKeyword(r, e, keywords));
    if (!pick) return null;
    pick.e.hidden = true;
    return { resume: r, note: `Left out to fit the pages: ${pick.e.title || pick.e.subtitle}` };
  };
  const cut = hideLast(2, true);
  if (cut) return cut;

  // The last (least relevant) line of the longest job or project, sparing keyword lines.
  const longest: { e: Entry; units: Unit[] }[] = [];
  for (const s of r.sections) {
    if (s.hidden || (s.type !== 'experience' && !HIDEABLE.has(s.type))) continue;
    for (const e of s.entries) {
      if (e.hidden) continue;
      const units = splitRich(e.description);
      if (units.length > 2) longest.push({ e, units });
    }
  }
  longest.sort((a, b) => b.units.length - a.units.length);
  const cutLine = (safeOnly: boolean): Trim | null => {
    for (const { e, units } of longest)
      for (let i = units.length - 1; i >= 2; i--) {
        const unit = units[i]!;
        // A "Tech: ..." or "Tools: ..." line stays: it names the stack.
        if (
          /^(- |\d+\. )?[*_]*(tech|technologies|tech stack|stack|tools)[*_]*\s*:/i.test(unit.text)
        )
          continue;
        if (safeOnly && losesKeyword(r, e, keywords, unit)) continue;
        units.splice(i, 1);
        e.description = joinUnits(units);
        return {
          resume: r,
          note: `Shortened ${e.subtitle || e.title}: "${stripMarker(plainText(unit.text)).slice(0, 80)}"`,
        };
      }
    return null;
  };
  // Nothing that loses a job keyword goes while something that doesn't can.
  return cutLine(true) ?? hideLast(1, true) ?? cutLine(false) ?? hideLast(1, false);
}

/**
 * Remove an addition the candidate doesn't want: a new line, a new skills line, an item added to
 * a skills line, or the skill entry "Add to skills" made. A claim inside a sentence can't be cut
 * out, so it's only taken off the list.
 */
export function removeAssumed(resume: Resume, a: Assumed): Resume {
  const r = clone(resume);
  if (r.tailoring) r.tailoring.assumed = r.tailoring.assumed.filter((x) => x.id !== a.id);
  const sec = r.sections.find((s) => s.id === a.sectionId);
  const entry = sec?.entries.find((e) => e.id === a.entryId);
  if (!sec || !entry || a.kind === 'claim') return r;
  const flat = (x: string) => normalizeForMatch(plainText(stripMarker(x))).trim();
  const target = flat(a.text);
  const units = splitRich(entry.description);
  if (a.kind === 'line') {
    const i = units.findIndex((u) => flat(u.text) === target);
    if (i !== -1) units.splice(i, 1);
  } else {
    // The entry "Add to skills" made (a skill as its own title).
    if (!entry.description.trim() && flat(entry.title) === target) {
      sec.entries = sec.entries.filter((e) => e.id !== entry.id);
      return r;
    }
    const itemsOf = (x: string) => splitLabel(x).items.map(flat);
    const wanted = itemsOf(a.text).join(',');
    const whole = units.findIndex((u) => itemsOf(u.text).join(',') === wanted);
    if (whole !== -1) units.splice(whole, 1);
    else
      for (const u of units) {
        const { label, items } = splitLabel(u.text);
        const at = items.findIndex((x) => flat(x) === target);
        if (at === -1) continue;
        items.splice(at, 1);
        if (!items.length) units.splice(units.indexOf(u), 1);
        else u.text = `${u.kind === 'li' ? '- ' : ''}${label}${items.join(', ')}`;
        break;
      }
  }
  entry.description = joinUnits(units);
  return r;
}

/**
 * "Add to skills" for a keyword the resume is missing: appended to the first skills line (or a
 * new Skills section), and listed for review like every other addition.
 */
export function addSkill(resume: Resume, term: string): Resume {
  const r = clone(resume);
  const clean = term.replace(/\s+/g, ' ').trim().slice(0, 80);
  if (!clean) return r;
  let sec = r.sections.find((s) => s.type === 'skills' && !s.hidden);
  if (!sec) {
    sec = newSection('skills');
    r.sections.push(sec);
  }
  const group = sec.entries.find((e) => !e.hidden && e.description.trim());
  let entryId: string;
  if (group) {
    const units = splitRich(group.description);
    const first = units[0]!;
    const { label, items } = splitLabel(first.text);
    first.text = `${first.kind === 'li' ? '- ' : ''}${label}${[...items, clean].join(', ')}`;
    group.description = joinUnits(units);
    entryId = group.id;
  } else {
    const e = newEntry({ title: clean });
    sec.entries.push(e);
    entryId = e.id;
  }
  r.tailoring?.assumed.push({
    id: newId('a'),
    kind: 'skill',
    text: clean,
    where: whereLabel(
      sec,
      sec.entries.find((e) => e.id === entryId),
    ),
    sectionId: sec.id,
    entryId,
  });
  return r;
}
