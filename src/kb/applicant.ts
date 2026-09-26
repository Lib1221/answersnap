import { storage } from 'wxt/utils/storage';
import { z } from 'zod';

// Applicant details for scholarship and university forms: the facts a form asks for exactly
// (passport, birth, citizenship, address, education, tests). They fill fields directly and are
// never sent to the AI provider, never synced, and never guessed.

const s = z.string().default('');
/** YYYY-MM-DD or empty. */
const date = z
  .string()
  .regex(/^(\d{4}-\d{2}-\d{2})?$/)
  .default('');
/** ISO 3166-1 alpha-2 or empty. */
const country = z
  .string()
  .regex(/^([A-Z]{2})?$/)
  .default('');

export const AddressSchema = z.object({
  street: s,
  city: s,
  region: s,
  postalCode: s,
  country,
});
export type Address = z.infer<typeof AddressSchema>;

export const EducationSchema = z.object({
  level: z.enum(['high-school', 'bachelor', 'master', 'phd', 'other']).default('bachelor'),
  degree: s,
  field: s,
  institution: s,
  city: s,
  country,
  startDate: date,
  graduationDate: date,
  /** As written on the transcript, e.g. "3.6" or "27.5". */
  grade: s,
  /** The scale's maximum, e.g. "4" or "30" or "110". */
  gradeScale: s,
});
export type Education = z.infer<typeof EducationSchema>;

export const LanguageTestSchema = z.object({
  test: s,
  score: s,
  date,
  /** CEFR level if known: A1 to C2. */
  level: s,
});

export const ApplicantSchema = z.object({
  givenNames: s,
  familyName: s,
  sex: z.enum(['', 'F', 'M', 'X']).default(''),
  birthDate: date,
  birthCity: s,
  birthCountry: country,
  citizenship: country,
  secondCitizenship: country,
  maritalStatus: z.enum(['', 'single', 'married', 'divorced', 'widowed']).default(''),
  fatherName: s,
  motherName: s,
  nativeLanguage: s,
  passport: z
    .object({
      number: s,
      issueDate: date,
      expiryDate: date,
      issuingCountry: country,
      issuingAuthority: s,
    })
    .default({
      number: '',
      issueDate: '',
      expiryDate: '',
      issuingCountry: '',
      issuingAuthority: '',
    }),
  nationalId: s,
  codiceFiscale: s,
  email: s,
  /** Country for the calling code, plus the national number (digits). */
  phoneCountry: country,
  phoneNumber: s,
  residence: AddressSchema.default({
    street: '',
    city: '',
    region: '',
    postalCode: '',
    country: '',
  }),
  /** Where the applicant lives now, when different from residence (Italian "domicilio"). */
  domicile: AddressSchema.default({
    street: '',
    city: '',
    region: '',
    postalCode: '',
    country: '',
  }),
  education: z.array(EducationSchema).default([]),
  languageTests: z.array(LanguageTestSchema).default([]),
  updatedAt: s,
});
export type Applicant = z.infer<typeof ApplicantSchema>;

export const emptyApplicant = (): Applicant => ApplicantSchema.parse({});

const applicantItem = storage.defineItem<unknown>('local:applicant');

export async function getApplicant(): Promise<Applicant> {
  const parsed = ApplicantSchema.safeParse((await applicantItem.getValue()) ?? {});
  return parsed.success ? parsed.data : emptyApplicant();
}

export async function saveApplicant(a: Applicant): Promise<void> {
  await applicantItem.setValue(
    ApplicantSchema.parse({ ...a, updatedAt: new Date().toISOString() }),
  );
}

export function watchApplicant(cb: () => void): () => void {
  return applicantItem.watch(cb);
}

/** Age in whole years on a date (YYYY-MM-DD). */
export function ageOn(birthDate: string, on: string): number | null {
  if (!birthDate || !on) return null;
  const [by, bm, bd] = birthDate.split('-').map(Number);
  const [y, m, d] = on.split('-').map(Number);
  let age = y! - by!;
  if (m! < bm! || (m === bm && d! < bd!)) age--;
  return age;
}

/** The degree to show for "your latest degree" questions: the highest level, latest finished. */
export function latestEducation(a: Applicant): Education | undefined {
  const rank = { 'high-school': 0, other: 1, bachelor: 2, master: 3, phd: 4 } as const;
  return [...a.education].sort(
    (x, y) => rank[y.level] - rank[x.level] || y.graduationDate.localeCompare(x.graduationDate),
  )[0];
}
