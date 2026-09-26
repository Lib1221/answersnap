import { registerCommands } from '@/background/commands';
import { createMenus, registerMenuClicks } from '@/background/menus';
import { configurePanel } from '@/background/panel';
import { registerReminders, scheduleReminders } from '@/background/reminders';
import { registerRouter } from '@/background/router';
import { pruneLibrary } from '@/kb/library';
import { getSettings } from '@/storage/items';
import { pullSync, pushSync, registerSync } from '@/storage/sync';

export default defineBackground(() => {
  // All listeners are registered synchronously at top level (spec 4).
  // The toolbar icon is a capture trigger, so Chrome must not open the panel on its own.
  configurePanel();

  browser.runtime.onInstalled.addListener(({ reason }) => {
    createMenus();
    // First run opens the Welcome checklist (spec 3.1).
    if (reason === 'install')
      void browser.tabs.create({ url: browser.runtime.getURL('/options.html#welcome') });
  });

  // History retention runs at start-up; no alarms permission needed (spec 14.2).
  void getSettings().then((s) => pruneLibrary(s.history.retentionDays));

  registerCommands();
  registerMenuClicks();
  registerRouter();
  registerReminders();
  void scheduleReminders();
  registerSync();
  // Catch up with other devices at start-up (no-ops while sync is off).
  void pullSync().then(() => pushSync());
});
