import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Page } from '@playwright/test';
import { drag, expect, seed, test } from './fixtures';

// Chrome Web Store assets (spec 18.2): 1280 x 800 screenshots from the practice page, and the
// 440 x 280 promo tile. Run with STORE_SHOTS=1; skipped otherwise.
test.skip(!process.env.STORE_SHOTS, 'set STORE_SHOTS=1 to regenerate store screenshots');

const OUT = resolve(import.meta.dirname, '../../docs/store');
const PAGE_W = 860;
const PANEL_W = 420;
const H = 800;

async function shot(page: Page, w: number, h: number) {
  await page.setViewportSize({ width: w, height: h });
  return (await page.screenshot()).toString('base64');
}

/** Compose the page and the panel side by side, like Chrome shows them. */
async function compose(stage: Page, left: string, right: string, name: string) {
  await stage.setViewportSize({ width: 1280, height: H });
  await stage.setContent(
    `<body style="margin:0;display:flex;background:#d7deea">
      <img src="data:image/png;base64,${left}" style="width:${PAGE_W}px;height:${H}px">
      <img src="data:image/png;base64,${right}" style="width:${PANEL_W - 1}px;height:${H}px;margin-left:1px">
    </body>`,
  );
  writeFileSync(resolve(OUT, name), await stage.screenshot());
}

test('store screenshots', async ({ context, extensionId, panel }) => {
  test.setTimeout(120_000);
  await seed(panel);
  // Jamie's built profile, so the header reads "Profile ready".
  const profile = JSON.parse(
    (await import('node:fs')).readFileSync(
      resolve(import.meta.dirname, '../fixtures/profile.json'),
      'utf8',
    ),
  );
  await panel.evaluate(
    (p) =>
      chrome.storage.local.set({
        profile: {
          profile: p,
          builtAt: new Date().toISOString(),
          editedAt: null,
          sourceIds: [],
          previous: null,
        },
      }),
    profile,
  );
  await panel.reload();
  const practice = await context.newPage();
  await practice.goto(`chrome-extension://${extensionId}/practice.html`);
  await practice.setViewportSize({ width: PAGE_W, height: H });
  const tabId = await panel.evaluate(async () =>
    Math.max(...((await chrome.tabs.query({})) as { id: number }[]).map((t) => t.id)),
  );
  const stage = await context.newPage();

  const snip = async (selector: string) => {
    await practice.bringToFront();
    await panel.evaluate(
      (id) => chrome.runtime.sendMessage({ type: 'E2E_START_SNIP', tabId: id }),
      tabId,
    );
    await practice.locator('answersnap-overlay').waitFor({ state: 'attached' });
    const b = (await practice.locator(selector).boundingBox())!;
    await drag(
      practice,
      { x: b.x - 6, y: b.y - 6 },
      { x: b.x + b.width + 6, y: b.y + b.height + 6 },
    );
    await expect(panel.getByTestId('answer')).not.toHaveValue('');
    await expect(panel.getByTestId('refine')).toBeVisible();
  };

  // 1. A drafted answer next to the question.
  await practice.locator('#why-area').scrollIntoViewIfNeeded();
  await snip('#why-area');
  await compose(
    stage,
    await shot(practice, PAGE_W, H),
    await shot(panel, PANEL_W, H),
    'screenshot-1-answer.png',
  );

  // 2. Missing information becomes a placeholder, never a guess.
  await practice.locator('#rate').scrollIntoViewIfNeeded();
  await snip('label[for="rate"]');
  await compose(
    stage,
    await shot(practice, PAGE_W, H),
    await shot(panel, PANEL_W, H),
    'screenshot-2-placeholder.png',
  );

  // 3. Inserted into the field.
  await panel.getByRole('button', { name: 'Insert', exact: true }).click();
  await practice.locator('#years').scrollIntoViewIfNeeded();
  await snip('label[for="years"]');
  await panel.getByRole('button', { name: 'Insert', exact: true }).click();
  await expect(practice.locator('#years')).toHaveValue('5');
  await compose(
    stage,
    await shot(practice, PAGE_W, H),
    await shot(panel, PANEL_W, H),
    'screenshot-3-inserted.png',
  );

  // 4. Getting started.
  const options = await context.newPage();
  await options.goto(`chrome-extension://${extensionId}/options.html#welcome`);
  await options.setViewportSize({ width: 1280, height: H });
  await expect(options.getByTestId('checklist')).toBeVisible();
  await options.waitForTimeout(400); // let button color transitions finish
  writeFileSync(resolve(OUT, 'screenshot-4-setup.png'), await options.screenshot());

  // Promo tile.
  const icon = (await import('node:fs')).readFileSync(
    resolve(import.meta.dirname, '../../src/assets/icon.svg'),
    'utf8',
  );
  await stage.setViewportSize({ width: 440, height: 280 });
  await stage.setContent(
    `<body style="margin:0;width:440px;height:280px;display:flex;align-items:center;gap:22px;padding:0 32px;box-sizing:border-box;background:#FFF6C9;font-family:system-ui,sans-serif;color:#23262B">
      <div style="width:104px;height:104px;flex:none">${icon}</div>
      <div><div style="font-size:34px;font-weight:700;letter-spacing:-0.5px">AnswerSnap</div>
      <div style="font-size:15px;line-height:1.4;margin-top:6px;color:#5B616B">Snip an application question.<br>Get a draft from your resume.</div></div>
    </body>`,
  );
  writeFileSync(resolve(OUT, 'promo-440x280.png'), await stage.screenshot());
});
