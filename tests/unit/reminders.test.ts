import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { checkReminders, dueReminders, reminderText } from '@/background/reminders';
import { saveApplications, type Application } from '@/kb/applications';
import { saveSettings } from '@/storage/items';

beforeEach(() => fakeBrowser.reset());

const now = new Date('2026-09-26T12:00:00Z');
function applied(id: string, at: string, extra: Partial<Application> = {}): Application {
  return {
    id,
    hostname: 'acme.com',
    url: '',
    company: 'Acme',
    role: 'Backend Engineer',
    status: 'applied',
    notes: '',
    createdAt: at,
    updatedAt: at,
    history: [{ status: 'applied', at }],
    ...extra,
  };
}

describe('follow-up reminders', () => {
  it('reminds once per quiet spell', () => {
    const a = applied('a', '2026-09-15T00:00:00Z');
    expect(dueReminders([a], {}, now)).toHaveLength(1);
    expect(dueReminders([a], { a: '2026-09-15T00:00:00Z' }, now)).toHaveLength(0);
    // A follow-up restarts the clock; once it goes quiet again, it reminds again.
    const later = { ...a, followedUpAt: '2026-09-18T00:00:00Z' };
    expect(dueReminders([later], { a: '2026-09-15T00:00:00Z' }, now)).toHaveLength(1);
  });

  it('words one or many', () => {
    const one = reminderText([{ application: applied('a', ''), days: 9 }]);
    expect(one.message).toBe('Backend Engineer at Acme: applied, no news in 9 days.');
    const many = reminderText([
      { application: applied('a', ''), days: 9 },
      { application: applied('b', ''), days: 8 },
    ]);
    expect(many.message).toContain('2 applications');
  });

  it('notifies, remembers, and respects the setting', async () => {
    const create = vi
      .spyOn(fakeBrowser.notifications, 'create')
      .mockResolvedValue(undefined as never);
    await saveApplications([applied('a', '2026-09-15T00:00:00Z')]);
    expect(await checkReminders(now)).toHaveLength(1);
    expect(create).toHaveBeenCalledTimes(1);
    expect(await checkReminders(now)).toHaveLength(0);

    await saveApplications([applied('b', '2026-09-10T00:00:00Z')]);
    await saveSettings({ followUpReminders: false });
    expect(await checkReminders(now)).toHaveLength(0);
    expect(create).toHaveBeenCalledTimes(1);
  });
});
