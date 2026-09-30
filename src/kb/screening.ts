import type { CandidateProfile } from './profileSchema';
import { isPresent, toMonthYear } from './resume/format';
import type { Resume } from './resume/model';
import { containsKeyword } from './resume/tailoring';
import { plainText } from './richText';
import type { FieldInfo } from '@/storage/schema';

// Screening questions (LinkedIn Easy Apply and ATS forms): the ones that can reject an
// application on their own are answered from the candidate's data by code, or left to the
// candidate. Only the rest go to the model. Why: the model would claim the job's minimum
// ("3 years of Kubernetes"), LinkedIn saves that answer for later applications, and its hiring
// AI checks answers against the resume.

// ---- Years of work with a skill, from dated jobs.

export interface DatedWork {
  /** "Backend Engineer, Ledgerly": shown so the candidate sees what was counted. */
  label: string;
  /** Everything the job says, for finding the skill. */
  text: string;
  /** Month index of the first month, and one past the last. */
  start: number;
  end: number;
}

const monthIndex = (ym: string): number | null => {
  const m = ym.match(/^(\d{4})(?:-(\d{2}))?$/);
  return m ? Number(m[1]) * 12 + (m[2] ? Number(m[2]) - 1 : 0) : null;
};

/**
 * Dated work from the master resume (jobs, volunteering, internships), or from the profile when
 * there's no resume. Paid or not, part-time or not: it's all work with the skill.
 */
export function datedWork(
  resume: Resume | null,
  profile: CandidateProfile | null,
  now = new Date(),
): DatedWork[] {
  const nowIdx = now.getFullYear() * 12 + now.getMonth();
  const out: DatedWork[] = [];
  const push = (label: string, text: string, from: string, to: string, present: boolean) => {
    const start = monthIndex(from);
    const last = present ? nowIdx : monthIndex(to);
    if (start !== null && last !== null && last >= start)
      out.push({ label, text, start, end: last + 1 });
  };
  if (resume) {
    for (const s of resume.sections)
      if (!s.hidden && (s.type === 'experience' || s.type === 'volunteering'))
        for (const e of s.entries)
          if (!e.hidden)
            push(
              [e.title, e.subtitle].filter(Boolean).join(', '),
              [e.title, e.subtitle, e.info, plainText(e.description)].join('\n'),
              e.start,
              e.end,
              e.present,
            );
  }
  if (!out.length && profile)
    for (const x of profile.experience)
      push(
        [x.title, x.company].filter(Boolean).join(', '),
        [x.title, x.company, ...x.tech, ...x.bullets].join('\n'),
        toMonthYear(x.start),
        toMonthYear(x.end),
        isPresent(x.end) || !x.end,
      );
  return out;
}

/**
 * Whole years of work in the jobs that name the skill (all jobs when there's no skill), overlaps
 * counted once, rounded down: 2 years 11 months is 2, as a whole-number box needs.
 */
export function yearsWith(
  work: DatedWork[],
  skill: string | null,
): { years: number; months: number; used: DatedWork[] } {
  const used = skill
    ? work.filter((w) => containsKeyword(w.text, { term: skill, aliases: [] }))
    : work;
  const spans = used.map((w) => [w.start, w.end] as const).sort((a, b) => a[0] - b[0]);
  let months = 0;
  let [from, to] = [0, 0];
  for (const [a, b] of spans) {
    if (a > to) {
      months += to - from;
      [from, to] = [a, b];
    } else to = Math.max(to, b);
  }
  months += to - from;
  return { years: Math.floor(months / 12), months, used };
}

// ---- Sorting questions.

export type Screening =
  /** Drafted by the model like any other field. */
  | { lane: 'model' }
  /** Answered by code from the candidate's data; still inserted only on the candidate's click. */
  | { lane: 'rule'; answer: string; note: string }
  /** Left to the candidate: shown with why, never sent to the model or filled. */
  | { lane: 'you'; note: string; locked: boolean };

export interface ScreeningContext {
  work: DatedWork[];
  /** Everything known about the candidate, for "Do you have experience with X?". */
  knownText: string;
  /** Degrees and programs from the master resume and profile. */
  degrees: string[];
  /** Saved standard answers, shown as a reminder next to questions left to the candidate. */
  saved: { workAuthorization?: string; needsSponsorship?: string };
}

/**
 * The field's question: its label and hint. Its section only when that's a heading ("Voluntary
 * self-identification"): a legend above can be the previous question.
 */
const q = (f: FieldInfo) =>
  [f.section && !/\?\s*$/.test(f.section) ? f.section : '', f.label, f.hint]
    .filter(Boolean)
    .join(' ')
    .trim();

/** Voluntary self-identification: never filled, never sent (hard rule 2; EEO law). */
const SELF_ID =
  /\b(gender|sex|race|racial|ethnic(ity)?|hispanic|latin[oa]x?|veteran|disabilit(y|ies)|sexual orientation|transgender|pronouns?)\b/i;
/** Consents, attestations, and the checks a candidate agrees to: their decision alone. */
const CONSENT =
  /\b(i (certify|confirm|agree|acknowledge|consent|attest|understand|declare)|consent|terms (of|and)|privacy (policy|notice)|data (retention|processing)|attest)/i;
const RECORD =
  /\b(convicted|conviction|criminal|felony|misdemeanou?r|background (check|screening)|drug (test|screen)|security clearance|clearance level)\b/i;
const AUTHORIZED =
  /\b((authori[sz]ed|eligible|legally (permitted|allowed|able)|right) to work|work (authori[sz]ation|permit)|citizen(ship)?|permanent resident|green card)\b/i;
const SPONSOR = /\b(sponsor(ship)?|visa)\b/i;
const PAY_HISTORY =
  /\b(current|present|previous|last) (salary|pay|compensation|ctc)\b|salary history/i;

const YEARS = /\bhow many years\b|\byears of\b.*\bexperience\b|\bexperience\b.*\bin years\b/i;
const YES_NO = (f: FieldInfo) =>
  !!f.options?.length &&
  f.options.some((o) => /^yes\b/i.test(o)) &&
  f.options.some((o) => /^no\b/i.test(o));
const HAVE_EXPERIENCE =
  /\b(do you have|have you (worked|used)|are you (experienced|familiar|proficient))\b.*\b(experience|worked|used|with|in|using)\b/i;
const EDUCATION =
  /\b(level of education|completed .*(degree|diploma)|bachelor'?s|master'?s|doctor(ate|al)|ph\.?\s?d)\b/i;

/** "... do you have with Python?" -> "Python"; "years of Software Development experience" -> that. */
export function skillOf(question: string): string | null {
  const text = question
    .replace(/\s+/g, ' ')
    .replace(/[?:*]+\s*$/, '')
    .trim();
  const withSkill = text.match(/\b(?:with|using|in|on)\s+(.{1,60}?)\s*(?:\?|$|\(|,)/i);
  if (withSkill && !/^(years?|total|your|the (following|last)|this|a|an)\b/i.test(withSkill[1]!))
    return withSkill[1]!.trim();
  const ofSkill = text.match(/\byears of\s+(.{1,60}?)\s+(?:work\s+)?experience\b/i);
  const skill = ofSkill?.[1]!
    .replace(/^((professional|relevant|work|hands-on|industry|total|paid)\s+)+/i, '')
    .trim();
  if (skill && !/^(work|professional|relevant|total)$/i.test(skill)) return skill;
  return null;
}

/** The option of a years dropdown ("1-3", "3+ years") that holds the number, if any. */
export function yearsOption(years: number, options: string[]): string | null {
  for (const o of options) {
    const range = o.match(/(\d+)\s*(?:-|–|to)\s*(\d+)/);
    if (range && years >= Number(range[1]) && years <= Number(range[2])) return o;
    const plus = o.match(/(\d+)\s*\+|(?:more than|over|at least)\s*(\d+)/i);
    if (plus && years >= Number(plus[1] ?? plus[2])) return o;
    const less = o.match(/(?:less than|under|fewer than)\s*(\d+)/i);
    if (less && years < Number(less[1])) return o;
    if (new RegExp(`^\\s*${years}\\s*(years?)?\\s*$`, 'i').test(o)) return o;
  }
  return null;
}

const LEVEL: [RegExp, RegExp][] = [
  [/\bbachelor/i, /\b(bachelor|b\.?\s?sc?|b\.?\s?a|b\.?\s?eng|b\.?\s?tech|licenciatura)\b/i],
  [/\bmaster/i, /\b(master|m\.?\s?sc?|m\.?\s?a|m\.?\s?eng|mba|m\.?\s?tech)\b/i],
  [/\b(doctor|ph\.?\s?d)/i, /\b(ph\.?\s?d|doctor(ate)?|d\.?\s?phil)\b/i],
];

export function screen(f: FieldInfo, ctx: ScreeningContext): Screening {
  const text = q(f);
  const options = (f.options ?? []).join(' | ');
  const you = (note: string, locked = true): Screening => ({ lane: 'you', note, locked });

  if (SELF_ID.test(text))
    return you(
      'Voluntary self-identification: answer it on the page yourself. AnswerSnap never fills it.',
    );
  if (f.kind === 'checkbox-group' && (CONSENT.test(text) || CONSENT.test(options)))
    return you('A consent or statement you sign: tick it on the page yourself if it is true.');
  if (/follow-company/i.test(f.domId ?? '') || /^follow\b/i.test(f.label ?? ''))
    return you('Following the company is up to you.');
  if (RECORD.test(text)) return you('Only you can answer this. AnswerSnap never does.');
  if (PAY_HISTORY.test(text))
    return you('Pay history: in many places employers may not ask it. Answer it yourself.');

  const reminder = (v?: string) => (v?.trim() ? ` Your saved answer: "${v.trim()}".` : '');
  if (SPONSOR.test(text) && !/\bsponsor(ed)? (by|a) (the )?(company|us)\b/i.test(text))
    return you(
      `Sponsorship depends on the job's country, so answer it yourself.${reminder(ctx.saved.needsSponsorship)}`,
      false,
    );
  if (AUTHORIZED.test(text))
    return you(
      `Work authorization is per country, so answer it yourself.${reminder(ctx.saved.workAuthorization)}`,
      false,
    );

  // With no dated jobs to count (no resume in the builder, no built profile), the model reads
  // the candidate's sources as before.
  if (YEARS.test(text) && f.kind !== 'checkbox-group' && ctx.work.length) {
    const skill = skillOf(f.label ?? text);
    const { years, used } = yearsWith(ctx.work, skill);
    const what = skill ? `with ${skill}` : 'in total';
    if (!used.length)
      return you(
        skill
          ? `None of your dated jobs mentions ${skill}. If you've used it at work, enter the years yourself.`
          : 'Your resume has no dated jobs to count. Enter the years yourself.',
        false,
      );
    const counted = `Counted ${what} from: ${used.map((w) => w.label).join('; ')}.`;
    if (f.options?.length) {
      const option = yearsOption(years, f.options);
      return option
        ? { lane: 'rule', answer: option, note: `${years} years. ${counted}` }
        : you(`${years} years ${what}, but no option fits. ${counted}`, false);
    }
    return { lane: 'rule', answer: String(years), note: `${counted} Rounded down.` };
  }

  if (YES_NO(f) && EDUCATION.test(text)) {
    const level = LEVEL.find(([asked]) => asked.test(text));
    const has = level && ctx.degrees.some((d) => level[1].test(d));
    const yes = f.options!.find((o) => /^yes\b/i.test(o))!;
    return has
      ? { lane: 'rule', answer: yes, note: 'Your resume lists this degree.' }
      : you("Your resume doesn't show this degree. Answer it yourself.", false);
  }

  if (YES_NO(f) && HAVE_EXPERIENCE.test(text)) {
    const skill = skillOf(f.label ?? text);
    if (skill) {
      const yes = f.options!.find((o) => /^yes\b/i.test(o))!;
      return containsKeyword(ctx.knownText, { term: skill, aliases: [] })
        ? { lane: 'rule', answer: yes, note: `Your resume or profile mentions ${skill}.` }
        : you(`Your resume and profile don't mention ${skill}. Answer it yourself.`, false);
    }
  }
  return { lane: 'model' };
}
