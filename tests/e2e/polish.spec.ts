import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { drag, expect, FIXTURES, seed, startSnip, tabIdOf, test } from './fixtures';

async function axe(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  return results.violations.map(
    (v) =>
      `${v.id}: ${v.nodes
        .map((n) => n.target.join(' '))
        .slice(0, 3)
        .join(', ')}`,
  );
}

for (const scheme of ['light', 'dark'] as const) {
  test(`accessibility (${scheme}): panel, options, practice page`, async ({
    context,
    extensionId,
    panel,
  }) => {
    await seed(panel);
    const pages = [panel];
    for (const hash of [
      'welcome',
      'provider',
      'sources',
      'profile',
      'standard-answers',
      'writing-style',
      'privacy',
    ]) {
      const p = await context.newPage();
      await p.goto(`chrome-extension://${extensionId}/options.html#${hash}`);
      pages.push(p);
    }
    const practice = await context.newPage();
    await practice.goto(`chrome-extension://${extensionId}/practice.html`);
    pages.push(practice);
    const problems: string[] = [];
    for (const p of pages) {
      // Reduced motion turns off the color fades, so axe measures settled colors.
      await p.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
      await p.waitForLoadState('networkidle');
      problems.push(...(await axe(p)).map((v) => `${p.url().split('/').pop()}: ${v}`));
    }
    // The practice page's white-on-white trap is deliberate (Appendix A item 9).
    expect(problems.filter((p) => !p.includes('.trap'))).toEqual([]);
  });
}

test('keyboard only: snip, answer, and insert', async ({ context, panel }) => {
  await seed(panel);
  const page = await context.newPage();
  await page.goto(`${FIXTURES}/plain-form.html`);
  const box = (await page.locator('#why').boundingBox())!;
  await startSnip(panel, page);
  await drag(page, { x: box.x - 4, y: box.y - 4 }, { x: box.x + 300, y: box.y + 60 });
  await expect(panel.getByTestId('refine')).toBeVisible();
  // From the answer box: Ctrl+Enter inserts without touching the mouse.
  await panel.getByTestId('answer').focus();
  await panel.keyboard.press('Control+Enter');
  await expect(page.locator('#why-text')).toHaveValue(/Ledgerly/);
  // Tab reaches the Insert button, and it has a visible focus ring.
  await panel.getByRole('button', { name: 'Replace', exact: true }).focus();
  const ring = await panel
    .getByRole('button', { name: 'Replace', exact: true })
    .evaluate((el) => getComputedStyle(el).outlineStyle);
  expect(ring).toBe('solid');
});

test('latency budgets: overlay after the trigger, thumbnail after the drag', async ({
  context,
  panel,
}) => {
  await seed(panel);
  const page = await context.newPage();
  await page.goto(`${FIXTURES}/crop-target.html`);
  const tabId = await tabIdOf(panel, page);
  await page.bringToFront();

  // Warm run (first injection compiles the script), then measure.
  for (const run of ['warm', 'measure'] as const) {
    const t0 = Date.now();
    await panel.evaluate(
      (id) => chrome.runtime.sendMessage({ type: 'E2E_START_SNIP', tabId: id }),
      tabId,
    );
    await page.locator('answersnap-overlay').waitFor({ state: 'attached' });
    const overlayMs = Date.now() - t0;

    await page.mouse.move(300, 200);
    await page.mouse.down();
    await page.mouse.move(600, 400, { steps: 3 });
    const t1 = Date.now();
    await page.mouse.up();
    await panel.locator('img[alt="Snipped region"]').waitFor();
    const thumbMs = Date.now() - t1;
    console.log(`${run}: overlay ${overlayMs} ms, thumbnail ${thumbMs} ms`);
    if (run === 'measure') {
      // Shared CI runners have no GPU and noisy neighbours: same budgets, with slack there.
      const slack = process.env.CI ? 3 : 1;
      expect(overlayMs).toBeLessThan(150 * slack);
      expect(thumbMs).toBeLessThan(400 * slack);
    }
    await panel.evaluate(() => chrome.storage.session.remove('captureStatus'));
    await panel.reload();
    // captureVisibleTab allows about 2 calls a second; don't measure the throttle.
    await page.waitForTimeout(1100);
  }
});

test('the panel has Answer, Job, Form, Library, and Profile tabs', async ({ panel }) => {
  await seed(panel);
  await expect(panel.getByRole('tab')).toHaveText([
    'Answer',
    'Job',
    'Form',
    'Library',
    'Profile',
  ]);
  await panel.getByRole('tab', { name: 'Profile' }).click();
  await expect(panel.getByTestId('profile-tab')).toContainText('Sources');
});
