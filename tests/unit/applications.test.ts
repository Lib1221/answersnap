import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import {
  countByStatus,
  daysIdle,
  getApplications,
  needsFollowUp,
  removeApplication,
  toCsv,
  trackJob,
  updateApplication,
  weekSummary,
  type Application,
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

function app(
  status: Application['status'],
  history: [Application['status'], string][],
  extra: Partial<Application> = {},
): Application {
  return {
    id: Math.random().toString(36),
    hostname: 'x.com',
    url: '',
    company: 'X',
    role: 'Dev',
    status,
    notes: '',
    createdAt: history[0]![1],
    updatedAt: history.at(-1)![1],
    history: history.map(([status, at]) => ({ status, at })),
    ...extra,
  };
}

describe('follow-up radar', () => {
  const now = new Date('2026-09-26T12:00:00Z');

  it('flags applied after 7 quiet days and interviewing after 5; a follow-up resets the clock', () => {
    const applied9 = app('applied', [
      ['saved', '2026-09-10T00:00:00Z'],
      ['applied', '2026-09-17T10:00:00Z'],
    ]);
    const applied3 = app('applied', [
      ['saved', '2026-09-20T00:00:00Z'],
      ['applied', '2026-09-23T10:00:00Z'],
    ]);
    const interview6 = app('interviewing', [
      ['saved', '2026-09-01T00:00:00Z'],
      ['interviewing', '2026-09-20T10:00:00Z'],
    ]);
    const saved30 = app('saved', [['saved', '2026-08-27T00:00:00Z']]);
    const followed = app('applied', [['applied', '2026-09-10T00:00:00Z']], {
      followedUpAt: '2026-09-24T00:00:00Z',
    });
    expect(daysIdle(applied9, now)).toBe(9);
    expect(daysIdle(followed, now)).toBe(2);
    const due = needsFollowUp([applied3, interview6, saved30, applied9, followed], now);
    expect(due.map((d) => [d.application.status, d.days])).toEqual([
      ['applied', 9],
      ['interviewing', 6],
    ]);
  });

  it('sums the last 7 days and the reply rate', () => {
    const list = [
      app('interviewing', [
        ['saved', '2026-09-01T00:00:00Z'],
        ['applied', '2026-09-21T00:00:00Z'],
        ['interviewing', '2026-09-25T00:00:00Z'],
      ]),
      app('rejected', [
        ['saved', '2026-09-01T00:00:00Z'],
        ['applied', '2026-09-02T00:00:00Z'],
        ['rejected', '2026-09-10T00:00:00Z'],
      ]),
      app('applied', [
        ['saved', '2026-09-24T00:00:00Z'],
        ['applied', '2026-09-24T01:00:00Z'],
      ]),
      app('applied', [
        ['saved', '2026-09-24T00:00:00Z'],
        ['applied', '2026-09-24T01:00:00Z'],
      ]),
    ];
    expect(weekSummary(list, now)).toEqual({
      saved: 2,
      applied: 3,
      interviews: 1,
      offers: 0,
      replyRate: 50,
    });
    expect(weekSummary(list.slice(0, 2), now).replyRate).toBeNull();
  });
});
