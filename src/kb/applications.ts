import { storage } from 'wxt/utils/storage';
import { z } from 'zod';

// Application tracker: every saved job post becomes an application with a status the candidate
// moves along (saved, applied, interviewing, offer, or closed). Kept in local storage only.

export const APPLICATION_STATUSES = [
  'saved',
  'applied',
  'interviewing',
  'offer',
  'rejected',
  'withdrawn',
] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export const STATUS_LABELS: Record<ApplicationStatus, string> = {
  saved: 'Saved',
  applied: 'Applied',
  interviewing: 'Interviewing',
  offer: 'Offer',
  rejected: 'Rejected',
  withdrawn: 'Withdrawn',
};

export const ApplicationSchema = z.object({
  id: z.string(),
  hostname: z.string(),
  url: z.string().default(''),
  company: z.string().nullable(),
  role: z.string().nullable(),
  status: z.enum(APPLICATION_STATUSES),
  notes: z.string().default(''),
  createdAt: z.string(),
  updatedAt: z.string(),
  history: z.array(z.object({ status: z.enum(APPLICATION_STATUSES), at: z.string() })),
});
export type Application = z.infer<typeof ApplicationSchema>;
export const ApplicationsSchema = z.array(ApplicationSchema);

const applicationsItem = storage.defineItem<unknown>('local:applications');

export async function getApplications(): Promise<Application[]> {
  const parsed = ApplicationsSchema.safeParse((await applicationsItem.getValue()) ?? []);
  return parsed.success ? parsed.data : [];
}

export async function saveApplications(list: Application[]): Promise<void> {
  await applicationsItem.setValue(ApplicationsSchema.parse(list));
}

export function watchApplications(cb: () => void): () => void {
  return applicationsItem.watch(cb);
}

const same = (a: string | null, b: string | null) =>
  (a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase();

/** The application for a saved job post: same site and role (the role may be unknown). */
export function findApplication(
  list: Application[],
  hostname: string,
  role: string | null,
): Application | undefined {
  return list.find((a) => a.hostname === hostname && same(a.role, role));
}

/** Start tracking a saved job post, or refresh the one already tracked. */
export async function trackJob(
  job: { hostname: string; url?: string; company: string | null; role: string | null },
  now = new Date(),
): Promise<Application> {
  const list = await getApplications();
  const iso = now.toISOString();
  const existing = findApplication(list, job.hostname, job.role);
  if (existing) {
    const updated: Application = {
      ...existing,
      company: existing.company ?? job.company,
      url: existing.url || job.url || '',
      updatedAt: iso,
    };
    await saveApplications(list.map((a) => (a.id === existing.id ? updated : a)));
    return updated;
  }
  const created: Application = {
    id: crypto.randomUUID(),
    hostname: job.hostname,
    url: job.url ?? '',
    company: job.company,
    role: job.role,
    status: 'saved',
    notes: '',
    createdAt: iso,
    updatedAt: iso,
    history: [{ status: 'saved', at: iso }],
  };
  await saveApplications([created, ...list]);
  return created;
}

export async function updateApplication(
  id: string,
  patch: Partial<Pick<Application, 'status' | 'notes' | 'company' | 'role'>>,
  now = new Date(),
): Promise<void> {
  const iso = now.toISOString();
  const list = await getApplications();
  await saveApplications(
    list.map((a) => {
      if (a.id !== id) return a;
      const moved = patch.status && patch.status !== a.status;
      return {
        ...a,
        ...patch,
        updatedAt: iso,
        history: moved ? [...a.history, { status: patch.status!, at: iso }] : a.history,
      };
    }),
  );
}

export async function removeApplication(id: string): Promise<void> {
  await saveApplications((await getApplications()).filter((a) => a.id !== id));
}

export function countByStatus(list: Application[]): Record<ApplicationStatus, number> {
  const counts = Object.fromEntries(APPLICATION_STATUSES.map((s) => [s, 0])) as Record<
    ApplicationStatus,
    number
  >;
  for (const a of list) counts[a.status]++;
  return counts;
}

function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** When each status was first reached, for the CSV. */
function reachedAt(a: Application, status: ApplicationStatus): string {
  return a.history.find((h) => h.status === status)?.at.slice(0, 10) ?? '';
}

export function toCsv(list: Application[]): string {
  const header = ['Company', 'Role', 'Site', 'Status', 'Saved', 'Applied', 'Last update', 'Notes'];
  const rows = list.map((a) => [
    a.company ?? '',
    a.role ?? '',
    a.url || a.hostname,
    STATUS_LABELS[a.status],
    a.createdAt.slice(0, 10),
    reachedAt(a, 'applied'),
    a.updatedAt.slice(0, 10),
    a.notes,
  ]);
  return [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\n') + '\n';
}
