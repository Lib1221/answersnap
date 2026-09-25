import { registerCommands } from '@/background/commands';
import { createMenus, registerMenuClicks } from '@/background/menus';
import { registerRouter } from '@/background/router';
import { pruneLibrary } from '@/kb/library';
import { getSettings } from '@/storage/items';

export default defineBackground(() => {
  // All listeners are registered synchronously at top level (spec 4).
  // The toolbar icon is a capture trigger, so Chrome must not open the panel on its own.
  void browser.sidePanel.setPanelBehavior({ openPanelOnActionClick: false });

  browser.runtime.onInstalled.addListener(({ reason }) => {
    createMenus();
    if (reason === 'install') void browser.runtime.openOptionsPage();
  });

  // History retention runs at start-up; no alarms permission needed (spec 14.2).
  void getSettings().then((s) => pruneLibrary(s.history.retentionDays));

  registerCommands();
  registerMenuClicks();
  registerRouter();
});
