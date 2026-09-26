import type { Requirements } from '@/llm/requirements';
import { ageOn, type Applicant } from './applicant';

// Exact checks of a program's requirements against the applicant: computed, never guessed.

export type CheckState = 'ok' | 'fail' | 'unknown';

export interface Check {
  /** Machine id for the UI's wording. */
  kind: 'age' | 'born-after' | 'language' | 'passport' | 'deadline';
  state: CheckState;
  /** Plain values the UI puts into its message. */
  data: Record<string, string | number>;
}

const DAY = 24 * 60 * 60 * 1000;

/** Numeric score from strings like "6.5", "IELTS 6.5", "TOEFL iBT 90". */
function score(s: string): number | null {
  const m = s.match(/(\d+(?:[.,]\d+)?)/);
  return m ? Number(m[1]!.replace(',', '.')) : null;
}

const TESTS = [
  'ielts',
  'toefl',
  'duolingo',
  'pte',
  'cambridge',
  'cils',
  'celi',
  'plida',
  'cert it',
  'tolc',
  'gre',
  'gmat',
  'sat',
];
function testName(s: string): string | undefined {
  const t = s.toLowerCase().replace(/[^a-z ]+/g, ' ');
  return TESTS.find((n) => new RegExp(`(^| )${n}( |$)`).test(t));
}

const CEFR = ['a1', 'a2', 'b1', 'b2', 'c1', 'c2'];
function cefr(s: string): number {
  const m = s.toLowerCase().match(/\b([abc][12])\b/);
  return m ? CEFR.indexOf(m[1]!) : -1;
}

export function checkEligibility(r: Requirements, a: Applicant, today = new Date()): Check[] {
  const checks: Check[] = [];
  const todayIso = today.toISOString().slice(0, 10);
  const lastDeadline = [...r.deadlines].reverse().find((d) => d.date)?.date ?? null;
  const closing =
    r.deadlines.find(
      (d) => d.date && /clos|deadline|due|until|scadenza|entro|termine/i.test(d.what),
    )?.date ?? lastDeadline;

  for (const e of r.eligibility) {
    if (e.kind !== 'age') continue;
    if (e.maxAge !== null) {
      const on = closing ?? todayIso;
      const age = a.birthDate ? ageOn(a.birthDate, on) : null;
      checks.push({
        kind: 'age',
        state: age === null ? 'unknown' : age <= e.maxAge ? 'ok' : 'fail',
        data: { max: e.maxAge, age: age ?? '', on },
      });
    }
    if (e.bornOnOrAfter) {
      checks.push({
        kind: 'born-after',
        state: !a.birthDate ? 'unknown' : a.birthDate >= e.bornOnOrAfter ? 'ok' : 'fail',
        data: { date: e.bornOnOrAfter },
      });
    }
  }

  for (const req of r.language) {
    const name = testName(req.test);
    const min = score(req.minimum) ?? score(req.test);
    const level = cefr(`${req.test} ${req.minimum}`);
    const mine = a.languageTests.find((t) => name && testName(t.test) === name);
    if (mine && min !== null && score(mine.score) !== null) {
      checks.push({
        kind: 'language',
        state: score(mine.score)! >= min ? 'ok' : 'fail',
        data: {
          test: `${req.test} ${req.minimum}`.trim(),
          yours: `${mine.test} ${mine.score}`.trim(),
        },
      });
    } else if (level !== -1) {
      const best = Math.max(-1, ...a.languageTests.map((t) => cefr(t.level)));
      checks.push({
        kind: 'language',
        state: best === -1 ? 'unknown' : best >= level ? 'ok' : 'fail',
        data: {
          test: `${req.test} ${req.minimum}`.trim(),
          yours: best === -1 ? '' : CEFR[best]!.toUpperCase(),
        },
      });
    } else {
      checks.push({
        kind: 'language',
        state: 'unknown',
        data: { test: `${req.test} ${req.minimum}`.trim(), yours: '' },
      });
    }
  }

  // The passport must outlast the whole stay; 18 months past the last deadline is a safe floor.
  if (a.passport.expiryDate) {
    const ref = lastDeadline ?? todayIso;
    const months = (Date.parse(a.passport.expiryDate) - Date.parse(ref)) / (30.44 * DAY);
    checks.push({
      kind: 'passport',
      state: months >= 18 ? 'ok' : 'fail',
      data: { expiry: a.passport.expiryDate, months: Math.max(0, Math.floor(months)) },
    });
  } else {
    checks.push({ kind: 'passport', state: 'unknown', data: { expiry: '', months: 0 } });
  }

  for (const d of r.deadlines) {
    if (!d.date) continue;
    const days = Math.ceil((Date.parse(d.date) - Date.parse(todayIso)) / DAY);
    checks.push({
      kind: 'deadline',
      state: days >= 0 ? 'ok' : 'fail',
      data: { what: d.what, date: d.date, days },
    });
  }
  return checks;
}
