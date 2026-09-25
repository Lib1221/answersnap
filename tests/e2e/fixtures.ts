import { test as base, chromium, type BrowserContext, type Page } from '@playwright/test';
import { resolve } from 'node:path';

const extensionPath = resolve(import.meta.dirname, '../../.output/chrome-mv3-e2e');
export const FIXTURES = 'http://127.0.0.1:4610';

interface Fixtures {
  dpr: number;
  context: BrowserContext;
  extensionId: string;
  /** The side panel page, opened as a normal tab for assertions (spec 16.2). */
  panel: Page;
}

export const test = base.extend<Fixtures>({
  dpr: [1, { option: true }],
  context: async ({ dpr }, use) => {
    const context = await chromium.launchPersistentContext('', {
      channel: 'chromium',
      // Optional override when Playwright's own browser can't be downloaded.
      executablePath: process.env.E2E_CHROMIUM_PATH || undefined,
      // No viewport emulation: captureVisibleTab must see the same pixels the page lays out.
      viewport: null,
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
        `--force-device-scale-factor=${dpr}`,
        '--window-size=1280,900',
      ],
    });
    await use(context);
    await context.close();
  },
  extensionId: async ({ context }, use) => {
    let [worker] = context.serviceWorkers();
    worker ??= await context.waitForEvent('serviceworker');
    await use(new URL(worker.url()).host);
  },
  panel: async ({ context, extensionId }, use) => {
    const panel = await context.newPage();
    await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
    await use(panel);
  },
});

export const expect = test.expect;

/** Tab id of a page, looked up from an extension page. */
export async function tabIdOf(panel: Page, page: Page): Promise<number> {
  const url = page.url();
  return panel.evaluate(async (u) => {
    const tabs = await chrome.tabs.query({});
    return tabs.find((t: { url?: string; id?: number }) => t.url === u)!.id!;
  }, url);
}

/** Start a snip on `page` the way the e2e build allows (no real gesture available). */
export async function startSnip(panel: Page, page: Page): Promise<void> {
  const tabId = await tabIdOf(panel, page);
  await page.bringToFront();
  const reply = await panel.evaluate(
    (id) => chrome.runtime.sendMessage({ type: 'E2E_START_SNIP', tabId: id }),
    tabId,
  );
  if (!reply?.ok) throw new Error(`E2E_START_SNIP failed: ${JSON.stringify(reply)}`);
  await page.locator('answersnap-overlay').waitFor({ state: 'attached' });
}

export async function drag(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 4 });
  await page.mouse.move(to.x, to.y, { steps: 4 });
  await page.mouse.up();
}

/** Read RGB at image pixel (x, y) of the panel's thumbnail. */
export async function thumbnailPixels(panel: Page, points: [number, number][]) {
  return panel.evaluate(async (pts) => {
    const img = document.querySelector<HTMLImageElement>('img[alt="Snipped region"]')!;
    await img.decode();
    const canvas = new OffscreenCanvas(img.naturalWidth, img.naturalHeight);
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0);
    return {
      width: img.naturalWidth,
      height: img.naturalHeight,
      pixels: pts.map(([x, y]) => Array.from(ctx.getImageData(x, y, 1, 1).data.slice(0, 3))),
    };
  }, points);
}
