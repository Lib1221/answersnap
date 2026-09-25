import { z } from 'zod';

// Candidate profile (spec 7.2). Kept simple for structured outputs: no regex patterns and no
// min or max lengths (spec 10.3).

const str = z.string();
const nstr = z.string().nullable();

export const CandidateProfileSchema = z.object({
  fullName: nstr,
  headline: nstr,
  location: nstr,
  email: nstr,
  phone: nstr,
  links: z.array(z.object({ label: str, url: str })),
  summary: nstr,
  skills: z.array(z.object({ name: str, years: z.number().nullable(), evidence: nstr })),
  experience: z.array(
    z.object({
      company: str,
      title: str,
      start: nstr,
      end: nstr,
      location: nstr,
      bullets: z.array(str),
      tech: z.array(str),
    }),
  ),
  projects: z.array(
    z.object({
      name: str,
      url: nstr,
      description: str,
      tech: z.array(str),
      highlights: z.array(str),
    }),
  ),
  education: z.array(
    z.object({ institution: str, degree: nstr, field: nstr, start: nstr, end: nstr }),
  ),
  certifications: z.array(z.object({ name: str, issuer: nstr, year: nstr })),
  languages: z.array(z.object({ language: str, level: nstr })),
  achievements: z.array(str),
  conflicts: z.array(str),
});
export type CandidateProfile = z.infer<typeof CandidateProfileSchema>;

export type ProfileSection = Exclude<
  keyof CandidateProfile,
  'fullName' | 'headline' | 'location' | 'email' | 'phone' | 'summary'
>;

export function emptyProfile(): CandidateProfile {
  return {
    fullName: null,
    headline: null,
    location: null,
    email: null,
    phone: null,
    links: [],
    summary: null,
    skills: [],
    experience: [],
    projects: [],
    education: [],
    certifications: [],
    languages: [],
    achievements: [],
    conflicts: [],
  };
}

export const ProfileRecordSchema = z.object({
  profile: CandidateProfileSchema,
  builtAt: z.string(),
  editedAt: z.string().nullable(),
  sourceIds: z.array(z.string()),
  previous: CandidateProfileSchema.nullable(),
});
export type ProfileRecord = z.infer<typeof ProfileRecordSchema>;

/** JSON Schema for structured outputs, without the $schema marker some APIs reject. */
export function profileJsonSchema(): Record<string, unknown> {
  const { $schema: _drop, ...schema } = z.toJSONSchema(CandidateProfileSchema) as Record<
    string,
    unknown
  >;
  return schema;
}

// Standard answers (spec 10.4): used as given, never guessed.
export const StandardAnswersSchema = z.object({
  workAuthorization: z.string().default(''),
  needsSponsorship: z.string().default(''),
  willingToRelocate: z.string().default(''),
  remotePreference: z.string().default(''),
  timezone: z.string().default(''),
  hoursOverlap: z.string().default(''),
  availableFrom: z.string().default(''),
  noticePeriod: z.string().default(''),
  hoursPerWeek: z.string().default(''),
  expectedSalary: z.string().default(''),
  expectedHourlyRate: z.string().default(''),
  englishLevel: z.string().default(''),
  custom: z
    .array(z.object({ id: z.string(), question: z.string(), answer: z.string() }))
    .default([]),
});
export type StandardAnswers = z.infer<typeof StandardAnswersSchema>;

export const STANDARD_ANSWER_FIELDS: {
  key: Exclude<keyof StandardAnswers, 'custom'>;
  label: string;
  hint?: string;
}[] = [
  {
    key: 'workAuthorization',
    label: 'Work authorization',
    hint: 'e.g. Authorized to work in the EU',
  },
  { key: 'needsSponsorship', label: 'Needs visa sponsorship' },
  { key: 'willingToRelocate', label: 'Willing to relocate' },
  { key: 'remotePreference', label: 'Remote or on-site preference' },
  { key: 'timezone', label: 'Time zone', hint: 'e.g. UTC+3 (East Africa Time)' },
  {
    key: 'hoursOverlap',
    label: 'Working hours overlap',
    hint: 'e.g. Full overlap with European hours',
  },
  { key: 'availableFrom', label: 'Available from' },
  { key: 'noticePeriod', label: 'Notice period' },
  { key: 'hoursPerWeek', label: 'Hours per week' },
  { key: 'expectedSalary', label: 'Expected salary' },
  { key: 'expectedHourlyRate', label: 'Expected hourly rate' },
  { key: 'englishLevel', label: 'English level' },
];

/** Only the answers the user filled in, for the prompt. */
export function filledStandardAnswers(sa: StandardAnswers | null): Record<string, unknown> | null {
  if (!sa) return null;
  const out: Record<string, unknown> = {};
  for (const f of STANDARD_ANSWER_FIELDS) if (sa[f.key].trim()) out[f.key] = sa[f.key].trim();
  const custom = sa.custom
    .filter((c) => c.question.trim() && c.answer.trim())
    .map(({ question, answer }) => ({ question, answer }));
  if (custom.length) out.custom = custom;
  return Object.keys(out).length ? out : null;
}
