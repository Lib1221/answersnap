import { createRouter } from '@/messaging/send';
import { classifyInjectError, ensureCaptureScript, isRestrictedUrl } from './inject';
import {
  handleRegionSelected,
  handleSelectionCancelled,
  importPageFromTab,
  jobFromSelection,
  startSnip,
} from './capture';

export function registerRouter(): void {
  createRouter({
    // From the side panel: no gesture, so this works only if activeTab is already granted.
    START_SNIP: async (msg) => {
      const tab = await browser.tabs.get(msg.tabId);
      return startSnip({ tabId: msg.tabId, windowId: tab.windowId, url: tab.url }, msg.mode);
    },
    ENSURE_CAPTURE: async (msg) => {
      const tab = await browser.tabs.get(msg.tabId);
      if (isRestrictedUrl(tab.url))
        return { ok: false as const, error: 'RESTRICTED_PAGE' as const };
      try {
        await ensureCaptureScript(msg.tabId);
        return { ok: true as const };
      } catch (err) {
        const code = classifyInjectError(err);
        return { ok: false as const, error: code === 'CAPTURE_FAILED' ? 'INJECT_FAILED' : code };
      }
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
          E2E_JOB_SELECTION: async (msg) => {
            await jobFromSelection(await browser.tabs.get(msg.tabId), undefined);
            return { ok: true as const };
          },
          E2E_IMPORT_PAGE: async (msg) => {
            await importPageFromTab(await browser.tabs.get(msg.tabId));
            return { ok: true as const };
          },
        }
      : {}),
  });
}
