import { drag, expect, mockLog, seed, test } from './fixtures';

test('the practice page can be snipped, answered, and filled', async ({
  context,
  extensionId,
  panel,
}) => {
  await seed(panel);
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/practice.html`);
  // Extension page URLs aren't visible to tabs.query; the practice tab is the newest one.
  const tabId = await panel.evaluate(async () => {
    const tabs: { id: number }[] = await chrome.tabs.query({});
    return Math.max(...tabs.map((t) => t.id));
  });
  await page.bringToFront();
  const reply = await panel.evaluate(
    (id) => chrome.runtime.sendMessage({ type: 'E2E_START_SNIP', tabId: id }),
    tabId,
  );
  expect(reply).toEqual({ ok: true });
  await page.locator('answersnap-overlay').waitFor({ state: 'attached' });

  const area = (await page.locator('#why-area').boundingBox())!;
  await drag(
    page,
    { x: area.x - 4, y: area.y - 4 },
    { x: area.x + area.width, y: area.y + area.height },
  );
  await expect(panel.getByTestId('answer')).toHaveValue(/Ledgerly/);
  await expect(panel.getByTestId('hidden-text')).toBeVisible();
  const request = JSON.stringify((await mockLog()).find((b) => b.stream));
  expect(request).not.toContain('pineapple');

  await panel.getByRole('button', { name: 'Insert', exact: true }).click();
  await expect(page.locator('#why')).toContainText('Ledgerly');
});
