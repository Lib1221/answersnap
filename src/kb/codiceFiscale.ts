// Italian tax code (codice fiscale), needed by Italian universities and DSU scholarships. We
// validate rather than generate: the birthplace part (Z + 3 digits for people born abroad) comes
// from the Agenzia delle Entrate and must be copied from the real code.

const ODD: Record<string, number> = {
  0: 1,
  1: 0,
  2: 5,
  3: 7,
  4: 9,
  5: 13,
  6: 15,
  7: 17,
  8: 19,
  9: 21,
  A: 1,
  B: 0,
  C: 5,
  D: 7,
  E: 9,
  F: 13,
  G: 15,
  H: 17,
  I: 19,
  J: 21,
  K: 2,
  L: 4,
  M: 18,
  N: 20,
  O: 11,
  P: 3,
  Q: 6,
  R: 8,
  S: 12,
  T: 14,
  U: 16,
  V: 10,
  W: 22,
  X: 25,
  Y: 24,
  Z: 23,
};
const MONTHS = 'ABCDEHLMPRST';
/** Omocodia: digits replaced by these letters when two people share a code. */
const OMOCODIA = 'LMNPQRSTUV';

function evenValue(ch: string): number {
  return /\d/.test(ch) ? Number(ch) : ch.charCodeAt(0) - 65;
}

export function checkCharacter(first15: string): string {
  let sum = 0;
  for (let i = 0; i < 15; i++) {
    const ch = first15[i]!;
    // Positions are counted from 1, so index 0 is an odd position.
    sum += i % 2 === 0 ? ODD[ch]! : evenValue(ch);
  }
  return String.fromCharCode(65 + (sum % 26));
}

const SHAPE =
  /^[A-Z]{6}[\dLMNPQRSTUV]{2}[ABCDEHLMPRST][\dLMNPQRSTUV]{2}[A-Z][\dLMNPQRSTUV]{3}[A-Z]$/;

function letters(s: string) {
  return s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toUpperCase()
    .replace(/[^A-Z]/g, '');
}
const consonants = (s: string) => letters(s).replace(/[AEIOU]/g, '');
const vowels = (s: string) => letters(s).replace(/[^AEIOU]/g, '');

export function surnameCode(surname: string): string {
  return (consonants(surname) + vowels(surname) + 'XXX').slice(0, 3);
}

export function nameCode(name: string): string {
  const c = consonants(name);
  if (c.length >= 4) return c[0]! + c[2]! + c[3]!;
  return (c + vowels(name) + 'XXX').slice(0, 3);
}

/** Undo omocodia so the date digits can be read. */
function digits(s: string): string {
  return s.replace(/[LMNPQRSTUV]/g, (ch) => String(OMOCODIA.indexOf(ch)));
}

export interface CfCheck {
  valid: boolean;
  /** What doesn't match, in plain words. */
  problems: string[];
  bornAbroad: boolean;
}

/**
 * Check a codice fiscale's shape and check character, and, when given, that it matches the
 * person's names, birth date (YYYY-MM-DD), and sex.
 */
export function checkCodiceFiscale(
  code: string,
  person: { familyName?: string; givenNames?: string; birthDate?: string; sex?: string } = {},
): CfCheck {
  const cf = code.replace(/\s+/g, '').toUpperCase();
  const problems: string[] = [];
  if (!SHAPE.test(cf))
    return {
      valid: false,
      problems: ['it should be 16 letters and digits in the codice fiscale pattern'],
      bornAbroad: false,
    };
  if (checkCharacter(cf.slice(0, 15)) !== cf[15])
    problems.push('the last character (check character) is wrong, so there is a typo');
  if (person.familyName && surnameCode(person.familyName) !== cf.slice(0, 3))
    problems.push(
      `the first 3 letters should be ${surnameCode(person.familyName)} for your surname`,
    );
  if (person.givenNames && nameCode(person.givenNames) !== cf.slice(3, 6))
    problems.push(`letters 4 to 6 should be ${nameCode(person.givenNames)} for your first name`);
  if (person.birthDate && /^\d{4}-\d{2}-\d{2}$/.test(person.birthDate)) {
    const [y, m, d] = person.birthDate.split('-');
    if (digits(cf.slice(6, 8)) !== y!.slice(2)) problems.push('the birth year part does not match');
    if (cf[8] !== MONTHS[Number(m) - 1]) problems.push('the birth month letter does not match');
    const day = Number(digits(cf.slice(9, 11)));
    const expected = Number(d) + (person.sex === 'F' ? 40 : 0);
    if (person.sex && person.sex !== 'X' && day !== expected)
      problems.push('the birth day part does not match your birth date and sex');
  }
  return { valid: problems.length === 0, problems, bornAbroad: cf[11] === 'Z' };
}
