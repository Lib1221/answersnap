import type { CaptureErrorCode } from '@/storage/schema';

const RESTRICTED_PREFIXES = [
  'chrome://',
  'chrome-untrusted://',
  'chrome-search://',
  'edge://',
  'about:',
  'devtools://',
  'view-source:',
  'chrome-extension://',
  'https://chromewebstore.google.com',
  'https://chrome.google.com/webstore',
  'https://microsoftedge.microsoft.com/addons',
];

/** Our own pages that run the capture runtime themselves (the practice form). */
export function isOwnPage(url: string | undefined): boolean {
  return !!url && typeof browser !== 'undefined' && url.startsWith(browser.runtime.getURL('/'));
}

/** Pages Chrome never lets extensions script (spec 4.1). */
export function isRestrictedUrl(url: string | undefined): boolean {
  if (!url || isOwnPage(url)) return false;
  return RESTRICTED_PREFIXES.some((p) => url.startsWith(p));
}

export async function ensureCaptureScript(tabId: number): Promise<void> {
  await browser.scripting.executeScript({
    target: { tabId, frameIds: [0] },
    files: ['/capture.js'],
  });
}

/** Map an executeScript failure to what the panel should tell the user. */
export function classifyInjectError(err: unknown): CaptureErrorCode {
  const message = err instanceof Error ? err.message : String(err);
  if (
    /chrome:\/\/|chrome-extension:\/\/|extensions gallery|webstore|devtools:|view-source|about:/i.test(
      message,
    )
  ) {
    return 'RESTRICTED_PAGE';
  }
  if (/permission|Cannot access contents|activeTab|host/i.test(message)) return 'NEEDS_GESTURE';
  return 'INJECT_FAILED';
}
