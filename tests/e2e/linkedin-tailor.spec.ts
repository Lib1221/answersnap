import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import { expect, FIXTURES, mockLog, seed, test } from './fixtures';

// LinkedIn's Tailor button, on a local page shaped like LinkedIn's job search (the e2e build lets
// the content script run there too).

const profile = JSON.parse(
  readFileSync(join(import.meta.dirname, '../fixtures/profile.json'), 'utf8'),
);

async function seedMaster(panel: Page, extensionId: string) {
  await panel.evaluate(
    (p) =>
      chrome.storage.local.set({
        profile: {
          profile: p,
          builtAt: '2026-09-01T00:00:00Z',
          editedAt: null,
          sourceIds: [],
          previous: null,
        },
      }),
    profile,
  );
  const builder = await panel.context().newPage();
  await builder.goto(`chrome-extension://${extensionId}/resume.html`);
  await builder.getByTestId('resume-start-profile').click();
  await builder.getByTestId('make-master').click();
  await expect(builder.getByTestId('master-badge')).toBeVisible();
  await builder.close();
}

const SEARCH = `${FIXTURES}/linkedin/jobs-search.html?currentJobId=4012345678`;

test('one click on LinkedIn opens a tailored resume for that job', async ({
  context,
  extensionId,
  panel,
}) => {
  test.setTimeout(90_000);
  await seed(panel);
  await seedMaster(panel, extensionId);
  const page = await context.newPage();
  await page.goto(SEARCH);
  const button = page.getByTestId('linkedin-tailor');
  await expect(button).toBeVisible();
  await expect(button).toHaveAccessibleName('Tailor resume');

  const opened = context.waitForEvent('page');
  await button.click();
  const builder = await opened;
  await builder.setViewportSize({ width: 1440, height: 1000 });
  await expect(builder.getByTestId('job-match')).toBeVisible({ timeout: 20_000 });
  await expect(builder.getByTestId('match-job')).toContainText('Northwind');
  // The job post the page showed is the one the builder got.
  expect(JSON.stringify(await mockLog())).toContain("We don't sponsor visas.");

  // Leaving the job (LinkedIn changes the URL without a page load) hides the button.
  await page.bringToFront();
  await page.evaluate(() => history.pushState(null, '', '/linkedin/jobs-search.html'));
  await expect(button).toBeHidden();
  await page.evaluate(() =>
    history.pushState(null, '', '/linkedin/jobs-search.html?currentJobId=4012345678'),
  );
  await expect(button).toBeVisible();
});

test('the button stays away when turned off in Settings, and off non-job pages', async ({
  context,
  panel,
}) => {
  await seed(panel);
  const page = await context.newPage();
  await page.goto(`${FIXTURES}/linkedin/jobs-search.html`);
  await page.waitForTimeout(1500);
  await expect(page.getByTestId('linkedin-tailor')).toBeHidden();

  await panel.evaluate(async () => {
    const { settings } = await chrome.storage.local.get('settings');
    await chrome.storage.local.set({ settings: { ...settings, linkedinButton: false } });
  });
  await page.goto(SEARCH);
  await page.waitForTimeout(1500);
  await expect(page.getByTestId('linkedin-tailor')).toBeHidden();
});
