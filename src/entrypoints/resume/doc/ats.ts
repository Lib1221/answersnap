import { cleanUrl, formatDates, formatPlace } from '@/kb/resume/format';
import { sectionTitle, SECTION_SETUP, type Resume, type SectionType } from '@/kb/resume/model';
import { matchKeywords } from '@/kb/resume/tailoring';
import { plainText } from '@/kb/richText';
import { contactItems } from './contacts';

// "ATS preview": the resume as an applicant tracking system reads it (plain text, in the order
// the PDF holds it), and what such a parser is likely to miss. The text follows the page order
// the builder prints: header, then the main column, then the side column.

export interface AtsFinding {
  level: 'ok' | 'warn';
  text: string;
}

/** The resume as plain text, in the order the printed PDF holds it. */
export function resumePlainText(r: Resume): string {
  const d = r.design;
  const out: string[] = [];
  const p = r.personal;
  out.push(...[p.fullName, p.jobTitle].filter((x) => x.trim()));
  const contacts = contactItems(p, d.contactStyle).map((c) => c.text);
  if (contacts.length) out.push(contacts.join(' | '));
  const visible = r.sections.filter((s) => !s.hidden);
  const ordered =
    d.columns === 'two'
      ? [
          ...visible.filter((s) => s.column !== 'side'),
          ...visible.filter((s) => s.column === 'side'),
        ]
      : visible;
  for (const s of ordered) {
    const entries = s.entries.filter((e) => !e.hidden);
    const text = plainText(s.text).trim();
    if (!entries.length && !text) continue;
    out.push('', (s.showHeading ? sectionTitle(s, d.docLang) : '').toUpperCase());
    if (SECTION_SETUP[s.type].textOnly) {
      if (text) out.push(text);
      continue;
    }
    for (const e of entries) {
      const head = [e.title, e.subtitle].filter((x) => x.trim()).join(', ');
      const meta = [formatDates(e, d), formatPlace(e)].filter(Boolean).join(' | ');
      out.push([head, meta, e.info].filter((x) => x?.trim()).join('   '));
      const desc = plainText(e.description).trim();
      if (desc)
        out.push(
          ...desc
            .split('\n')
            .map((l) => l.trim())
            .filter(Boolean),
        );
    }
  }
  return out
    .filter((l, i, a) => l || a[i - 1])
    .join('\n')
    .trim();
}

/** Text from a PDF read back by pdf.js (rich lines): marks and column markers taken out. */
export function plainFromRichLines(text: string): string {
  return text
    .split('\n')
    .map((l) =>
      l
        .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
        .replace(/\*\*|__|(?<![\w*])\*(?=\S)|(?<=\S)\*(?![\w*])/g, '')
        .replace(/^\|\| /, '')
        .replace(/ \|\| /g, '   ')
        .replace(/^\[page (\d+)\]$/, '--- page $1 ---'),
    )
    .join('\n');
}

/** Headings parsers file content under, by section type. */
const STANDARD: Partial<Record<SectionType, RegExp>> = {
  profile: /summary|profile|about|objective/i,
  experience: /experience|employment|work history|career/i,
  education: /education|academic|qualifications/i,
  skills: /skills|technolog|tools|competenc|expertise/i,
  projects: /project/i,
  languages: /language/i,
  certificates: /certif|licen[cs]e/i,
};

export function atsFindings(r: Resume, text: string): AtsFinding[] {
  const out: AtsFinding[] = [];
  const ok = (t: string) => out.push({ level: 'ok', text: t });
  const warn = (t: string) => out.push({ level: 'warn', text: t });

  if (/[\w.+-]+@[\w-]+\.[\w.]+/.test(text)) ok('Your email is readable.');
  else warn("No email address in the text. Add one: it's how a recruiter contacts you.");
  if (/(\+?\d[\d\s().-]{7,}\d)/.test(text)) ok('Your phone number is readable.');
  else warn('No phone number in the text.');

  for (const s of r.sections.filter((x) => !x.hidden)) {
    const title = sectionTitle(s, r.design.docLang);
    const std = STANDARD[s.type];
    if (!s.showHeading && s.type !== 'profile')
      warn(`"${title}" has no heading, so a parser can't tell what it is.`);
    else if (std && s.showHeading && !std.test(title))
      warn(
        `"${title}" isn't a heading parsers know for ${s.type}. A plain name like "${defaultName(s.type)}" is read more reliably.`,
      );
  }

  const undated = r.sections
    .filter((s) => !s.hidden && (s.type === 'experience' || s.type === 'education'))
    .flatMap((s) => s.entries.filter((e) => !e.hidden && !e.start && !e.date))
    .map((e) => e.title || e.subtitle);
  if (undated.length)
    warn(
      `No dates on ${undated.slice(0, 3).join(', ')}${undated.length > 3 ? '…' : ''}. Parsers count years of experience from dates.`,
    );
  else ok('Every job and degree has dates.');

  if (r.design.headingCase === 'upper' && r.design.headingSpacing >= 0.12)
    warn(
      'Heading letters are spaced far apart, which some parsers read as separate letters ("E X P E R I E N C E"). Reduce the heading letter spacing in Customize.',
    );

  const hidden = r.personal.details.filter(
    (dt) => dt.display.trim() && cleanUrl(dt.value) && !dt.display.includes(cleanUrl(dt.value)),
  );
  if (hidden.length)
    warn(
      `${hidden.map((dt) => `"${dt.display.trim()}"`).join(', ')} ${hidden.length === 1 ? 'shows' : 'show'} a name, not the address. The link works in the PDF, but a parser that reads only words won't get the address.`,
    );

  if (r.design.columns === 'two')
    warn(
      'Two columns: the main column comes first in the file, which most parsers follow, but a few read straight across the page. One column is the safest.',
    );
  if (r.personal.photo && r.design.photo !== 'none')
    warn('A photo: parsers skip it, and many US and UK employers prefer resumes without one.');

  const k = r.tailoring?.keywords ?? [];
  if (k.length) {
    const m = matchKeywords(text, k);
    if (m.missing.length)
      warn(
        `Not in the text: ${m.missing.map((x) => x.term).join(', ')}. A recruiter's keyword search won't find them.`,
      );
    else ok(`All ${k.length} of the job's keywords are in the text.`);
  }
  return out;
}

function defaultName(t: SectionType): string {
  return (
    {
      profile: 'Summary',
      experience: 'Experience',
      education: 'Education',
      skills: 'Skills',
      projects: 'Projects',
      languages: 'Languages',
      certificates: 'Certifications',
    } as Partial<Record<SectionType, string>>
  )[t]!;
}
