import { expect, seed, test } from './fixtures';

type Meta = { device: string; hash: string; chunks: number };
const meta = (page: import('@playwright/test').Page) =>
  page.evaluate(
    async () =>
      (await chrome.storage.sync.get('answersnap:meta'))['answersnap:meta'] as Meta | undefined,
  );

test('turning sync on writes the synced copy, and local changes follow', async ({
  context,
  extensionId,
  panel,
}) => {
  await seed(panel);
  const options = await context.newPage();
  await options.goto(`chrome-extension://${extensionId}/options.html#privacy`);
  await options.getByTestId('sync-on').click();
  await expect(options.getByTestId('sync-status')).toContainText('Sync is on. Last synced');
  const first = (await meta(options))!;
  expect(first.chunks).toBeGreaterThan(0);
  // API keys never go to sync storage.
  expect(JSON.stringify(await options.evaluate(() => chrome.storage.sync.get(null)))).not.toContain(
    'test-key',
  );

  // A settings change is pushed by the service worker a few seconds later.
  await options.goto(`chrome-extension://${extensionId}/options.html#writing-style`);
  await options.getByLabel('Friendly').check();
  await expect
    .poll(async () => (await meta(options))?.hash, { timeout: 15_000 })
    .not.toBe(first.hash);

  await options.goto(`chrome-extension://${extensionId}/options.html#privacy`);
  await options.getByTestId('sync-off').click();
  await options.getByTestId('sync-off-remove').click();
  await expect(options.getByTestId('sync-on')).toBeVisible();
  expect(await meta(options)).toBeUndefined();
});

test("another computer's synced copy asks which data to use", async ({
  context,
  extensionId,
  panel,
}) => {
  await seed(panel);
  await panel.evaluate(() =>
    chrome.storage.sync.set({
      'answersnap:meta': {
        v: 1,
        at: '2026-09-20T10:00:00Z',
        device: 'other',
        chunks: 1,
        hash: 'x',
      },
      'answersnap:chunk:0': 'not-a-real-bundle',
    }),
  );
  const options = await context.newPage();
  await options.goto(`chrome-extension://${extensionId}/options.html#privacy`);
  await options.getByTestId('sync-on').click();
  await expect(options.getByTestId('sync-choice')).toContainText('already has synced data');
  await options.getByTestId('sync-use-local').click();
  await expect(options.getByTestId('sync-status')).toBeVisible();
  expect((await meta(options))!.device).not.toBe('other');
});
