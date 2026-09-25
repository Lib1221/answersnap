import { test as base, chromium, type BrowserContext } from '@playwright/test';
import { resolve } from 'node:path';

const extensionPath = resolve(import.meta.dirname, '../../.output/chrome-mv3-e2e');

export const test = base.extend<{ context: BrowserContext; extensionId: string }>({
  // eslint-disable-next-line no-empty-pattern
  context: async ({}, use) => {
    const context = await chromium.launchPersistentContext('', {
      channel: 'chromium',
      // Optional override when Playwright's own browser can't be downloaded.
      executablePath: process.env.E2E_CHROMIUM_PATH || undefined,
      args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
    });
    await use(context);
    await context.close();
  },
  extensionId: async ({ context }, use) => {
    let [worker] = context.serviceWorkers();
    worker ??= await context.waitForEvent('serviceworker');
    await use(new URL(worker.url()).host);
  },
});

export const expect = test.expect;
