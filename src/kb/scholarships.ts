import { storage } from 'wxt/utils/storage';
import { z } from 'zod';
import type { Requirements } from '@/llm/requirements';
import { t } from '@/ui/i18n';

// Scholarship tracker (the Study tab): every call the applicant is working on, with its closing
// date, the documents still to prepare, and where the application stands. Local storage only.

export const SCHOLARSHIP_STATUSES = [
  'planning',
  'preparing',
  'submitted',
  'interview',
  'awarded',
  'rejected',
  'withdrawn',
] as const;
export type ScholarshipStatus = (typeof SCHOLARSHIP_STATUSES)[number];

export const SCHOLARSHIP_STATUS_LABELS: Record<ScholarshipStatus, string> = {
  planning: t('sch_status_planning', 'Planning'),
  preparing: t('sch_status_preparing', 'Preparing'),
  submitted: t('sch_status_submitted', 'Submitted'),
  interview: t('sch_status_interview', 'Interview'),
  awarded: t('sch_status_awarded', 'Awarded'),
  rejected: t('sch_status_rejected', 'Rejected'),
  withdrawn: t('sch_status_withdrawn', 'Withdrawn'),
};
/** Still to be sent: these get deadline reminders. */
const OPEN: ReadonlySet<ScholarshipStatus> = new Set(['planning', 'preparing']);
export const isOpen = (s: Scholarship) => OPEN.has(s.status);

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const ScholarshipSchema = z.object({
  id: z.string(),
  program: z.string().min(1).max(300),
  institution: z.string().max(300).default(''),
  url: z.string().max(2000).default(''),
  hostname: z.string().max(253).default(''),
  status: z.enum(SCHOLARSHIP_STATUSES).default('planning'),
  /** The closing date (YYYY-MM-DD), or null when unknown. */
  deadline: z.string().regex(ISO_DATE).nullable().default(null),
  /** Every dated step the call lists, for reference. */
  steps: z
    .array(z.object({ what: z.string(), date: z.string().regex(ISO_DATE).nullable() }))
    .default([]),
  documents: z.array(z.object({ name: z.string(), done: z.boolean().default(false) })).default([]),
  notes: z.string().max(4000).default(''),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Scholarship = z.infer<typeof ScholarshipSchema>;
export const ScholarshipsSchema = z.array(ScholarshipSchema);

const item = storage.defineItem<unknown>('local:scholarships');

export async function getScholarships(): Promise<Scholarship[]> {
  const raw = (await item.getValue()) ?? [];
  if (!Array.isArray(raw)) return [];
  // Keep what parses rather than losing every entry for one bad one.
  return raw.flatMap((x) => {
    const p = ScholarshipSchema.safeParse(x);
    return p.success ? [p.data] : [];
  });
}
export async function saveScholarships(list: Scholarship[]): Promise<void> {
  await item.setValue(ScholarshipsSchema.parse(list));
}
export function watchScholarships(cb: () => void): () => void {
  return item.watch(cb);
}

const DAY = 24 * 60 * 60 * 1000;
const dayOf = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Whole days from today (the applicant's own day) to a date: 0 is today, negative is past. */
export function daysUntil(date: string, now = new Date()): number {
  return Math.round((Date.parse(date) - Date.parse(dayOf(now))) / DAY);
}

/** The date applications close: the step that says so, else the last dated step. */
export function closingDate(r: Requirements): string | null {
  const dated = r.deadlines.filter((d) => d.date);
  return (
    dated.find((d) => /clos|deadline|due|until|scadenza|entro|termine/i.test(d.what))?.date ??
    dated.at(-1)?.date ??
    null
  );
}

/** Open ones by closing date (soonest first, undated last), then the rest, newest first. */
export function sortScholarships(list: Scholarship[]): Scholarship[] {
  return [...list].sort((a, b) => {
    if (isOpen(a) !== isOpen(b)) return isOpen(a) ? -1 : 1;
    if (isOpen(a)) return (a.deadline ?? '9999').localeCompare(b.deadline ?? '9999');
    return b.updatedAt.localeCompare(a.updatedAt);
  });
}

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Track a call read from its page, or refresh the one already tracked (ticks and notes kept). */
export async function trackScholarship(
  input: {
    program: string;
    institution: string;
    hostname: string;
    url: string;
    deadline: string | null;
    steps: Scholarship['steps'];
    documents: Scholarship['documents'];
  },
  now = new Date(),
): Promise<Scholarship> {
  const list = await getScholarships();
  const iso = now.toISOString();
  const program = input.program.trim().slice(0, 300) || 'Scholarship';
  const existing = list.find(
    (s) =>
      same(s.program, program) && (!s.hostname || !input.hostname || s.hostname === input.hostname),
  );
  if (existing) {
    const done = new Set(existing.documents.filter((d) => d.done).map((d) => d.name));
    const updated: Scholarship = {
      ...existing,
      institution: input.institution || existing.institution,
      url: input.url || existing.url,
      hostname: input.hostname || existing.hostname,
      deadline: input.deadline ?? existing.deadline,
      steps: input.steps.length ? input.steps : existing.steps,
      documents: input.documents.length
        ? input.documents.map((d) => ({ name: d.name, done: d.done || done.has(d.name) }))
        : existing.documents,
      updatedAt: iso,
    };
    await saveScholarships(list.map((s) => (s.id === existing.id ? updated : s)));
    return updated;
  }
  const created = ScholarshipSchema.parse({
    id: crypto.randomUUID(),
    ...input,
    program,
    institution: input.institution.trim().slice(0, 300),
    status: 'planning',
    createdAt: iso,
    updatedAt: iso,
  });
  await saveScholarships([created, ...list]);
  return created;
}

export async function updateScholarship(
  id: string,
  patch: Partial<Omit<Scholarship, 'id' | 'createdAt'>>,
  now = new Date(),
): Promise<void> {
  const list = await getScholarships();
  await saveScholarships(
    list.map((s) => (s.id === id ? { ...s, ...patch, updatedAt: now.toISOString() } : s)),
  );
}

export async function removeScholarship(id: string): Promise<void> {
  await saveScholarships((await getScholarships()).filter((s) => s.id !== id));
}

// ---- Deadline reminders: 14, 7, 3, and 1 day before an open call closes, each once.

export const REMIND_DAYS = [1, 3, 7, 14] as const;

export interface DueDeadline {
  scholarship: Scholarship;
  days: number;
  /** The reminder this is: remembered so it isn't sent twice. */
  key: string;
}

/**
 * Open calls whose closing date has come within a reminder's range. Only the nearest reminder
 * counts: a call first seen 5 days out gets the 7-day one now and the 3- and 1-day ones later.
 */
export function dueDeadlines(
  list: Scholarship[],
  reminded: Record<string, string[]>,
  now = new Date(),
): DueDeadline[] {
  const out: DueDeadline[] = [];
  for (const s of list) {
    if (!isOpen(s) || !s.deadline) continue;
    const days = daysUntil(s.deadline, now);
    if (days < 0) continue;
    const within = REMIND_DAYS.find((d) => days <= d);
    if (within === undefined) continue;
    const key = `${s.deadline}:${within}`;
    if (!(reminded[s.id] ?? []).includes(key)) out.push({ scholarship: s, days, key });
  }
  return out.sort((a, b) => a.days - b.days);
}
