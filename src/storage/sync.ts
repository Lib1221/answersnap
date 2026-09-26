import { storage } from 'wxt/utils/storage';
import { z } from 'zod';
import {
  ApplicationsSchema,
  getApplications,
  saveApplications,
  type Application,
} from '@/kb/applications';
import { ProfileRecordSchema, StandardAnswersSchema } from '@/kb/profileSchema';
import {
  getProfile,
  getSettings,
  getSources,
  getStandardAnswers,
  profileItem,
  saveSettings,
  saveSources,
  saveStandardAnswers,
} from './items';
import { SettingsSchema, SourcesSchema, type KnowledgeSource, type Settings } from './schema';

// Sync across devices through the user's Chrome account (storage.sync), opt-in. Chrome allows
// about 100 KB in total and 8 KB per item, so the synced set is the small, hand-made data:
// settings (never API keys), profile, standard answers, stories, the cover letter, and tracked
// applications. Resume and website sources and the answer library stay on each device.
// The bundle is gzipped (the browser's CompressionStream, no library) and split into chunks.

const CHUNK_CHARS = 7000;
const META_KEY = 'answersnap:meta';
const chunkKey = (i: number) => `answersnap:chunk:${i}`;
const SYNCED_KINDS: KnowledgeSource['kind'][] = ['story', 'cover-letter'];
/** Local keys whose changes trigger a push. */
export const WATCHED_LOCAL_KEYS = [
  'settings',
  'profile',
  'standardAnswers',
  'sources',
  'applications',
];

const SyncedSettingsSchema = SettingsSchema.omit({ baseUrl: true, syncEnabled: true });

export const BundleSchema = z.object({
  v: z.literal(1),
  settings: SyncedSettingsSchema,
  profile: ProfileRecordSchema.nullable(),
  standardAnswers: StandardAnswersSchema,
  sources: SourcesSchema,
  applications: ApplicationsSchema,
});
export type SyncBundle = z.infer<typeof BundleSchema>;

const MetaSchema = z.object({
  v: z.literal(1),
  at: z.string(),
  device: z.string(),
  chunks: z.number(),
  hash: z.string(),
});
type Meta = z.infer<typeof MetaSchema>;

const stateItem = storage.defineItem<{
  device: string;
  /** Hash of the bundle last written or applied: nothing to do while local data matches it. */
  hash: string;
  lastSync: string | null;
  error: string | null;
}>('local:syncState', { fallback: { device: '', hash: '', lastSync: null, error: null } });

/** Read-only: showing the sync panel must not write anything (Delete all data stays empty). */
export async function getSyncState() {
  return stateItem.getValue();
}

/** The state with this device's id, created the first time sync actually runs. */
async function deviceState() {
  const s = await stateItem.getValue();
  if (s.device) return s;
  const next = { ...s, device: crypto.randomUUID() };
  await stateItem.setValue(next);
  return next;
}
export const watchSyncState = (cb: () => void) => stateItem.watch(cb);

/** FNV-1a: cheap change detection, not security. */
export function hashText(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

export async function buildBundle(): Promise<SyncBundle> {
  const { baseUrl: _dev, syncEnabled: _on, ...settings } = await getSettings();
  return {
    v: 1,
    settings,
    profile: await getProfile(),
    standardAnswers: await getStandardAnswers(),
    sources: (await getSources()).filter((s) => SYNCED_KINDS.includes(s.kind)),
    applications: await getApplications(),
  };
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream) {
  return new Uint8Array(
    await new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(stream)).arrayBuffer(),
  );
}

export async function encodeBundle(bundle: SyncBundle): Promise<string[]> {
  const gz = await pipe(
    new TextEncoder().encode(JSON.stringify(bundle)),
    new CompressionStream('gzip'),
  );
  let bin = '';
  for (let i = 0; i < gz.length; i += 0x8000)
    bin += String.fromCharCode(...gz.subarray(i, i + 0x8000));
  const b64 = btoa(bin);
  const chunks: string[] = [];
  for (let i = 0; i < b64.length; i += CHUNK_CHARS) chunks.push(b64.slice(i, i + CHUNK_CHARS));
  return chunks;
}

export async function decodeBundle(chunks: string[]): Promise<SyncBundle> {
  const bin = atob(chunks.join(''));
  const gz = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  const json = new TextDecoder().decode(await pipe(gz, new DecompressionStream('gzip')));
  return BundleSchema.parse(JSON.parse(json));
}

/** Both devices' applications: the newer copy of each wins; nothing is dropped. */
export function mergeApplications(local: Application[], remote: Application[]): Application[] {
  const byId = new Map(local.map((a) => [a.id, a]));
  for (const r of remote) {
    const l = byId.get(r.id);
    if (!l || r.updatedAt > l.updatedAt) byId.set(r.id, r);
  }
  return [...byId.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/** Replace the synced parts of local data with the bundle; everything else stays. */
export async function applyBundle(bundle: SyncBundle): Promise<void> {
  const { syncEnabled, baseUrl } = await getSettings();
  await saveSettings({ ...(bundle.settings as Partial<Settings>), syncEnabled, baseUrl });
  if (bundle.profile) await profileItem.setValue(bundle.profile);
  await saveStandardAnswers(bundle.standardAnswers);
  const kept = (await getSources()).filter((s) => !SYNCED_KINDS.includes(s.kind));
  await saveSources([...kept, ...bundle.sources]);
  await saveApplications(mergeApplications(await getApplications(), bundle.applications));
}

async function setState(patch: Partial<Awaited<ReturnType<typeof getSyncState>>>) {
  await stateItem.setValue({ ...(await deviceState()), ...patch });
}

/** Write local data to sync, unless it hasn't changed since the last push or pull. */
export async function pushSync(now = new Date()): Promise<'pushed' | 'unchanged' | 'off'> {
  if (!(await getSettings()).syncEnabled) return 'off';
  const state = await deviceState();
  const bundle = await buildBundle();
  const hash = hashText(JSON.stringify(bundle));
  if (hash === state.hash) return 'unchanged';
  const chunks = await encodeBundle(bundle);
  const { [META_KEY]: old } = await browser.storage.sync.get(META_KEY);
  const oldCount = MetaSchema.safeParse(old).data?.chunks ?? 0;
  const meta: Meta = {
    v: 1,
    at: now.toISOString(),
    device: state.device,
    chunks: chunks.length,
    hash,
  };
  try {
    await browser.storage.sync.set({
      ...Object.fromEntries(chunks.map((c, i) => [chunkKey(i), c])),
      [META_KEY]: meta,
    });
  } catch (err) {
    await setState({
      error: /QUOTA/i.test(String(err))
        ? 'Too much to sync. Remove some applications or stories, or turn sync off.'
        : "Couldn't sync. Chrome will try again later.",
    });
    return 'unchanged';
  }
  const stale = Array.from({ length: Math.max(0, oldCount - chunks.length) }, (_, i) =>
    chunkKey(chunks.length + i),
  );
  if (stale.length) await browser.storage.sync.remove(stale);
  await setState({ hash, lastSync: meta.at, error: null });
  return 'pushed';
}

/** Apply what another device wrote. */
export async function pullSync(): Promise<'applied' | 'nothing' | 'off'> {
  if (!(await getSettings()).syncEnabled) return 'off';
  const state = await deviceState();
  const { [META_KEY]: raw } = await browser.storage.sync.get(META_KEY);
  const meta = MetaSchema.safeParse(raw);
  if (!meta.success || meta.data.device === state.device || meta.data.hash === state.hash)
    return 'nothing';
  const keys = Array.from({ length: meta.data.chunks }, (_, i) => chunkKey(i));
  const got = await browser.storage.sync.get(keys);
  try {
    await applyBundle(await decodeBundle(keys.map((k) => String(got[k] ?? ''))));
  } catch {
    // A half-written bundle from the other device; its next write fixes it.
    return 'nothing';
  }
  await setState({ hash: meta.data.hash, lastSync: meta.data.at, error: null });
  return 'applied';
}

let pushTimer: ReturnType<typeof setTimeout> | undefined;
/** Batch bursts of local changes into one write (sync allows about 120 writes a minute). */
export function schedulePush(delayMs = 3000) {
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => void pushSync(), delayMs);
}

/** Service worker listeners, registered synchronously at top level. */
export function registerSync() {
  browser.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && META_KEY in changes) void pullSync();
    if (area === 'local' && WATCHED_LOCAL_KEYS.some((k) => k in changes)) schedulePush();
  });
}

/** Another device's synced copy, if there is one: turning sync on asks what to do with it. */
export async function remoteCopy(): Promise<{ at: string } | null> {
  const { [META_KEY]: raw } = await browser.storage.sync.get(META_KEY);
  const meta = MetaSchema.safeParse(raw);
  if (!meta.success) return null;
  return meta.data.device === (await getSyncState()).device ? null : { at: meta.data.at };
}

/**
 * Turning sync on. 'remote': use the synced copy here (applications are merged either way), then
 * write the result back. 'local': this device's data replaces the synced copy.
 */
export async function startSync(use: 'remote' | 'local'): Promise<void> {
  await saveSettings({ syncEnabled: true });
  await setState({ hash: '' });
  if (use === 'remote') await pullSync();
  await setState({ hash: '' });
  await pushSync();
}

export async function stopSync(removeCopy: boolean): Promise<void> {
  await saveSettings({ syncEnabled: false });
  if (removeCopy) await browser.storage.sync.clear();
  await stateItem.removeValue();
}
