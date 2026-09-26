import { z } from 'zod';
import { DOC_STRINGS, type DocLang } from './docLang';
import { FONT_KEYS, NAME_ONLY_FONT_KEYS } from './fonts';

// Resume documents for the builder: content (personal details and sections of entries) plus a
// design (layout, spacing, colors, fonts, headings, entry layout). A template is a preset design.
// Descriptions are rich text in the markdown subset of src/kb/richText.ts.

const s = z.string().default('');
const b = z.boolean().default(false);

export const SECTION_TYPES = [
  'profile',
  'experience',
  'education',
  'skills',
  'languages',
  'certificates',
  'projects',
  'courses',
  'awards',
  'organisations',
  'publications',
  'volunteering',
  'references',
  'interests',
  'declaration',
  'custom',
] as const;
export type SectionType = (typeof SECTION_TYPES)[number];

/** Month-year date: "2024-03", "2024", or empty. */
const monthYear = z
  .string()
  .regex(/^(\d{4}(-\d{2})?)?$/)
  .default('');

export const EntrySchema = z.object({
  id: z.string(),
  hidden: b,
  /** Main line: job title, degree, skill, language, project name... */
  title: s,
  /** Second line: employer, school, issuer, publisher... */
  subtitle: s,
  city: s,
  country: s,
  start: monthYear,
  end: monthYear,
  present: b,
  /** Custom end text instead of a date ("Expected 2027"). */
  endText: s,
  /** Single date for awards, certificates, publications. */
  date: monthYear,
  link: s,
  description: s,
  /** Skills and languages: 0 means no level shown, 1 to 5 otherwise. */
  level: z.number().int().min(0).max(5).default(0),
  /** Free text next to a skill or language ("C1", "5 years"). */
  info: s,
  email: s,
  phone: s,
});
export type Entry = z.infer<typeof EntrySchema>;

export const SectionSchema = z.object({
  id: z.string(),
  type: z.enum(SECTION_TYPES),
  /** Shown heading; empty means the default name for the type. */
  title: s,
  hidden: b,
  /** Two-column layouts: which column the section sits in. */
  column: z.enum(['main', 'side']).default('main'),
  entries: z.array(EntrySchema).default([]),
  /** Profile and declaration: one rich text block instead of entries. */
  text: s,
  /** Declaration: name, place, and date under the text. */
  signature: z.object({ name: s, place: s, date: s }).default({ name: '', place: '', date: '' }),
  /** Start the section on a new page (FlowCV's "Page break before"). */
  breakBefore: b,
  /** The heading can be left out, as FlowCV allows for the summary and the declaration. */
  showHeading: z.boolean().default(true),
  /** Skills, languages, interests: how the list shows; 'design' follows Customize. */
  layout: z.enum(['design', 'list', 'grid', 'bubbles', 'inline']).default('design'),
  /** Grid layout: items per row (a side column always uses one). */
  gridColumns: z.number().int().min(1).max(4).default(2),
  levelStyle: z.enum(['design', 'text', 'dots', 'bar', 'none']).default('design'),
});
export type Section = z.infer<typeof SectionSchema>;

/** Sections that can show as one compact list (grid, bubbles, inline). */
export const LIST_TYPES: ReadonlySet<SectionType> = new Set(['skills', 'languages', 'interests']);

// Links and profiles first, then personal details, then "other". Only ever add kinds here (saved
// resumes must keep parsing); the order is the order of the add-detail picker.
export const DETAIL_KINDS = [
  'website',
  'linkedin',
  'github',
  'portfolio',
  'gitlab',
  'stackoverflow',
  'orcid',
  'scholar',
  'researchgate',
  'behance',
  'dribbble',
  'medium',
  'x',
  'youtube',
  'instagram',
  'telegram',
  'whatsapp',
  'skype',
  'dateOfBirth',
  'placeOfBirth',
  'nationality',
  'passport',
  'visa',
  'drivingLicence',
  'gender',
  'maritalStatus',
  'other',
] as const;
export type DetailKind = (typeof DETAIL_KINDS)[number];

/** A base64 JPEG, PNG, or WebP data URL: the only photo format the builder stores. */
export const PHOTO_DATA_URL = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/;
/** About 1.5 MB of image; the builder's own 600 px JPEGs are well under 200 KB. */
export const PHOTO_MAX_CHARS = 2_000_000;

export const PersonalSchema = z.object({
  fullName: s,
  jobTitle: s,
  email: s,
  phone: s,
  location: s,
  /** Data URL of a small photo, kept only in this browser. Anything else (a web address in an
   * imported backup, an oversized string) is dropped, so the page never loads a remote image. */
  photo: z
    .string()
    .refine((v) => v === '' || (v.length <= PHOTO_MAX_CHARS && PHOTO_DATA_URL.test(v)))
    .catch(''),
  /** Photo crop: zoom (1 to 4) around a focus point in percent of the image. */
  photoZoom: z.number().min(1).max(4).default(1),
  photoX: z.number().min(0).max(100).default(50),
  photoY: z.number().min(0).max(100).default(50),
  details: z
    .array(
      z.object({
        // A kind this version doesn't know (a newer backup) reads as "other" and keeps its label.
        kind: z.enum(DETAIL_KINDS).catch('other'),
        label: s,
        value: s,
      }),
    )
    .default([]),
});
export type Personal = z.infer<typeof PersonalSchema>;

export { FONT_KEYS, NAME_ONLY_FONT_KEYS, type AnyFontKey, type FontKey } from './fonts';

export const DesignSchema = z.object({
  template: s,
  /** Language of section titles, dates, and level words on the resume. */
  docLang: z.enum(['en', 'it', 'fr', 'es', 'de']).default('en'),
  page: z.enum(['A4', 'Letter']).default('A4'),
  // Layout
  columns: z.enum(['one', 'two']).default('one'),
  sidebar: z.enum(['left', 'right']).default('left'),
  /** Side column width in percent of the content width (two columns). */
  sideWidth: z.number().min(20).max(50).default(32),
  header: z.enum(['top', 'side']).default('top'),
  // Spacing
  fontSize: z.number().min(8).max(13).default(10),
  lineHeight: z.number().min(1).max(1.8).default(1.35),
  marginX: z.number().min(6).max(30).default(16),
  marginY: z.number().min(6).max(30).default(14),
  entrySpacing: z.number().min(0).max(16).default(6),
  sectionSpacing: z.number().min(2).max(24).default(10),
  // Colors
  accent: z
    .string()
    .regex(/^#[0-9a-f]{6}$/i)
    .default('#1f3c88'),
  text: z
    .string()
    .regex(/^#[0-9a-f]{6}$/i)
    .default('#1d1d1f'),
  accentOn: z
    .object({
      name: b,
      jobTitle: b,
      headings: z.boolean().default(true),
      headingLine: z.boolean().default(true),
      dates: b,
      subtitle: b,
      links: z.boolean().default(true),
      icons: z.boolean().default(true),
      levels: z.boolean().default(true),
    })
    .default({
      name: false,
      jobTitle: false,
      headings: true,
      headingLine: true,
      dates: false,
      subtitle: false,
      links: true,
      icons: true,
      levels: true,
    }),
  /** Colored band behind the header, or a colored side column. */
  fill: z.enum(['none', 'header', 'sidebar', 'border']).default('none'),
  // Typography
  font: z.enum(FONT_KEYS).default('public-sans'),
  headingFont: z.enum([...FONT_KEYS, 'same']).default('same'),
  /** The name can also use a creative font; 'same' follows the heading font. */
  nameFont: z.enum([...FONT_KEYS, ...NAME_ONLY_FONT_KEYS, 'same']).default('same'),
  nameSize: z.number().min(16).max(40).default(26),
  nameBold: z.boolean().default(true),
  // Headings
  headingStyle: z
    .enum([
      'plain',
      'underline',
      'line-after',
      'box',
      'bar',
      'top-line',
      'short-bar',
      'top-bottom',
      'text-underline',
    ])
    .default('underline'),
  headingCase: z.enum(['upper', 'capitalize', 'none']).default('upper'),
  headingSize: z.number().min(0.9).max(1.6).default(1.1),
  headingIcons: b,
  // Header
  headerAlign: z.enum(['left', 'center', 'right']).default('left'),
  contactStyle: z.enum(['icons', 'bullets', 'bars', 'lines']).default('icons'),
  photo: z.enum(['none', 'circle', 'rounded', 'square', 'portrait']).default('circle'),
  photoGrayscale: b,
  photoSize: z.number().min(40).max(140).default(80),
  // Entries
  datePlacement: z.enum(['right', 'below', 'left']).default('right'),
  subtitleStyle: z.enum(['normal', 'bold', 'italic']).default('italic'),
  subtitlePlacement: z.enum(['same-line', 'next-line']).default('next-line'),
  /** Bold line first: the job title or degree (default), or the employer or school. */
  entryOrder: z.enum(['title-first', 'subtitle-first']).default('title-first'),
  locationWithDate: z.boolean().default(true),
  indentDescription: b,
  bullet: z.enum(['disc', 'hyphen', 'square', 'arrow']).default('disc'),
  // Skills and languages
  levelStyle: z.enum(['text', 'dots', 'bar', 'none']).default('dots'),
  skillsLayout: z.enum(['list', 'grid', 'bubbles', 'inline']).default('grid'),
  // Other
  dateFormat: z
    .enum(['MM/YYYY', 'MM.YYYY', 'Mon YYYY', 'Month YYYY', 'YYYY-MM', 'YYYY/MM', 'YYYY'])
    .default('Mon YYYY'),
  /** Empty means the resume language's word (Present, Oggi, ...). */
  presentLabel: z.string().default(''),
  linkStyle: z.enum(['underline', 'plain', 'icon']).default('plain'),
  footer: z.enum(['none', 'page-numbers', 'name-page', 'email-page']).default('none'),
});
export type Design = z.infer<typeof DesignSchema>;

export const ResumeSchema = z.object({
  id: z.string(),
  name: z.string().default('My resume'),
  createdAt: s,
  updatedAt: s,
  personal: PersonalSchema.default({
    fullName: '',
    jobTitle: '',
    email: '',
    phone: '',
    location: '',
    photo: '',
    photoZoom: 1,
    photoX: 50,
    photoY: 50,
    details: [],
  }),
  sections: z.array(SectionSchema).default([]),
  design: DesignSchema.default(DesignSchema.parse({})),
});
export type Resume = z.infer<typeof ResumeSchema>;

// ---------------------------------------------------------------------------------------------
// Section setup: which entry fields each type uses, and their labels.

export type EntryField =
  | 'title'
  | 'subtitle'
  | 'city'
  | 'country'
  | 'dates'
  | 'date'
  | 'link'
  | 'description'
  | 'level'
  | 'info'
  | 'email'
  | 'phone';

export interface SectionSetup {
  name: string;
  /** Profile and declaration hold one text block. */
  textOnly?: boolean;
  fields: EntryField[];
  labels: Partial<Record<EntryField, string>>;
  /** Default column in two-column layouts. */
  column: 'main' | 'side';
}

export const SECTION_SETUP: Record<SectionType, SectionSetup> = {
  profile: { name: 'Profile', textOnly: true, fields: [], labels: {}, column: 'main' },
  experience: {
    name: 'Professional Experience',
    fields: ['title', 'subtitle', 'city', 'country', 'dates', 'link', 'description'],
    labels: { title: 'Job title', subtitle: 'Employer' },
    column: 'main',
  },
  education: {
    name: 'Education',
    fields: ['title', 'subtitle', 'city', 'country', 'dates', 'link', 'description'],
    labels: { title: 'Degree', subtitle: 'School or university' },
    column: 'main',
  },
  skills: {
    name: 'Skills',
    fields: ['title', 'info', 'level'],
    labels: { title: 'Skill', info: 'Information (e.g. years, tools)' },
    column: 'side',
  },
  languages: {
    name: 'Languages',
    fields: ['title', 'info', 'level'],
    labels: { title: 'Language', info: 'Level (e.g. Native, C1)' },
    column: 'side',
  },
  certificates: {
    name: 'Certificates',
    fields: ['title', 'subtitle', 'date', 'link', 'description'],
    labels: { title: 'Certificate', subtitle: 'Issuer' },
    column: 'main',
  },
  projects: {
    name: 'Projects',
    fields: ['title', 'subtitle', 'dates', 'link', 'description'],
    labels: { title: 'Project title', subtitle: 'Subtitle or role' },
    column: 'main',
  },
  courses: {
    name: 'Courses',
    fields: ['title', 'subtitle', 'city', 'country', 'dates', 'link', 'description'],
    labels: { title: 'Course title', subtitle: 'Institution' },
    column: 'main',
  },
  awards: {
    name: 'Awards',
    fields: ['title', 'subtitle', 'date', 'link', 'description'],
    labels: { title: 'Award', subtitle: 'Issuer' },
    column: 'main',
  },
  organisations: {
    name: 'Organisations',
    fields: ['title', 'subtitle', 'city', 'country', 'dates', 'link', 'description'],
    labels: { title: 'Position', subtitle: 'Organisation' },
    column: 'main',
  },
  publications: {
    name: 'Publications',
    fields: ['title', 'subtitle', 'date', 'link', 'description'],
    labels: { title: 'Title', subtitle: 'Publisher' },
    column: 'main',
  },
  volunteering: {
    name: 'Volunteering',
    fields: ['title', 'subtitle', 'city', 'country', 'dates', 'link', 'description'],
    labels: { title: 'Role', subtitle: 'Organisation' },
    column: 'main',
  },
  references: {
    name: 'References',
    fields: ['title', 'subtitle', 'email', 'phone'],
    labels: { title: 'Name', subtitle: 'Job title and organisation' },
    column: 'main',
  },
  interests: {
    name: 'Interests',
    fields: ['title', 'info'],
    labels: { title: 'Interest', info: 'Information' },
    column: 'side',
  },
  declaration: { name: 'Declaration', textOnly: true, fields: [], labels: {}, column: 'main' },
  custom: {
    name: 'Custom section',
    fields: ['title', 'subtitle', 'city', 'country', 'dates', 'link', 'description'],
    labels: { title: 'Title', subtitle: 'Subtitle' },
    column: 'main',
  },
};

export const FIELD_LABELS: Record<EntryField, string> = {
  title: 'Title',
  subtitle: 'Subtitle',
  city: 'City',
  country: 'Country',
  dates: 'Start and end date',
  date: 'Date',
  link: 'Link',
  description: 'Description',
  level: 'Level',
  info: 'Information',
  email: 'Email',
  phone: 'Phone',
};

export const DETAIL_LABELS: Record<DetailKind, string> = {
  website: 'Website',
  linkedin: 'LinkedIn',
  github: 'GitHub',
  portfolio: 'Portfolio',
  gitlab: 'GitLab',
  stackoverflow: 'Stack Overflow',
  orcid: 'ORCID',
  scholar: 'Google Scholar',
  researchgate: 'ResearchGate',
  behance: 'Behance',
  dribbble: 'Dribbble',
  medium: 'Medium',
  x: 'X (Twitter)',
  youtube: 'YouTube',
  instagram: 'Instagram',
  telegram: 'Telegram',
  whatsapp: 'WhatsApp',
  skype: 'Skype',
  dateOfBirth: 'Date of birth',
  placeOfBirth: 'Place of birth',
  nationality: 'Nationality',
  passport: 'Passport or ID',
  visa: 'Visa',
  drivingLicence: 'Driving licence',
  gender: 'Gender',
  maritalStatus: 'Marital status',
  other: 'Other',
};

export function sectionTitle(sec: Section, lang: DocLang = 'en'): string {
  return sec.title.trim() || DOC_STRINGS[lang].sections[sec.type];
}

let counter = 0;
export function newId(prefix = 'x'): string {
  counter += 1;
  return `${prefix}${Date.now().toString(36)}${counter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function newEntry(patch: Partial<Entry> = {}): Entry {
  return EntrySchema.parse({ id: newId('e'), ...patch });
}

export function newSection(type: SectionType, patch: Partial<Section> = {}): Section {
  return SectionSchema.parse({
    id: newId('s'),
    type,
    column: SECTION_SETUP[type].column,
    ...patch,
  });
}

export function newResume(patch: Partial<Resume> = {}): Resume {
  const now = new Date().toISOString();
  return ResumeSchema.parse({
    id: newId('r'),
    createdAt: now,
    updatedAt: now,
    sections: [
      newSection('profile'),
      newSection('experience'),
      newSection('education'),
      newSection('skills'),
      newSection('languages'),
    ],
    ...patch,
  });
}
