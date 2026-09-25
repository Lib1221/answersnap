import { importPageFromTab, jobFromSelection, startSnipFromGesture } from './capture';

export const MENU_SNIP_QUESTION = 'snip-question';
export const MENU_IMPORT_PAGE = 'import-page';
export const MENU_ANSWER_FIELD = 'answer-field';
export const MENU_JOB_SELECTION = 'job-selection';

/** Context menus are created once per install or update. Chrome groups them under the name. */
export function createMenus(): void {
  browser.contextMenus.removeAll(() => {
    browser.contextMenus.create({
      id: MENU_SNIP_QUESTION,
      title: 'Snip question',
      contexts: ['page', 'selection', 'image', 'link', 'frame'],
    });
    browser.contextMenus.create({
      id: MENU_ANSWER_FIELD,
      title: 'Answer this field',
      contexts: ['editable'],
    });
    browser.contextMenus.create({
      id: MENU_JOB_SELECTION,
      title: 'Use selection as job post',
      contexts: ['selection'],
    });
    browser.contextMenus.create({
      id: MENU_IMPORT_PAGE,
      title: 'Import this page into AnswerSnap',
      contexts: ['page'],
    });
  });
}

export function registerMenuClicks(): void {
  browser.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === MENU_SNIP_QUESTION) startSnipFromGesture(tab, 'question');
    else if (info.menuItemId === MENU_ANSWER_FIELD) startSnipFromGesture(tab, 'field');
    else if (info.menuItemId === MENU_JOB_SELECTION) {
      // Open the panel inside the gesture, before any await.
      if (tab?.windowId !== undefined)
        void browser.sidePanel.open({ windowId: tab.windowId }).catch(() => undefined);
      void jobFromSelection(tab, info.selectionText);
    } else if (info.menuItemId === MENU_IMPORT_PAGE) void importPageFromTab(tab);
  });
}
