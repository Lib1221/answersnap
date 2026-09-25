import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { DEFAULT_STYLE_RULES } from '@/config/defaults';
import {
  corruptNoticeItem,
  getApiKey,
  getSettings,
  getSources,
  moveApiKeys,
  saveSettings,
  setApiKey,
} from '@/storage/items';

beforeEach(() => {
  fakeBrowser.reset();
});

describe('settings', () => {
  it('returns defaults when nothing is stored', async () => {
    const s = await getSettings();
    expect(s.provider).toBe('anthropic');
    expect(s.model).toBe('claude-sonnet-5');
    expect(s.fastModel).toBe('claude-haiku-4-5-20251001');
    expect(s.styleRules).toEqual(DEFAULT_STYLE_RULES);
    expect(s.maxOutputTokens).toBe(1024);
  });

  it('fills fields missing from an older v1 object', async () => {
    await fakeBrowser.storage.local.set({
      settings: { schemaVersion: 1, provider: 'gemini', tone: 'friendly' },
    });
    const s = await getSettings();
    expect(s.tone).toBe('friendly');
    expect(s.model).toBe('gemini-3.5-flash');
    expect(s.sendScreenshot).toBe(true);
  });

  it('migrates a v0 object and moves the key out', async () => {
    await fakeBrowser.storage.local.set({
      settings: { apiKey: 'sk-ant-old', model: 'claude-opus-5-5', tone: 'concise' },
    });
    const s = await getSettings();
    expect(s.schemaVersion).toBe(1);
    expect(s.model).toBe('claude-opus-5-5');
    expect(s.tone).toBe('concise');
    const stored = (await fakeBrowser.storage.local.get('settings')).settings as Record<
      string,
      unknown
    >;
    expect(stored).not.toHaveProperty('apiKey');
    expect(await getApiKey('anthropic')).toBe('sk-ant-old');
  });

  it('backs up corrupt data, resets, and flags a notice', async () => {
    await fakeBrowser.storage.local.set({
      settings: { schemaVersion: 1, maxOutputTokens: 'lots' },
    });
    const s = await getSettings();
    expect(s.maxOutputTokens).toBe(1024);
    const all = await fakeBrowser.storage.local.get(null);
    const backups = Object.keys(all).filter((k) => k.startsWith('corrupt:settings:'));
    expect(backups).toHaveLength(1);
    expect(all[backups[0]!]).toEqual({ schemaVersion: 1, maxOutputTokens: 'lots' });
    expect(await corruptNoticeItem.getValue()).toEqual(backups);
  });

  it('saves partial updates', async () => {
    await saveSettings({ tone: 'friendly' });
    expect((await getSettings()).tone).toBe('friendly');
  });
});

describe('api keys', () => {
  it('keeps one key per provider', async () => {
    await setApiKey('anthropic', ' sk-ant-1 ', 'local');
    await setApiKey('gemini', 'AIza-2', 'local');
    expect(await getApiKey('anthropic')).toBe('sk-ant-1');
    expect(await getApiKey('gemini')).toBe('AIza-2');
  });

  it('moves keys to session storage and back', async () => {
    await setApiKey('anthropic', 'sk-ant-1', 'local');
    await moveApiKeys('session');
    expect(await fakeBrowser.storage.local.get('apiKey:anthropic')).toEqual({});
    expect(await fakeBrowser.storage.session.get('apiKey:anthropic')).toEqual({
      'apiKey:anthropic': 'sk-ant-1',
    });
    expect(await getApiKey('anthropic')).toBe('sk-ant-1');
  });

  it('never stores keys in sync storage', async () => {
    await setApiKey('gemini', 'AIza-2', 'local');
    expect(await fakeBrowser.storage.sync.get(null)).toEqual({});
  });
});

describe('sources', () => {
  it('backs up and resets an invalid list', async () => {
    await fakeBrowser.storage.local.set({ sources: [{ id: 1 }] });
    expect(await getSources()).toEqual([]);
    expect(await corruptNoticeItem.getValue()).toHaveLength(1);
  });
});
