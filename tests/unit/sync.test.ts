// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { getApplications, saveApplications, type Application } from '@/kb/applications';
import {
  getApiKey,
  getSettings,
  getSources,
  saveSettings,
  saveSources,
  setApiKey,
} from '@/storage/items';
import type { KnowledgeSource } from '@/storage/schema';
import {
  buildBundle,
  decodeBundle,
  encodeBundle,
  getSyncState,
  mergeApplications,
  pullSync,
  pushSync,
  remoteCopy,
  startSync,
} from '@/storage/sync';

beforeEach(() => fakeBrowser.reset());

const source = (id: string, kind: KnowledgeSource['kind'], text = 'x'): KnowledgeSource => ({
  id,
  kind,
  label: id,
  text,
  chars: text.length,
  importedAt: '',
  enabled: true,
});
const app = (id: string, updatedAt: string, notes = ''): Application => ({
  id,
  hostname: 'acme.com',
  url: '',
  company: 'Acme',
  role: `Role ${id}`,
  status: 'applied',
  notes,
  createdAt: updatedAt,
  updatedAt,
  history: [{ status: 'applied', at: updatedAt }],
});

/** Another computer: same Chrome account (sync storage), its own local storage. */
async function switchDevice() {
  const sync = await fakeBrowser.storage.sync.get(null);
  await fakeBrowser.storage.local.clear();
  await fakeBrowser.storage.sync.set(sync);
}

describe('sync across devices', () => {
  it('round-trips a gzipped bundle across chunks', async () => {
    await saveApplications(
      Array.from({ length: 400 }, (_, i) =>
        app(`a${i}`, '2026-09-01T00:00:00Z', `${Math.random()}`.repeat(4)),
      ),
    );
    const bundle = await buildBundle();
    const chunks = await encodeBundle(bundle);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((c) => c.length <= 7000)).toBe(true);
    expect(await decodeBundle(chunks)).toEqual(bundle);
  });

  it('merges applications: newer copy wins, nothing dropped', () => {
    const merged = mergeApplications(
      [app('a', '2026-09-02T00:00:00Z', 'local'), app('b', '2026-09-01T00:00:00Z')],
      [app('a', '2026-09-03T00:00:00Z', 'remote'), app('c', '2026-09-01T00:00:00Z')],
    );
    expect(merged.map((a) => [a.id, a.notes])).toEqual([
      ['a', 'remote'],
      ['b', ''],
      ['c', ''],
    ]);
  });

  it('pushes only when on and only when something changed', async () => {
    expect(await pushSync()).toBe('off');
    await startSync('local');
    expect((await getSyncState()).lastSync).toBeTruthy();
    expect(await pushSync()).toBe('unchanged');
    await saveSettings({ tone: 'friendly' });
    expect(await pushSync()).toBe('pushed');
  });

  it('a second computer can take the synced data, keeping its own resume and applications', async () => {
    // Computer A.
    await saveSettings({ tone: 'friendly', styleRules: ['Short sentences.'] });
    await setApiKey('gemini', 'AIza-secret-key', 'local');
    await saveSources([
      source('resume-a', 'resume', 'A resume'),
      source('story-1', 'story'),
      source('cl', 'cover-letter'),
    ]);
    await saveApplications([app('a', '2026-09-01T00:00:00Z')]);
    await startSync('local');

    // Computer B, with its own resume and an application.
    await switchDevice();
    await saveSources([source('resume-b', 'resume', 'B resume')]);
    await saveApplications([app('b', '2026-09-05T00:00:00Z')]);
    expect(await remoteCopy()).toMatchObject({ at: expect.any(String) });
    await startSync('remote');

    const settings = await getSettings();
    expect(settings).toMatchObject({
      tone: 'friendly',
      styleRules: ['Short sentences.'],
      syncEnabled: true,
    });
    expect((await getSources()).map((s) => s.id).sort()).toEqual(['cl', 'resume-b', 'story-1']);
    expect((await getApplications()).map((a) => a.id)).toEqual(['b', 'a']);
    // API keys never sync.
    expect(await getApiKey('gemini')).toBeNull();

    // B's merged result went back up; A picks up B's application.
    await switchDevice();
    await saveSettings({ syncEnabled: true });
    expect(await pullSync()).toBe('applied');
    expect((await getApplications()).map((a) => a.id).sort()).toEqual(['a', 'b']);
  });

  it("keeping this computer's data replaces the synced copy", async () => {
    await saveSettings({ tone: 'friendly' });
    await startSync('local');
    await switchDevice();
    await saveSettings({ tone: 'concise' });
    await startSync('local');
    await switchDevice();
    await saveSettings({ syncEnabled: true });
    await pullSync();
    expect((await getSettings()).tone).toBe('concise');
  });

  it('reports a full sync store instead of failing silently', async () => {
    await startSync('local');
    await saveSettings({ tone: 'friendly' });
    vi.spyOn(fakeBrowser.storage.sync, 'set').mockRejectedValueOnce(
      new Error('QUOTA_BYTES quota exceeded'),
    );
    expect(await pushSync()).toBe('unchanged');
    expect((await getSyncState()).error).toContain('Too much to sync');
  });
});
