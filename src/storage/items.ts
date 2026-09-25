import { storage } from 'wxt/utils/storage';
import type { z } from 'zod';
import { defaultSettings } from '@/config/defaults';
import {
  ProfileRecordSchema,
  StandardAnswersSchema,
  type ProfileRecord,
  type StandardAnswers,
} from '@/kb/profileSchema';
import { migrateSettingsV0, type SettingsV0 } from './migrations';
import {
  CaptureStatusSchema,
  PendingCaptureSchema,
  PendingImportSchema,
  SettingsSchema,
  SourcesSchema,
  type CaptureStatus,
  type KnowledgeSource,
  type PendingCapture,
  type PendingImport,
  type Provider,
  type Settings,
  type SnipMode,
} from './schema';

// storage.session is only readable by extension pages and the SW (default access level).

export const pendingCaptureItem = storage.defineItem<PendingCapture>('session:pendingCapture');
export const captureStatusItem = storage.defineItem<CaptureStatus>('session:captureStatus');

/** Parse a raw stored value; invalid data reads as null. */
export function parseOrNull<S extends z.ZodType>(schema: S, value: unknown): z.infer<S> | null {
  if (value == null) return null;
  const result = schema.safeParse(value);
  if (!result.success) {
    console.warn('[AnswerSnap] dropped invalid stored value', result.error.issues.slice(0, 3));
    return null;
  }
  return result.data;
}

export async function readCaptureStatus(): Promise<CaptureStatus | null> {
  return parseOrNull(CaptureStatusSchema, await captureStatusItem.getValue());
}

/**
 * Reads and deletes the pending capture (it must not outlive one read, hard rule 3). Each
 * consumer takes only its own modes: the side panel takes questions, options takes imports.
 */
export async function takePendingCapture(modes: SnipMode[]): Promise<PendingCapture | null> {
  const raw = await pendingCaptureItem.getValue();
  if (raw == null) return null;
  const mode = (raw as { mode?: unknown }).mode;
  if (!modes.includes(mode as SnipMode)) return null;
  await pendingCaptureItem.removeValue();
  return parseOrNull(PendingCaptureSchema, raw);
}

/** Text read from an open tab by "Import this page into AnswerSnap", waiting for review. */
export const pendingImportItem = storage.defineItem<PendingImport>('session:pendingImport');

export async function readPendingImport(): Promise<PendingImport | null> {
  return parseOrNull(PendingImportSchema, await pendingImportItem.getValue());
}

// ---------------------------------------------------------------------------------------------
// Validated local items (spec 7.1): invalid data is copied to corrupt:<key>:<timestamp>, the
// item resets to defaults, and options shows a notice.

export const CORRUPT_NOTICE_KEY = 'local:corruptNotice';
export const corruptNoticeItem = storage.defineItem<string[]>(CORRUPT_NOTICE_KEY, { fallback: [] });

async function backupCorrupt(key: string, raw: unknown): Promise<void> {
  const backupKey = `corrupt:${key}:${Date.now()}`;
  await storage.setItem(`local:${backupKey}`, raw);
  await corruptNoticeItem.setValue([...(await corruptNoticeItem.getValue()), backupKey]);
}

export const settingsItem = storage.defineItem<unknown>('local:settings');

export async function getSettings(): Promise<Settings> {
  const raw = await settingsItem.getValue();
  if (raw == null) return defaultSettings();
  if (typeof raw === 'object' && !('schemaVersion' in raw)) {
    const { settings, apiKey } = migrateSettingsV0(raw as SettingsV0);
    await settingsItem.setValue(settings);
    if (apiKey) await setApiKey(settings.provider, apiKey, settings.apiKeyStorage);
    return settings;
  }
  const provider = (raw as { provider?: unknown }).provider === 'gemini' ? 'gemini' : 'anthropic';
  const result = SettingsSchema.safeParse({ ...defaultSettings(provider), ...(raw as object) });
  if (result.success) return result.data;
  await backupCorrupt('settings', raw);
  const fresh = defaultSettings();
  await settingsItem.setValue(fresh);
  return fresh;
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = SettingsSchema.parse({ ...(await getSettings()), ...patch });
  await settingsItem.setValue(next);
  return next;
}

export function watchSettings(cb: (s: Settings) => void): () => void {
  return settingsItem.watch(() => void getSettings().then(cb));
}

// ---------------------------------------------------------------------------------------------
// API keys: one per provider, in local storage or (if the user picks it) session storage only.
// Never synced, never exported.

function keyName(provider: Provider, area: 'local' | 'session') {
  return `${area}:apiKey:${provider}` as const;
}

export async function getApiKey(provider: Provider): Promise<string | null> {
  return (
    (await storage.getItem<string>(keyName(provider, 'session'))) ??
    (await storage.getItem<string>(keyName(provider, 'local')))
  );
}

export async function setApiKey(
  provider: Provider,
  key: string,
  area: 'local' | 'session',
): Promise<void> {
  const other = area === 'local' ? 'session' : 'local';
  await storage.removeItem(keyName(provider, other));
  if (key) await storage.setItem(keyName(provider, area), key.trim());
  else await storage.removeItem(keyName(provider, area));
}

/** Move stored keys when the user switches between local and session-only storage. */
export async function moveApiKeys(area: 'local' | 'session'): Promise<void> {
  for (const provider of ['anthropic', 'gemini'] as const) {
    const key = await getApiKey(provider);
    if (key) await setApiKey(provider, key, area);
  }
}

// ---------------------------------------------------------------------------------------------
// Knowledge sources (spec 10.1).

export const sourcesItem = storage.defineItem<unknown>('local:sources');

export async function getSources(): Promise<KnowledgeSource[]> {
  const raw = await sourcesItem.getValue();
  if (raw == null) return [];
  const result = SourcesSchema.safeParse(raw);
  if (result.success) return result.data;
  await backupCorrupt('sources', raw);
  await sourcesItem.setValue([]);
  return [];
}

export async function saveSources(sources: KnowledgeSource[]): Promise<void> {
  await sourcesItem.setValue(SourcesSchema.parse(sources));
}

// ---------------------------------------------------------------------------------------------
// Profile (spec 10.3) and standard answers (spec 10.4).

export const profileItem = storage.defineItem<unknown>('local:profile');

export async function getProfile(): Promise<ProfileRecord | null> {
  const raw = await profileItem.getValue();
  if (raw == null) return null;
  const result = ProfileRecordSchema.safeParse(raw);
  if (result.success) return result.data;
  await backupCorrupt('profile', raw);
  await profileItem.removeValue();
  return null;
}

export async function saveProfile(record: ProfileRecord): Promise<void> {
  await profileItem.setValue(ProfileRecordSchema.parse(record));
}

export const standardAnswersItem = storage.defineItem<unknown>('local:standardAnswers');

export async function getStandardAnswers(): Promise<StandardAnswers> {
  const raw = await standardAnswersItem.getValue();
  const result = StandardAnswersSchema.safeParse(raw ?? {});
  if (result.success) return result.data;
  await backupCorrupt('standardAnswers', raw);
  const fresh = StandardAnswersSchema.parse({});
  await standardAnswersItem.setValue(fresh);
  return fresh;
}

export async function saveStandardAnswers(sa: StandardAnswers): Promise<void> {
  await standardAnswersItem.setValue(StandardAnswersSchema.parse(sa));
}
