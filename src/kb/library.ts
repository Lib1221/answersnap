import { storage } from 'wxt/utils/storage';
import { z } from 'zod';

// Saved answers library (spec 7.2, 10.5). Local only, capped at 1,000 entries.

export const LIBRARY_CAP = 1000;

export const LibraryEntrySchema = z.object({
  id: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  hostname: z.string(),
  pageTitle: z.string(),
  question: z.string(),
  questionType: z.string(),
  answer: z.string(),
  model: z.string(),
  pinned: z.boolean(),
  uses: z.number(),
});
export type LibraryEntry = z.infer<typeof LibraryEntrySchema>;
export const LibrarySchema = z.array(LibraryEntrySchema);

export const libraryItem = storage.defineItem<unknown>('local:library');

export async function getLibrary(): Promise<LibraryEntry[]> {
  const raw = await libraryItem.getValue();
  if (raw == null) return [];
  const parsed = LibrarySchema.safeParse(raw);
  if (parsed.success) return parsed.data;
  // Keep what parses rather than dropping the whole library for one bad row.
  return Array.isArray(raw)
    ? raw.flatMap((r) => (LibraryEntrySchema.safeParse(r).success ? [r as LibraryEntry] : []))
    : [];
}

/** How far back "earlier in this application" reaches. */
export const APPLICATION_WINDOW_HOURS = 24;

/**
 * Answers given on this site recently: the earlier pages of a multi-page application. Newest
 * first; the current question is left out.
 */
export function earlierOnSite(
  entries: LibraryEntry[],
  hostname: string,
  exceptQuestion = '',
  now = new Date(),
  limit = 8,
): LibraryEntry[] {
  const since = now.getTime() - APPLICATION_WINDOW_HOURS * 60 * 60 * 1000;
  const skip = exceptQuestion.trim().toLowerCase();
  return entries
    .filter(
      (e) =>
        e.hostname === hostname &&
        Date.parse(e.updatedAt) >= since &&
        e.question.trim().toLowerCase() !== skip,
    )
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, limit);
}

/** Over the cap, the oldest unpinned entries go first. */
export function enforceCap(entries: LibraryEntry[], cap = LIBRARY_CAP): LibraryEntry[] {
  if (entries.length <= cap) return entries;
  const removable = entries
    .filter((e) => !e.pinned)
    .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))
    .slice(0, entries.length - cap)
    .map((e) => e.id);
  const drop = new Set(removable);
  return entries.filter((e) => !drop.has(e.id));
}

export async function saveLibrary(entries: LibraryEntry[]): Promise<void> {
  await libraryItem.setValue(LibrarySchema.parse(enforceCap(entries)));
}

/** Save the final answer. The same question on the same site updates the earlier entry. */
export async function upsertEntry(
  input: Omit<LibraryEntry, 'id' | 'createdAt' | 'updatedAt' | 'pinned' | 'uses'>,
  now = new Date(),
): Promise<LibraryEntry> {
  const entries = await getLibrary();
  const iso = now.toISOString();
  const existing = entries.find(
    (e) =>
      e.hostname === input.hostname &&
      e.question.trim().toLowerCase() === input.question.trim().toLowerCase(),
  );
  const entry: LibraryEntry = existing
    ? { ...existing, ...input, updatedAt: iso, uses: existing.uses + 1 }
    : { ...input, id: crypto.randomUUID(), createdAt: iso, updatedAt: iso, pinned: false, uses: 1 };
  await saveLibrary(
    existing ? entries.map((e) => (e.id === entry.id ? entry : e)) : [...entries, entry],
  );
  return entry;
}

export async function updateEntry(id: string, patch: Partial<LibraryEntry>): Promise<void> {
  const entries = await getLibrary();
  await saveLibrary(
    entries.map((e) => (e.id === id ? { ...e, ...patch, updatedAt: new Date().toISOString() } : e)),
  );
}

export async function deleteEntry(id: string): Promise<void> {
  await saveLibrary((await getLibrary()).filter((e) => e.id !== id));
}

/** History retention (spec 14.2): unpinned entries older than N days are removed. */
export async function pruneLibrary(retentionDays: number, now = Date.now()): Promise<number> {
  const entries = await getLibrary();
  const cutoff = now - retentionDays * 24 * 60 * 60 * 1000;
  const kept = entries.filter((e) => e.pinned || Date.parse(e.updatedAt) >= cutoff);
  if (kept.length !== entries.length) await saveLibrary(kept);
  return entries.length - kept.length;
}
