import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { checkDeadlines, deadlineText } from '@/background/reminders';
import {
  closingDate,
  daysUntil,
  dueDeadlines,
  getScholarships,
  sortScholarships,
  trackScholarship,
  updateScholarship,
  type Scholarship,
} from '@/kb/scholarships';
import type { Requirements } from '@/llm/requirements';
import { saveSettings } from '@/storage/items';
import { applyImport, buildExport, describeImport, parseImport } from '@/storage/exportImport';

// The Study tab's scholarship tracker: closing dates, documents, and deadline reminders.

beforeEach(() => fakeBrowser.reset());

const NOW = new Date('2027-03-01T10:00:00');
const call = (over: Partial<Parameters<typeof trackScholarship>[0]> = {}) => ({
  program: 'Padua International Excellence Scholarship',
  institution: 'University of Padua',
  hostname: 'unipd.example',
  url: 'https://unipd.example/call',
  deadline: '2027-03-15',
  steps: [{ what: 'Applications close', date: '2027-03-15' }],
  documents: [
    { name: 'Copy of passport', done: true },
    { name: 'Motivation letter', done: false },
  ],
  ...over,
});

describe('dates', () => {
  it('counts whole days to a closing date', () => {
    expect(daysUntil('2027-03-15', NOW)).toBe(14);
    expect(daysUntil('2027-03-01', NOW)).toBe(0);
    expect(daysUntil('2027-02-27', NOW)).toBe(-2);
  });

  it('takes the closing date from the step that says so, else the last dated step', () => {
    const r = (deadlines: Requirements['deadlines']) => ({ deadlines }) as Requirements;
    expect(
      closingDate(
        r([
          { what: 'Applications open', date: '2027-01-10', note: '' },
          { what: 'Application deadline', date: '2027-03-15', note: '' },
          { what: 'Results', date: '2027-05-01', note: '' },
        ]),
      ),
    ).toBe('2027-03-15');
    expect(closingDate(r([{ what: 'Window', date: '2027-02-01', note: '' }]))).toBe('2027-02-01');
    expect(closingDate(r([{ what: 'Rolling', date: null, note: '' }]))).toBeNull();
  });
});

describe('tracking', () => {
  it('tracks a call once, and a refresh keeps ticks, status, and notes', async () => {
    const first = await trackScholarship(call(), NOW);
    expect(first).toMatchObject({ status: 'planning', deadline: '2027-03-15' });
    await updateScholarship(first.id, { status: 'preparing', notes: 'Asked Prof. Almeida' });
    // Read again later: the call moved its deadline and added a document.
    const again = await trackScholarship(
      call({
        deadline: '2027-03-22',
        documents: [
          { name: 'Copy of passport', done: false },
          { name: 'Motivation letter', done: false },
          { name: 'Transcript', done: false },
        ],
      }),
    );
    expect(again.id).toBe(first.id);
    expect(again).toMatchObject({
      status: 'preparing',
      notes: 'Asked Prof. Almeida',
      deadline: '2027-03-22',
    });
    expect(again.documents.map((d) => d.done)).toEqual([true, false, false]);
    expect(await getScholarships()).toHaveLength(1);
  });

  it('lists open calls soonest first, undated last, then the finished ones', async () => {
    const mk = (program: string, deadline: string | null, status: Scholarship['status']) =>
      ({ program, deadline, status, updatedAt: program }) as Scholarship;
    const sorted = sortScholarships([
      mk('Sent', '2027-02-01', 'submitted'),
      mk('Undated', null, 'planning'),
      mk('Later', '2027-06-01', 'preparing'),
      mk('Sooner', '2027-03-15', 'planning'),
    ]);
    expect(sorted.map((s) => s.program)).toEqual(['Sooner', 'Later', 'Undated', 'Sent']);
  });
});

describe('deadline reminders', () => {
  it('reminds 14, 7, 3, and 1 day before, each once, and only for calls not yet sent', async () => {
    const s = await trackScholarship(call(), NOW);
    const list = await getScholarships();
    const at = (day: string) => new Date(`${day}T10:00:00`);
    expect(dueDeadlines(list, {}, at('2027-02-20'))).toEqual([]);
    expect(dueDeadlines(list, {}, at('2027-03-01'))[0]).toMatchObject({
      days: 14,
      key: '2027-03-15:14',
    });
    // Already reminded for 14: nothing until the 7-day one.
    const reminded = { [s.id]: ['2027-03-15:14'] };
    expect(dueDeadlines(list, reminded, at('2027-03-04'))).toEqual([]);
    expect(dueDeadlines(list, reminded, at('2027-03-09'))[0]).toMatchObject({ days: 6 });
    expect(dueDeadlines(list, {}, at('2027-03-16'))).toEqual([]);
    expect(dueDeadlines([{ ...list[0]!, status: 'submitted' }], {}, at('2027-03-14'))).toEqual([]);
  });

  it('notifies once per reminder, and not at all when turned off', async () => {
    const create = vi.spyOn(fakeBrowser.notifications, 'create');
    await trackScholarship(call(), NOW);
    expect(await checkDeadlines(NOW)).toHaveLength(1);
    expect(await checkDeadlines(NOW)).toHaveLength(0);
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0]![1]).toMatchObject({
      title: 'A scholarship closes in 14 days',
      message:
        'Padua International Excellence Scholarship closes on 2027-03-15. Open the Study tab to see what is left to do.',
    });
    await saveSettings({ deadlineReminders: false });
    expect(await checkDeadlines(new Date('2027-03-12T10:00:00'))).toHaveLength(0);
  });

  it('words one and several', () => {
    const d = (program: string, days: number) => ({
      scholarship: { program, deadline: '2027-03-15' } as Scholarship,
      days,
      key: 'k',
    });
    expect(deadlineText([d('A', 1)]).title).toBe('A scholarship closes tomorrow');
    expect(deadlineText([d('A', 0), d('B', 3)])).toEqual({
      title: '2 scholarships close soon',
      message: 'The first, A, closes today. Open the Study tab to see them.',
    });
  });
});

describe('backups', () => {
  it('include the tracker, and an older backup without one keeps the current', async () => {
    await trackScholarship(call(), NOW);
    const data = await buildExport();
    expect(data.scholarships).toHaveLength(1);
    expect(describeImport(data)).toContain('1 tracked scholarship');
    const { scholarships: _none, ...older } = data;
    const parsed = parseImport(JSON.stringify(older));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) await applyImport(parsed.data);
    expect(await getScholarships()).toHaveLength(1);
  });
});
