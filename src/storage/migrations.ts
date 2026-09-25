import { defaultSettings } from '@/config/defaults';
import { SettingsSchema, type Settings } from './schema';

/**
 * v0 was the unversioned shape: settings stored without `schemaVersion`, with a single
 * `apiKey` field inside. v1 moves keys to their own storage entries (never exported).
 */
export interface SettingsV0 {
  apiKey?: string;
  model?: string;
  [key: string]: unknown;
}

export function migrateSettingsV0(raw: SettingsV0): { settings: Settings; apiKey?: string } {
  const { apiKey, ...rest } = raw;
  const provider = rest.provider === 'gemini' ? 'gemini' : 'anthropic';
  const settings = SettingsSchema.parse({
    ...defaultSettings(provider),
    ...rest,
    schemaVersion: 1,
  });
  return { settings, apiKey: typeof apiKey === 'string' ? apiKey : undefined };
}
