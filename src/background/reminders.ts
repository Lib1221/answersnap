import { storage } from 'wxt/utils/storage';
import {
  getApplications,
  lastActivity,
  needsFollowUp,
  STATUS_LABELS,
  type Application,
} from '@/kb/applications';
import { getSettings } from '@/storage/items';

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
  const title = 'Time to follow up';
  if (due.length === 1) {
    const { application: a, days } = due[0]!;
    const what = `${a.role || 'Your application'}${a.company ? ` at ${a.company}` : ''}`;
    return {
      title,
      message: `${what}: ${STATUS_LABELS[a.status].toLowerCase()}, no news in ${days} days.`,
    };
  }
  return {
    title,
    message: `${due.length} applications have had no news for a while. Click to see them.`,
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

/** Listeners, registered synchronously at the service worker's top level. */
export function registerReminders() {
  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === REMINDER_ALARM) void checkReminders();
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
