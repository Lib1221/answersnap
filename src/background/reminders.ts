import { storage } from 'wxt/utils/storage';
import {
  getApplications,
  lastActivity,
  needsFollowUp,
  STATUS_LABELS,
  type Application,
} from '@/kb/applications';
import { dueDeadlines, getScholarships, type DueDeadline } from '@/kb/scholarships';
import { safeUrl } from '@/kb/richText';
import { getSettings } from '@/storage/items';
import { t } from '@/ui/i18n';

// Follow-up reminders: a Chrome notification when an application has gone quiet (the same rule as
// the radar on the Applications page). Local only: nothing leaves the browser.

export const REMINDER_ALARM = 'follow-up-check';
export const REMINDER_NOTIFICATION = 'follow-up';
const CHECK_EVERY_MINUTES = 6 * 60;

/** Application id -> the activity time we already reminded about, so each quiet spell pings once. */
const remindedItem = storage.defineItem<Record<string, string>>('local:remindedFollowUps', {
  fallback: {},
});

type Due = { application: Application; days: number };

export function dueReminders(
  list: Application[],
  reminded: Record<string, string>,
  now = new Date(),
): Due[] {
  return needsFollowUp(list, now).filter(
    ({ application }) => reminded[application.id] !== lastActivity(application),
  );
}

export function reminderText(due: Due[]): { title: string; message: string } {
  const title = t('reminder_title', 'Time to follow up');
  if (due.length === 1) {
    const { application: a, days } = due[0]!;
    const role = a.role || t('reminder_your_application', 'Your application');
    const what = a.company ? t('reminder_role_at_company', '$1 at $2', role, a.company) : role;
    return {
      title,
      message: t(
        'reminder_one',
        '$1: $2, no news in $3 days.',
        what,
        STATUS_LABELS[a.status].toLowerCase(),
        String(days),
      ),
    };
  }
  return {
    title,
    message: t(
      'reminder_many',
      '$1 applications have had no news for a while. Click to see them.',
      String(due.length),
    ),
  };
}

export async function checkReminders(now = new Date()): Promise<Due[]> {
  const settings = await getSettings();
  if (!settings.followUpReminders) return [];
  const reminded = await remindedItem.getValue();
  const due = dueReminders(await getApplications(), reminded, now);
  if (!due.length) return [];
  await browser.notifications.create(REMINDER_NOTIFICATION, {
    type: 'basic',
    iconUrl: browser.runtime.getURL('/icons/128.png'),
    ...reminderText(due),
    priority: 0,
  });
  await remindedItem.setValue({
    ...reminded,
    ...Object.fromEntries(due.map((d) => [d.application.id, lastActivity(d.application)])),
  });
  return due;
}

// ---- Scholarship deadlines: 14, 7, 3, and 1 day before a tracked call closes.

export const DEADLINE_NOTIFICATION = 'scholarship-deadline';
/** Scholarship id -> the reminders already sent ("2027-03-15:7"). */
const deadlineRemindedItem = storage.defineItem<Record<string, string[]>>(
  'local:remindedDeadlines',
  { fallback: {} },
);
/** The call page to open when the notification is clicked (one call due), else nothing. */
const deadlineLinkItem = storage.defineItem<string>('local:deadlineReminderLink', { fallback: '' });

const inDays = (days: number) =>
  days === 0
    ? t('deadline_today', 'today')
    : days === 1
      ? t('deadline_tomorrow', 'tomorrow')
      : t('deadline_in_days', 'in $1 days', String(days));

export function deadlineText(due: DueDeadline[]): { title: string; message: string } {
  const first = due[0]!;
  if (due.length === 1)
    return {
      title: t('deadline_title', 'A scholarship closes $1', inDays(first.days)),
      message: t(
        'deadline_one',
        '$1 closes on $2. Open the Study tab to see what is left to do.',
        first.scholarship.program,
        first.scholarship.deadline!,
      ),
    };
  return {
    title: t('deadline_title_many', '$1 scholarships close soon', String(due.length)),
    message: t(
      'deadline_many',
      'The first, $1, closes $2. Open the Study tab to see them.',
      first.scholarship.program,
      inDays(first.days),
    ),
  };
}

export async function checkDeadlines(now = new Date()): Promise<DueDeadline[]> {
  const settings = await getSettings();
  if (!settings.deadlineReminders) return [];
  const list = await getScholarships();
  const reminded = await deadlineRemindedItem.getValue();
  const due = dueDeadlines(list, reminded, now);
  if (!due.length) return [];
  await browser.notifications.create(DEADLINE_NOTIFICATION, {
    type: 'basic',
    iconUrl: browser.runtime.getURL('/icons/128.png'),
    ...deadlineText(due),
    priority: 1,
  });
  await deadlineLinkItem.setValue(due.length === 1 ? due[0]!.scholarship.url : '');
  // Forget calls that were removed, so the record doesn't grow forever.
  const ids = new Set(list.map((s) => s.id));
  const next = Object.fromEntries(Object.entries(reminded).filter(([id]) => ids.has(id)));
  for (const d of due) next[d.scholarship.id] = [...(next[d.scholarship.id] ?? []), d.key];
  await deadlineRemindedItem.setValue(next);
  return due;
}

/** Listeners, registered synchronously at the service worker's top level. */
export function registerReminders() {
  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name !== REMINDER_ALARM) return;
    void checkReminders();
    void checkDeadlines();
  });
  browser.notifications.onClicked.addListener((id) => {
    if (id !== DEADLINE_NOTIFICATION) return;
    void browser.notifications.clear(id);
    void deadlineLinkItem.getValue().then((link) => {
      // Only a web address the call was tracked from: http or https, nothing else.
      const url = /^https?:\/\//i.test(link) ? safeUrl(link) : null;
      if (url) void browser.tabs.create({ url });
    });
  });
  browser.notifications.onClicked.addListener((id) => {
    if (id !== REMINDER_NOTIFICATION) return;
    void browser.tabs.create({ url: browser.runtime.getURL('/options.html#applications') });
    void browser.notifications.clear(id);
  });
}

/** Alarms survive restarts but not every update; create it when it's missing. */
export async function scheduleReminders() {
  if (!(await browser.alarms.get(REMINDER_ALARM)))
    await browser.alarms.create(REMINDER_ALARM, {
      delayInMinutes: 1,
      periodInMinutes: CHECK_EVERY_MINUTES,
    });
}
