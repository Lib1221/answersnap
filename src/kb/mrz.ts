import { iso2FromIso3 } from './countries';

// Passport machine-readable zone (ICAO 9303, TD3: two lines of 44 characters). Pasting it fills
// the passport fields exactly, and every part is verified with the passport's own check digits.

export interface MrzResult {
  familyName: string;
  givenNames: string;
  passportNumber: string;
  /** ISO alpha-2. */
  issuingCountry: string;
  citizenship: string;
  /** YYYY-MM-DD */
  birthDate: string;
  sex: 'F' | 'M' | 'X';
  expiryDate: string;
  /** Checks that failed; empty when the MRZ is intact. */
  errors: string[];
}

const WEIGHTS = [7, 3, 1];

export function mrzCheckDigit(s: string): number {
  let sum = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]!;
    const v = /\d/.test(ch) ? Number(ch) : /[A-Z]/.test(ch) ? ch.charCodeAt(0) - 55 : 0;
    sum += v * WEIGHTS[i % 3]!;
  }
  return sum % 10;
}

/** YYMMDD to YYYY-MM-DD. Birth dates are in the past; expiry dates in the future. */
function mrzDate(yymmdd: string, kind: 'birth' | 'expiry', now: Date): string {
  const yy = Number(yymmdd.slice(0, 2));
  const current = now.getFullYear() % 100;
  const century =
    kind === 'birth'
      ? yy > current
        ? 1900
        : 2000
      : yy + 2000 < now.getFullYear() - 30
        ? 2100
        : 2000;
  return `${century + yy}-${yymmdd.slice(2, 4)}-${yymmdd.slice(4, 6)}`;
}

/** Find the two TD3 lines in pasted text (OCR output may add spaces or break lines). */
export function findMrzLines(text: string): [string, string] | null {
  const lines = text
    .toUpperCase()
    .replace(/[«‹]/g, '<')
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, ''))
    .filter((l) => l.length >= 30);
  const i = lines.findIndex((l) => l.startsWith('P'));
  if (i !== -1 && lines[i + 1])
    return [lines[i]!.padEnd(44, '<').slice(0, 44), lines[i + 1]!.padEnd(44, '<').slice(0, 44)];
  // All on one line: 88 characters.
  const joined = text.toUpperCase().replace(/\s+/g, '');
  const at = joined.search(/P[A-Z<][A-Z<]{3}/);
  if (at !== -1 && joined.length - at >= 88)
    return [joined.slice(at, at + 44), joined.slice(at + 44, at + 88)];
  return null;
}

export function parseMrz(text: string, now = new Date()): MrzResult | null {
  const lines = findMrzLines(text);
  if (!lines) return null;
  const [l1, l2] = lines;
  const errors: string[] = [];

  const names = l1.slice(5).split('<<');
  const familyName = names[0]!.replace(/</g, ' ').trim();
  const givenNames = names.slice(1).join(' ').replace(/</g, ' ').replace(/\s+/g, ' ').trim();

  const number = l2.slice(0, 9);
  const check = (field: string, digit: string, label: string) => {
    if (digit !== '<' && mrzCheckDigit(field) !== Number(digit)) errors.push(label);
  };
  check(number, l2[9]!, 'passport number');
  const birth = l2.slice(13, 19);
  check(birth, l2[19]!, 'birth date');
  const expiry = l2.slice(21, 27);
  check(expiry, l2[27]!, 'expiry date');
  check(l2.slice(28, 42), l2[42]!, 'personal number');
  const composite = l2.slice(0, 10) + l2.slice(13, 20) + l2.slice(21, 43);
  check(composite, l2[43]!, 'whole line');

  const sexChar = l2[20];
  return {
    familyName,
    givenNames,
    passportNumber: number.replace(/</g, ''),
    issuingCountry: iso2FromIso3(l1.slice(2, 5)) ?? '',
    citizenship: iso2FromIso3(l2.slice(10, 13)) ?? '',
    birthDate: /^\d{6}$/.test(birth) ? mrzDate(birth, 'birth', now) : '',
    sex: sexChar === 'F' ? 'F' : sexChar === 'M' ? 'M' : 'X',
    expiryDate: /^\d{6}$/.test(expiry) ? mrzDate(expiry, 'expiry', now) : '',
    errors,
  };
}
