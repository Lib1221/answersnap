import { createRouter } from '@/messaging/send';
import {
  handleRegionSelected,
  handleSelectionCancelled,
  importPageFromTab,
  startSnip,
} from './capture';

export function registerRouter(): void {
  createRouter({
    // From the side panel: no gesture, so this works only if activeTab is already granted.
    START_SNIP: async (msg) => {
      const tab = await browser.tabs.get(msg.tabId);
      return startSnip({ tabId: msg.tabId, windowId: tab.windowId, url: tab.url }, msg.mode);
    },
    REGION_SELECTED: (msg, sender) => handleRegionSelected(msg, sender),
    SELECTION_CANCELLED: async (msg) => {
      await handleSelectionCancelled(msg);
    },
    ...(import.meta.env.MODE === 'e2e'
      ? {
          E2E_START_SNIP: async (msg) => {
            const tab = await browser.tabs.get(msg.tabId);
            return startSnip(
              { tabId: msg.tabId, windowId: tab.windowId, url: tab.url },
              msg.mode ?? 'question',
            );
          },
          E2E_IMPORT_PAGE: async (msg) => {
            await importPageFromTab(await browser.tabs.get(msg.tabId));
            return { ok: true as const };
          },
        }
      : {}),
  });
}
