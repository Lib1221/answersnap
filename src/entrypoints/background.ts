import { registerCommands } from '@/background/commands';
import { createMenus, registerMenuClicks } from '@/background/menus';
import { registerRouter } from '@/background/router';

export default defineBackground(() => {
  // All listeners are registered synchronously at top level (spec 4).
  // The toolbar icon is a capture trigger, so Chrome must not open the panel on its own.
  void browser.sidePanel.setPanelBehavior({ openPanelOnActionClick: false });

  browser.runtime.onInstalled.addListener(({ reason }) => {
    createMenus();
    if (reason === 'install') void browser.runtime.openOptionsPage();
  });

  registerCommands();
  registerMenuClicks();
  registerRouter();
});
