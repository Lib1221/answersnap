import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import {
  countByStatus,
  getApplications,
  removeApplication,
  toCsv,
  trackJob,
  updateApplication,
} from '@/kb/applications';
import { buildExport, parseImport } from '@/storage/exportImport';

beforeEach(() => fakeBrowser.reset());

const job = { hostname: 'jobs.acme.com', company: 'Acme', role: 'Backend Engineer' };

describe('application tracker', () => {
  it('tracks a job post once and fills in what was missing later', async () => {
    const first = await trackJob({ ...job, company: null }, new Date('2026-09-01T10:00:00Z'));
    expect(first).toMatchObject({ status: 'saved', company: null, url: '' });
    const again = await trackJob(
      { ...job, role: 'backend engineer ', url: 'https://jobs.acme.com/1' },
      new Date('2026-09-02T10:00:00Z'),
    );
    expect(again.id).toBe(first.id);
    expect(again).toMatchObject({ company: 'Acme', url: 'https://jobs.acme.com/1' });
    expect(await getApplications()).toHaveLength(1);
    // A different role on the same site is a separate application.
    await trackJob({ ...job, role: 'Data Engineer' });
    expect(await getApplications()).toHaveLength(2);
  });

  it('records status history, counts, and exports CSV', async () => {
    const a = await trackJob(job, new Date('2026-09-01T10:00:00Z'));
    await updateApplication(a.id, { status: 'applied' }, new Date('2026-09-03T10:00:00Z'));
    await updateApplication(a.id, { notes: 'Talked to "Dana", team of 5' });
    await updateApplication(a.id, { status: 'applied' });
    const [saved] = await getApplications();
    expect(saved!.history.map((h) => h.status)).toEqual(['saved', 'applied']);
    expect(countByStatus([saved!])).toMatchObject({ saved: 0, applied: 1, offer: 0 });
    const csv = toCsv([saved!]);
    expect(csv.split('\n')[0]).toBe('Company,Role,Site,Status,Saved,Applied,Last update,Notes');
    expect(csv).toContain('Acme,Backend Engineer,jobs.acme.com,Applied,2026-09-01,2026-09-03,');
    expect(csv).toContain('"Talked to ""Dana"", team of 5"');

    await removeApplication(a.id);
    expect(await getApplications()).toEqual([]);
  });

  it('is part of backups, and older backups without it still import', async () => {
    await trackJob(job);
    const data = await buildExport();
    expect(data.applications).toHaveLength(1);
    const { applications: _drop, ...old } = data;
    const parsed = parseImport(JSON.stringify(old));
    expect(parsed.ok && parsed.data.applications).toEqual([]);
  });
});
