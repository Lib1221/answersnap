import { startSnipFromGesture } from './capture';

export const SNIP_COMMAND = 'snip-question';

/** Keyboard shortcut and toolbar icon both start a snip (spec 4.1, 9.1). */
export function registerCommands(): void {
  browser.commands.onCommand.addListener((command, tab) => {
    if (command === SNIP_COMMAND) startSnipFromGesture(tab, 'question');
  });
  browser.action.onClicked.addListener((tab) => startSnipFromGesture(tab, 'question'));
}
