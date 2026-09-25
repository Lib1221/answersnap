import { test as base, chromium, type BrowserContext, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
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

export const MOCK_LLM = 'http://127.0.0.1:4620';

export const JAMIE_RESUME = readFileSync(
  resolve(import.meta.dirname, '../fixtures/jamie-park.txt'),
  'utf8',
);

/** Seed extension storage from an extension page: provider, key, and a pasted profile. */
export async function seed(
  panel: Page,
  opts: {
    provider?: 'anthropic' | 'gemini';
    key?: string | null;
    profile?: boolean;
    prewarm?: boolean;
    /** Answer confidently (the default); fact check only runs when this is off. */
    fillGaps?: boolean;
  } = {},
) {
  const provider = opts.provider ?? 'anthropic';
  const key = opts.key === undefined ? 'test-key' : opts.key;
  await fetch(`${MOCK_LLM}/__reset`, { method: 'POST' });
  await panel.evaluate(
    async ({ provider, key, profile, resume, prewarm, fillGaps }) => {
      const models: Record<string, [string, string]> = {
        anthropic: ['claude-sonnet-5', 'claude-haiku-4-5-20251001'],
        gemini: ['gemini-3.1-flash-lite', 'gemini-3.5-flash-lite'],
      };
      const data: Record<string, unknown> = {
        settings: {
          schemaVersion: 1,
          provider,
          model: models[provider]![0],
          fastModel: models[provider]![1],
          // Off unless a test is about it: a warm-up request would shift the mock log.
          prewarmCache: prewarm,
          fillGaps,
        },
      };
      if (key) data[`apiKey:${provider}`] = key;
      if (profile) {
        data.sources = [
          {
            id: 'pasted-profile',
            kind: 'note',
            label: 'Pasted profile',
            text: resume,
            chars: resume.length,
            importedAt: new Date().toISOString(),
            enabled: true,
          },
        ];
      }
      await chrome.storage.local.clear();
      // Session state too (pre-warm time, cooldowns, captures), so each test starts fresh.
      await chrome.storage.session.clear();
      await chrome.storage.local.set(data);
    },
    {
      provider,
      key,
      profile: opts.profile ?? true,
      resume: JAMIE_RESUME,
      prewarm: opts.prewarm ?? false,
      fillGaps: opts.fillGaps ?? true,
    },
  );
  // Start the panel from the seeded state: its mount-time reads (readiness, pre-warm) would
  // otherwise race the writes above.
  await panel.reload();
}

export async function mockLog(): Promise<Record<string, unknown>[]> {
  return (await fetch(`${MOCK_LLM}/__log`)).json();
}

/** Snip the question whose label is `selector` on the plain form by clicking it. */
export async function snipLabel(panel: Page, page: Page, selector: string) {
  const box = (await page.locator(selector).boundingBox())!;
  await startSnip(panel, page);
  await page.mouse.move(box.x + 20, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.up();
}
