import { drag, expect, FIXTURES, startSnip, tabIdOf, test, thumbnailPixels } from './fixtures';

const RED = [220, 30, 30];
const WHITE = [255, 255, 255];
// Block in crop-target.html: left 300, top 200, 300 x 200 CSS px.
const BLOCK = { x: 300, y: 200, w: 300, h: 200 };

function near(actual: number[] | undefined, expected: number[], tolerance = 12) {
  expect(actual).toBeDefined();
  actual!.forEach((v, i) => expect(Math.abs(v - expected[i]!)).toBeLessThanOrEqual(tolerance));
}

test.describe('capture at DPR 1', () => {
  test('drag selects a region and the crop has padding, outline, and no overlay', async ({
    context,
    panel,
  }) => {
    const page = await context.newPage();
    await page.goto(`${FIXTURES}/crop-target.html`);
    await startSnip(panel, page);
    await drag(page, { x: BLOCK.x, y: BLOCK.y }, { x: BLOCK.x + BLOCK.w, y: BLOCK.y + BLOCK.h });

    await expect(panel.locator('[data-state="captured"]')).toBeVisible();
    await expect(page.locator('answersnap-overlay')).toHaveCount(0);

    // 48 px of padding on every side, outline on the exact selection.
    const { width, height, pixels } = await thumbnailPixels(panel, [
      [198, 148], // inside the block
      [10, 10], // padding: page background, not dimmed
      [48, 148], // left edge of the outline
    ]);
    expect(width).toBe(396);
    expect(height).toBe(296);
    near(pixels[0], RED);
    near(pixels[1], WHITE, 2);
    expect(pixels[2]![2]).toBeGreaterThan(pixels[2]![0]! + 60); // ink blue, not red or white
  });

  test('reads visible text, leaves out hidden text, and finds the field', async ({
    context,
    panel,
  }) => {
    const page = await context.newPage();
    await page.goto(`${FIXTURES}/plain-form.html`);
    const box = (await page.locator('#why').boundingBox())!;
    await startSnip(panel, page);
    await drag(page, { x: box.x - 4, y: box.y - 4 }, { x: box.x + 300, y: box.y + 60 });

    await expect(panel.locator('[data-state="captured"]')).toBeVisible();
    const text = await panel.getByTestId('page-text').innerText();
    expect(text).toContain('Why do you want to join us?');
    expect(text).not.toContain('pineapple');
    await expect(panel.getByTestId('hidden-text')).toBeVisible();
    await expect(panel.getByTestId('target')).toHaveText(
      'Target: "Why do you want to join us?" text box',
    );
  });

  test('click picks the block under the cursor', async ({ context, panel }) => {
    const page = await context.newPage();
    await page.goto(`${FIXTURES}/plain-form.html`);
    const label = (await page.locator('label[for="years"]').boundingBox())!;
    await startSnip(panel, page);
    await page.mouse.move(label.x + 20, label.y + label.height / 2);
    await page.mouse.down();
    await page.mouse.up();

    await expect(panel.locator('[data-state="captured"]')).toBeVisible();
    await expect(panel.getByTestId('page-text')).toContainText(
      'How many years of professional Python',
    );
    await expect(panel.getByTestId('target')).toContainText('How many years');
  });

  test('Esc cancels cleanly', async ({ context, panel }) => {
    const page = await context.newPage();
    await page.goto(`${FIXTURES}/crop-target.html`);
    await startSnip(panel, page);
    await expect(panel.locator('[data-state="selecting"]')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('answersnap-overlay')).toHaveCount(0);
    await expect(panel.locator('[data-state="idle"]')).toBeVisible();
  });

  test('restricted pages show the Chrome message', async ({ context, panel }) => {
    const page = await context.newPage();
    await page.goto('chrome://version');
    // chrome:// URLs aren't visible to the extension, so take the newest tab.
    const tabId = await panel.evaluate(async () => {
      const tabs: { id: number }[] = await chrome.tabs.query({});
      return Math.max(...tabs.map((t) => t.id));
    });
    const reply = await panel.evaluate(
      (id) => chrome.runtime.sendMessage({ type: 'E2E_START_SNIP', tabId: id }),
      tabId,
    );
    expect(reply).toEqual({ ok: false, error: 'RESTRICTED_PAGE' });
    await expect(panel.locator('[data-state="error-RESTRICTED_PAGE"]')).toBeVisible();
  });
});

for (const [dpr, zoom] of [
  [1, 0.8],
  [1, 1.25],
  [2, 1],
  [2, 1.25],
] as const) {
  test.describe(`capture at DPR ${dpr}, zoom ${zoom * 100}%`, () => {
    test.use({ dpr });

    test('click-to-pick crops the block at the right scale', async ({ context, panel }) => {
      const page = await context.newPage();
      await page.goto(`${FIXTURES}/crop-target.html`);
      const tabId = await tabIdOf(panel, page);
      await panel.evaluate(([id, z]) => chrome.tabs.setZoom(id, z), [tabId, zoom] as const);
      await expect.poll(() => page.evaluate(() => window.innerWidth)).toBe(Math.round(1280 / zoom));

      await startSnip(panel, page);
      // The block is big enough that its center is inside it whether or not mouse
      // coordinates are zoomed.
      await page.mouse.move(450, 300);
      await page.mouse.down();
      await page.mouse.up();
      await expect(panel.locator('[data-state="captured"]')).toBeVisible();

      const { width, height } = await thumbnailPixels(panel, []);
      const scale = dpr * zoom;
      // Padded crop is 396 x 296 CSS px (no clamping or short-edge growth here).
      expect(Math.abs(width - 396 * scale)).toBeLessThanOrEqual(3);
      expect(Math.abs(height - 296 * scale)).toBeLessThanOrEqual(3);
      const { pixels } = await thumbnailPixels(panel, [
        [Math.round(width / 2), Math.round(height / 2) + 10],
        [3, 3],
      ]);
      near(pixels[0], RED);
      near(pixels[1], WHITE, 2);
    });
  });
}
