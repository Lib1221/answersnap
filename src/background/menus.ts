import { importPageFromTab, startSnipFromGesture } from './capture';

export const MENU_SNIP_QUESTION = 'snip-question';
export const MENU_IMPORT_PAGE = 'import-page';

/** Context menus are created once per install or update. Chrome groups them under the name. */
export function createMenus(): void {
  browser.contextMenus.removeAll(() => {
    browser.contextMenus.create({
      id: MENU_SNIP_QUESTION,
      title: 'Snip question',
      contexts: ['page', 'selection', 'image', 'link', 'frame'],
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
    else if (info.menuItemId === MENU_IMPORT_PAGE) void importPageFromTab(tab);
  });
}
