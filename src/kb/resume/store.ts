import { storage } from 'wxt/utils/storage';
import { z } from 'zod';
import type { Applicant } from '../applicant';
import { countryName } from '../countries';
import type { CandidateProfile } from '../profileSchema';
import { isPresent, toMonthYear } from './format';
import {
  DesignSchema,
  newEntry,
  newId,
  newResume,
  newSection,
  PersonalSchema,
  ResumeSchema,
  type Design,
  type Resume,
  type Section,
} from './model';
import { applyTemplate } from './templates';

// Resumes live in local storage only (they may hold a photo and personal details).

const resumesItem = storage.defineItem<unknown>('local:resumes');

export async function getResumes(): Promise<Resume[]> {
  const raw = (await resumesItem.getValue()) ?? [];
  const parsed = z.array(z.unknown()).safeParse(raw);
  if (!parsed.success) return [];
  // Keep what parses rather than losing every resume for one bad one.
  return parsed.data.flatMap((r) => {
    const x = ResumeSchema.safeParse(r);
    return x.success ? [x.data] : [];
  });
}

export async function saveResumes(list: Resume[]): Promise<void> {
  await resumesItem.setValue(list.map((r) => ResumeSchema.parse(r)));
}

/**
 * Save one resume. Autosave passes `create: false`: a resume that is no longer in storage (deleted
 * in another tab, or by "Delete all data") is then not written back, and null is returned.
 */
export async function saveResume(
  r: Resume,
  opts: { create?: boolean; updatedAt?: string } = {},
): Promise<Resume | null> {
  const list = await getResumes();
  const next = { ...r, updatedAt: opts.updatedAt ?? new Date().toISOString() };
  const i = list.findIndex((x) => x.id === r.id);
  if (i === -1) {
    if (opts.create === false) return null;
    list.unshift(next);
  } else list[i] = next;
  await saveResumes(list);
  return next;
}

export async function deleteResume(id: string): Promise<void> {
  await saveResumes((await getResumes()).filter((r) => r.id !== id));
}

export function duplicateResume(r: Resume): Resume {
  // JSON copy: resumes are plain data, and structuredClone throws on Vue's reactive proxies.
  const copy = JSON.parse(JSON.stringify(r)) as Resume;
  const now = new Date().toISOString();
  return {
    ...copy,
    id: newId('r'),
    name: `${r.name} (copy)`,
    createdAt: now,
    updatedAt: now,
    sections: copy.sections.map((s) => ({
      ...s,
      id: newId('s'),
      entries: s.entries.map((e) => ({ ...e, id: newId('e') })),
    })),
  };
}

export function watchResumes(cb: () => void): () => void {
  return resumesItem.watch(cb);
}

// ---- My templates: designs the user saved by name ("Save as my template").

export const MyTemplateSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(60),
  createdAt: z.string().default(''),
  design: DesignSchema,
});
export type MyTemplate = z.infer<typeof MyTemplateSchema>;
/** Saved designs are marked with this prefix in `design.template`. */
export const MY_TEMPLATE_PREFIX = 'my:';

const myTemplatesItem = storage.defineItem<unknown>('local:resumeTemplates');

export async function getMyTemplates(): Promise<MyTemplate[]> {
  const raw = z.array(z.unknown()).safeParse((await myTemplatesItem.getValue()) ?? []);
  if (!raw.success) return [];
  return raw.data.flatMap((t) => {
    const x = MyTemplateSchema.safeParse(t);
    return x.success ? [x.data] : [];
  });
}

export async function saveMyTemplates(list: MyTemplate[]): Promise<void> {
  await myTemplatesItem.setValue(list.map((t) => MyTemplateSchema.parse(t)));
}

/** Save a design under a name; the same name replaces the older one. */
export async function addMyTemplate(name: string, design: Design): Promise<MyTemplate> {
  const clean = name.trim().slice(0, 60) || 'My template';
  const list = await getMyTemplates();
  const old = list.find((t) => t.name.toLowerCase() === clean.toLowerCase());
  const t: MyTemplate = {
    id: old?.id ?? newId('t'),
    name: clean,
    createdAt: new Date().toISOString(),
    // JSON copy: the design may be a Vue reactive proxy.
    design: DesignSchema.parse(JSON.parse(JSON.stringify(design))),
  };
  await saveMyTemplates([t, ...list.filter((x) => x.id !== t.id)]);
  return t;
}

export async function deleteMyTemplate(id: string): Promise<void> {
  await saveMyTemplates((await getMyTemplates()).filter((t) => t.id !== id));
}

/** A saved design applied to a resume: its page size and language stay. */
export function applyMyTemplate(t: MyTemplate, keep: Pick<Design, 'page' | 'docLang'>): Design {
  return DesignSchema.parse({ ...t.design, template: `${MY_TEMPLATE_PREFIX}${t.id}`, ...keep });
}

/** Bullets as rich text: "- one\n- two". */
function bulletText(lines: string[]): string {
  return lines
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => `- ${l}`)
    .join('\n');
}

/**
 * A resume filled from the AnswerSnap profile (built from the user's own resume and sources)
 * and, when present, contact details from Applicant details. Nothing is invented.
 */
export function resumeFromProfile(p: CandidateProfile, a?: Applicant | null): Resume {
  const r = newResume({ name: 'My resume', design: applyTemplate('modern') });
  const place =
    p.location ??
    (a?.residence.city
      ? [a.residence.city, a.residence.country ? countryName(a.residence.country) : '']
          .filter(Boolean)
          .join(', ')
      : '');
  r.personal = PersonalSchema.parse({
    fullName: p.fullName ?? (a ? [a.givenNames, a.familyName].filter(Boolean).join(' ') : ''),
    jobTitle: p.headline ?? '',
    email: p.email ?? a?.email ?? '',
    phone: p.phone ?? '',
    location: place,
    details: p.links.map((l) => {
      const url = l.url;
      // The platform the address is on (a host at the start or after "//" or "."), else a website.
      const on = (host: string) =>
        new RegExp(`(^|[/.])${host.replace(/\./g, '\\.')}([/:?#]|$)`, 'i').test(url);
      const platforms = [
        ['linkedin', /linkedin/i.test(url)],
        ['github', /github/i.test(url)],
        ['gitlab', on('gitlab.com')],
        ['stackoverflow', on('stackoverflow.com')],
        ['orcid', on('orcid.org')],
        ['scholar', /(^|[/.])scholar\.google\./i.test(url)],
        ['researchgate', on('researchgate.net')],
        ['behance', on('behance.net')],
        ['dribbble', on('dribbble.com')],
        ['medium', on('medium.com')],
        ['x', on('x.com') || on('twitter.com')],
        ['youtube', on('youtube.com') || on('youtu.be')],
        ['instagram', on('instagram.com')],
        ['telegram', on('t.me') || on('telegram.me')],
        ['whatsapp', on('wa.me') || on('whatsapp.com')],
      ] as const;
      const kind = platforms.find(([, hit]) => hit)?.[0] ?? 'website';
      return { kind, label: l.label, value: url } as const;
    }),
  });

  const sections: Section[] = [];
  if (p.summary) sections.push(newSection('profile', { text: p.summary }));
  if (p.experience.length)
    sections.push(
      newSection('experience', {
        entries: p.experience.map((x) =>
          newEntry({
            title: x.title,
            subtitle: x.company,
            city: x.location ?? '',
            start: toMonthYear(x.start),
            end: toMonthYear(x.end),
            present: isPresent(x.end),
            description: bulletText(x.bullets),
          }),
        ),
      }),
    );
  if (p.education.length)
    sections.push(
      newSection('education', {
        entries: p.education.map((x) =>
          newEntry({
            title: [x.degree, x.field].filter(Boolean).join(', '),
            subtitle: x.institution,
            start: toMonthYear(x.start),
            end: toMonthYear(x.end),
            present: isPresent(x.end),
          }),
        ),
      }),
    );
  if (p.projects.length)
    sections.push(
      newSection('projects', {
        entries: p.projects.map((x) =>
          newEntry({
            title: x.name,
            link: x.url ?? '',
            description: [x.description, bulletText(x.highlights)].filter(Boolean).join('\n'),
          }),
        ),
      }),
    );
  if (p.skills.length)
    sections.push(
      newSection('skills', {
        entries: p.skills.map((x) =>
          newEntry({
            title: x.name,
            info: x.years ? `${x.years} ${x.years === 1 ? 'year' : 'years'}` : '',
          }),
        ),
      }),
    );
  if (p.languages.length)
    sections.push(
      newSection('languages', {
        entries: p.languages.map((x) => newEntry({ title: x.language, info: x.level ?? '' })),
      }),
    );
  if (p.certifications.length)
    sections.push(
      newSection('certificates', {
        entries: p.certifications.map((x) =>
          newEntry({ title: x.name, subtitle: x.issuer ?? '', date: toMonthYear(x.year) }),
        ),
      }),
    );
  if (p.achievements.length)
    sections.push(
      newSection('awards', { entries: p.achievements.map((x) => newEntry({ title: x })) }),
    );
  r.sections = sections.length ? sections : r.sections;
  return r;
}
