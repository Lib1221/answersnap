import { DOC_STRINGS, monthNames, type DocLang } from './docLang';
import type { Design, Entry, SectionType } from './model';

// Display rules shared by the preview and the PDF.

const MONTHS_LONG = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/**
 * "2024-03" -> "03/2024", "03.2024", "Mar 2024", "March 2024", "2024-03", "2024/03", or "2024",
 * in the resume language. A year-only value ("2024") shows as the bare year in every format.
 */
export function formatMonth(
  value: string,
  fmt: Design['dateFormat'],
  lang: DocLang = 'en',
): string {
  if (!value) return '';
  const [y, m] = value.split('-');
  if (!m || fmt === 'YYYY') return y!;
  const i = Number(m) - 1;
  switch (fmt) {
    case 'MM/YYYY':
      return `${m}/${y}`;
    case 'MM.YYYY':
      return `${m}.${y}`;
    case 'Mon YYYY':
      return `${monthNames(lang, 'short')[i]} ${y}`;
    case 'Month YYYY':
      return `${monthNames(lang, 'long')[i]} ${y}`;
    case 'YYYY-MM':
      return `${y}-${m}`;
    case 'YYYY/MM':
      return `${y}/${m}`;
  }
}

/** FlowCV's level words for levels 1 to 5, in the resume language. Languages have their own scale. */
export function levelWords(type: SectionType, lang: DocLang = 'en'): readonly string[] {
  const s = DOC_STRINGS[lang];
  return type === 'languages' ? s.languageLevels : s.skillLevels;
}

/** "Mar 2021 – Present", or the single date. En dash between dates is typographic, not prose. */
export function formatDates(
  e: Entry,
  d: Pick<Design, 'dateFormat' | 'presentLabel'> & { docLang?: DocLang },
): string {
  const lang = d.docLang ?? 'en';
  if (e.date) return formatMonth(e.date, d.dateFormat, lang);
  const start = formatMonth(e.start, d.dateFormat, lang);
  const end = e.present
    ? d.presentLabel.trim() || DOC_STRINGS[lang].present
    : e.endText.trim() || formatMonth(e.end, d.dateFormat, lang);
  if (start && end) return start === end ? start : `${start} – ${end}`;
  return start || end;
}

export function formatPlace(e: Entry): string {
  return [e.city, e.country]
    .map((x) => x.trim())
    .filter(Boolean)
    .join(', ');
}

/** Page geometry in millimetres. */
export const PAGE_MM = { A4: { w: 210, h: 297 }, Letter: { w: 215.9, h: 279.4 } } as const;

/** File name for the PDF: "Jamie_Park_Resume". */
export function pdfTitle(fullName: string, resumeName: string): string {
  // NFC first, and marks kept: Devanagari vowel signs and decomposed accents stay in the name.
  const base = (fullName || resumeName || 'Resume').normalize('NFC').trim().replace(/\s+/g, '_');
  return `${base.replace(/[^\p{L}\p{M}\p{N}_-]/gu, '')}_Resume`;
}

/** Normalize loose dates ("2021", "03/2021", "Mar 2021", "2021-03-15") to month-year. */
export function toMonthYear(value: string | null | undefined): string {
  const v = (value ?? '').trim();
  if (!v || /present|current|now|today/i.test(v)) return '';
  let m = v.match(/^(\d{4})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2]!.padStart(2, '0')}`;
  m = v.match(/^(\d{1,2})[/.](\d{4})$/);
  if (m) return `${m[2]}-${m[1]!.padStart(2, '0')}`;
  m = v.match(/^([A-Za-z]{3,})\.?\s+(\d{4})$/);
  if (m) {
    const i = MONTHS_LONG.findIndex((x) =>
      x.toLowerCase().startsWith(m![1]!.slice(0, 3).toLowerCase()),
    );
    if (i !== -1) return `${m[2]}-${String(i + 1).padStart(2, '0')}`;
  }
  m = v.match(/(\d{4})/);
  return m ? m[1]! : '';
}

export function isPresent(value: string | null | undefined): boolean {
  return /present|current|now|today|ongoing/i.test(value ?? '');
}
