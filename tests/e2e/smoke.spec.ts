import { expect, test } from './fixtures';

test('install opens the options page', async ({ context, extensionId }) => {
  const url = `chrome-extension://${extensionId}/options.html#welcome`;
  await expect.poll(() => context.pages().map((p) => p.url()), { timeout: 10_000 }).toContain(url);
  const page = context.pages().find((p) => p.url() === url)!;
  await expect(page.getByRole('heading', { name: 'Getting started' })).toBeVisible();
  await expect(page.locator('[data-step="connect"]')).toHaveAttribute('data-done', 'false');
});

test('side panel page renders', async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  await expect(page.getByText('Add your API key to start.')).toBeVisible();
});
