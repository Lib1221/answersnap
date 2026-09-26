import AxeBuilder from '@axe-core/playwright';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import { expect, seed, test } from './fixtures';

const profile = JSON.parse(
  readFileSync(join(import.meta.dirname, '../fixtures/profile.json'), 'utf8'),
);

async function openBuilder(
  context: import('@playwright/test').BrowserContext,
  extensionId: string,
) {
  const page = await context.newPage();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`chrome-extension://${extensionId}/resume.html`);
  return page;
}

async function seedProfile(panel: Page) {
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
}

/** What the reader sees on the pages (innerText: uppercase headings stay uppercase). */
const docText = (page: Page) =>
  page
    .locator('.preview-pages > [data-testid="resume-page"]')
    .allInnerTexts()
    .then((t) => t.join('\n'));
/** A section card by its default title (the title is an editable input with that placeholder). */
const card = (page: Page, title: string) =>
  page
    .getByTestId('section-card')
    .filter({ has: page.locator(`[data-testid="section-title-input"][placeholder="${title}"]`) });
const shows = (page: Page, text: string) => expect.poll(() => docText(page)).toContain(text);
const hides = (page: Page, text: string) => expect.poll(() => docText(page)).not.toContain(text);

test('start from the profile, edit live, and keep it after a reload', async ({
  context,
  extensionId,
  panel,
}) => {
  await seed(panel);
  await seedProfile(panel);
  const page = await openBuilder(context, extensionId);
  await expect(page.getByTestId('resume-empty')).toBeVisible();
  await page.getByTestId('resume-start-profile').click();

  // Imported from the profile, nothing invented.
  await shows(page, 'Jamie Park');
  await shows(page, 'Senior Backend Engineer');
  await shows(page, 'Ledgerly');
  await shows(page, 'PROFESSIONAL EXPERIENCE');

  // Live editing.
  await page.getByTestId('pd-title').fill('Payments Backend Engineer');
  await shows(page, 'Payments Backend Engineer');

  // Rich text: bold and bullets render as elements, not markdown.
  const profileText = page.getByTestId('rich-editor').first();
  await profileText.fill('Backend engineer. **Payments** specialist.\n- Python\n- Django');
  await expect(
    page.locator('.preview-pages > [data-testid="resume-page"] strong', { hasText: 'Payments' }),
  ).toBeVisible();
  await expect(
    page.locator('.preview-pages > [data-testid="resume-page"] li', { hasText: 'Django' }).first(),
  ).toBeVisible();
  await hides(page, '**');

  await expect(page.getByTestId('save-state')).toHaveText('Saved');
  await page.reload();
  await shows(page, 'Payments Backend Engineer');
});

test('sections: add, hide, reorder, duplicate entries, and the declaration consent', async ({
  context,
  extensionId,
  panel,
}) => {
  await seed(panel);
  await seedProfile(panel);
  const page = await openBuilder(context, extensionId);
  await page.getByTestId('resume-start-profile').click();
  await shows(page, 'Ledgerly');

  // Hide Education: gone from the resume, still in the editor.
  const education = card(page, 'Education');
  await education.getByTestId('section-hide').click();
  await hides(page, 'University of Porto');
  await education.getByTestId('section-hide').click();
  await shows(page, 'University of Porto');

  // Move Skills up one place: the order on the page follows.
  const headings = () =>
    page.locator('.preview-pages > [data-testid="resume-page"] .rd-heading').allInnerTexts();
  const before = await headings();
  const skills = card(page, 'Skills');
  await skills.getByTestId('section-up').click();
  // The preview re-measures before it re-paginates: wait for the new order.
  await expect.poll(headings).not.toEqual(before);
  const after = await headings();
  expect(after.indexOf('SKILLS')).toBe(before.indexOf('SKILLS') - 1);

  // Duplicate an entry.
  const experience = card(page, 'Professional Experience');
  const rows = experience.getByTestId('entry-row');
  const count = await rows.count();
  await experience.getByTestId('entry-duplicate').first().click();
  await expect(rows).toHaveCount(count + 1);

  // Declaration with the Italian consent line.
  await page.getByTestId('tab-customize').click();
  await page.getByTestId('cz-docLang-it').click();
  await page.getByTestId('tab-content').click();
  await page.getByTestId('add-content').click();
  await page.getByTestId('add-section-declaration').click();
  await page.getByTestId('insert-consent').click();
  await page.getByTestId('sign-name').fill('Jamie Park');
  await shows(page, 'Autorizzo il trattamento dei miei dati personali');
  await shows(page, 'ESPERIENZA PROFESSIONALE');
  await shows(page, 'Oggi');
});

test('templates, two columns, and a real PDF that paginates like the preview', async ({
  context,
  extensionId,
  panel,
}) => {
  await seed(panel);
  await seedProfile(panel);
  const page = await openBuilder(context, extensionId);
  await page.getByTestId('resume-start-profile').click();
  await shows(page, 'Ledgerly');

  await page.getByTestId('tab-templates').click();
  await page.getByTestId('template-sidebar').click();
  const pages = page.locator('.preview-pages > [data-testid="resume-page"]');
  await expect(pages.first().locator('.rd-col-side')).toContainText('Python');
  // A left sidebar is drawn on the left.
  const side = await pages.first().locator('.rd-col-side').boundingBox();
  const main = await pages.first().locator('.rd-col-main').boundingBox();
  expect(side!.x).toBeLessThan(main!.x);

  // Make it long: many experience entries spill onto more pages, never split.
  await page.getByTestId('tab-content').click();
  const experience = card(page, 'Professional Experience');
  for (let i = 0; i < 6; i++) await experience.getByTestId('entry-duplicate').first().click();
  await expect.poll(async () => pages.count()).toBeGreaterThan(1);
  const previewPages = await pages.count();
  await expect(page.getByTestId('page-count')).toContainText(`${previewPages} pages`);

  const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
  const pdfPages = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length;
  expect(pdfPages).toBe(previewPages);
  mkdirSync(test.info().outputDir, { recursive: true });
  writeFileSync(join(test.info().outputDir, 'resume.pdf'), pdf);
});

for (const scheme of ['light', 'dark'] as const) {
  test(`accessibility (${scheme}): the builder's content, customize, and template tabs`, async ({
    context,
    extensionId,
    panel,
  }) => {
    test.setTimeout(90_000);
    await seed(panel);
    await seedProfile(panel);
    const page = await openBuilder(context, extensionId);
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
    await page.getByTestId('resume-start-profile').click();
    await shows(page, 'Ledgerly');
    const problems: string[] = [];
    for (const tab of ['content', 'customize', 'templates']) {
      await page.getByTestId(`tab-${tab}`).click();
      // The resume pages are the user's own design (their colors, their contrast), so the scan
      // covers the editor around them.
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa'])
        .exclude('.rd-page')
        .analyze();
      for (const v of results.violations)
        problems.push(
          `${tab}: ${v.id}: ${v.nodes
            .map((n) => n.target.join(' '))
            .slice(0, 3)
            .join(', ')}`,
        );
    }
    expect(problems).toEqual([]);
  });
}

// An 8 x 8 PNG, enough for the photo controls.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAbElEQVR4nA3JQQEAMAgDMZSgpEqqhOepQAlKqmjLN1VFFypcTLHFFSmqmm7UuJlmm2vSP0QLCYsRK05EP0wbGZsxa87EP4YeNHiYYYcbMj+WXrR4mWWXW7I/jj50+JhjjztyP0IHBYcJGy4kPLAsVIExyOP/AAAAAElFTkSuQmCC',
  'base64',
);

test('section settings, photo crop, heading icons, and my own templates', async ({
  context,
  extensionId,
  panel,
}) => {
  test.setTimeout(90_000);
  await seed(panel);
  await seedProfile(panel);
  const page = await openBuilder(context, extensionId);
  await page.getByTestId('resume-start-profile').click();
  await shows(page, 'Ledgerly');
  const pages = page.locator('.preview-pages > [data-testid="resume-page"]');

  // Page break before Education: it starts page 2.
  const education = card(page, 'Education');
  await education.getByTestId('section-settings').click();
  await education.getByTestId('section-break').check();
  await expect(pages).toHaveCount(2);
  await expect(pages.nth(1).locator('.rd-heading').first()).toHaveText(/education/i);
  await education.getByTestId('section-break').uncheck();
  await expect(pages).toHaveCount(1);

  // The profile can go without its heading.
  const profileCard = card(page, 'Profile');
  await profileCard.getByTestId('section-settings').click();
  await profileCard.getByTestId('section-show-heading').uncheck();
  await hides(page, 'PROFILE');

  // Skills as bubbles, only for that section.
  const skills = card(page, 'Skills');
  await skills.getByTestId('section-settings').click();
  await skills.getByTestId('section-layout').selectOption('bubbles');
  await expect(pages.first().locator('.rd-list-bubbles')).toHaveCount(1);
  await skills.getByTestId('section-layout').selectOption('grid');
  await skills.getByTestId('section-cols').selectOption('3');
  await expect(pages.first().locator('.rd-list-grid').first()).toHaveAttribute(
    'style',
    /--rd-cols: 3/,
  );

  // Photo: zoom and move it, then a portrait shape in black and white.
  await page.getByTestId('pd-photo-input').setInputFiles({
    name: 'me.png',
    mimeType: 'image/png',
    buffer: PNG,
  });
  const photo = pages.first().locator('.rd-photo img');
  await expect(photo).toBeVisible();
  await page.getByTestId('pd-photo-zoom').fill('2');
  await expect(photo).toHaveCSS('transform', /matrix\(2, 0, 0, 2/);
  await page.getByTestId('pd-photo-crop').focus();
  await page.keyboard.press('ArrowLeft');
  await expect(photo).toHaveAttribute('style', /object-position: 52% 50%/);
  await page.getByTestId('pd-photo-reset').click();
  await expect(photo).toHaveAttribute('style', /object-position: 50% 50%/);

  await page.getByTestId('tab-customize').click();
  await page.getByTestId('cz-photo-portrait').click();
  await page.getByTestId('cz-photoGrayscale').check();
  await page.getByTestId('cz-headingIcons').check();
  await expect(pages.first().locator('.rd-photo-portrait')).toHaveCount(1);
  await expect(photo).toHaveCSS('filter', 'grayscale(1)');
  await expect(pages.first().locator('.rd-heading svg').first()).toBeVisible();

  // Italian stays when a template is picked.
  await page.getByTestId('cz-docLang-it').click();
  await page.getByTestId('tab-templates').click();
  await page.getByTestId('template-sidebar').click();
  await shows(page, 'Oggi');
  await expect(pages.first().locator('.rd-col-side')).toHaveCount(1);

  // Customize the template, save that design, switch to another template, and bring it back.
  await page.getByTestId('tab-customize').click();
  await page.getByTestId('cz-photo-portrait').click();
  await page.getByTestId('tab-templates').click();
  await page.getByTestId('my-template-name').fill('Italian CV');
  await page.getByTestId('my-template-save').click();
  const mine = page.getByTestId('my-template').filter({ hasText: 'Italian CV' });
  await expect(mine.getByTestId('my-template-apply')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('template-classic').click();
  await expect(pages.first().locator('.rd-col-side')).toHaveCount(0);
  await mine.getByTestId('my-template-apply').click();
  await expect(pages.first().locator('.rd-col-side')).toHaveCount(1);
  await expect(pages.first().locator('.rd-photo-portrait')).toHaveCount(1);

  // Saved designs survive a reload; deleting asks first.
  await expect(page.getByTestId('save-state')).toHaveText('Saved');
  await page.reload();
  await page.getByTestId('tab-templates').click();
  await expect(mine).toHaveCount(1);
  await mine.getByTestId('my-template-delete').click();
  await page.getByTestId('my-template-delete-confirm').click();
  await expect(page.getByTestId('my-template')).toHaveCount(0);
});

/** Every page's content ends above its bottom edge: nothing is cut off. */
async function nothingCut(page: Page) {
  return page.locator('.preview-pages > [data-testid="resume-page"]').evaluateAll((pages) =>
    pages.every((pg) => {
      const bottom = pg.getBoundingClientRect().bottom;
      return [...pg.querySelectorAll('.rd-block, .rd-header')].every(
        (b) => b.getBoundingClientRect().bottom <= bottom + 0.5,
      );
    }),
  );
}

test('pages are the same at any window size, and nothing is cut off', async ({
  context,
  extensionId,
  panel,
}) => {
  test.setTimeout(90_000);
  await seed(panel);
  await seedProfile(panel);
  const page = await openBuilder(context, extensionId);
  await page.getByTestId('resume-start-profile').click();
  await shows(page, 'Ledgerly');
  const experience = card(page, 'Professional Experience');
  for (let i = 0; i < 6; i++) await experience.getByTestId('entry-duplicate').first().click();
  const pages = page.locator('.preview-pages > [data-testid="resume-page"]');
  await expect.poll(() => pages.count()).toBeGreaterThan(1);
  await expect(page.getByTestId('save-state')).toHaveText('Saved');

  const counts: number[] = [];
  for (const width of [1000, 1440, 1900]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.reload();
    await shows(page, 'Ledgerly');
    await page.waitForTimeout(400);
    counts.push(await pages.count());
    expect(await nothingCut(page)).toBe(true);
  }
  expect(new Set(counts).size).toBe(1);
  const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
  expect((pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length).toBe(counts[0]);
});

test('a resume deleted in another tab stays deleted', async ({ context, extensionId, panel }) => {
  await seed(panel);
  await seedProfile(panel);
  const a = await openBuilder(context, extensionId);
  await a.getByTestId('resume-start-profile').click();
  await shows(a, 'Ledgerly');
  await expect(a.getByTestId('save-state')).toHaveText('Saved');

  const b = await openBuilder(context, extensionId);
  await shows(b, 'Ledgerly');
  await b.getByTestId('resume-delete').click();
  await b.getByTestId('resume-delete-confirm').click();
  await expect(b.getByTestId('resume-empty')).toBeVisible();

  // The first tab follows: it drops the resume instead of saving it back on the next edit.
  await a.bringToFront();
  await expect(a.getByTestId('resume-empty')).toBeVisible();
  await a.waitForTimeout(800);
  expect(
    await panel.evaluate(async () => (await chrome.storage.local.get('resumes')).resumes),
  ).toEqual([]);
});

test('in two columns, moving a section follows its own column', async ({
  context,
  extensionId,
  panel,
}) => {
  await seed(panel);
  await seedProfile(panel);
  const page = await openBuilder(context, extensionId);
  await page.getByTestId('resume-start-profile').click();
  await page.getByTestId('tab-templates').click();
  await page.getByTestId('template-sidebar').click();
  await page.getByTestId('tab-content').click();
  const side = () =>
    page
      .locator('.preview-pages > [data-testid="resume-page"]')
      .first()
      .locator('.rd-col-side .rd-heading')
      .allInnerTexts();
  await expect.poll(side).toEqual(['SKILLS', 'LANGUAGES']);
  await card(page, 'Languages').getByTestId('section-up').click();
  await expect.poll(side).toEqual(['LANGUAGES', 'SKILLS']);
  await expect(card(page, 'Languages').getByTestId('section-up')).toBeDisabled();
});

test('FlowCV fonts are bundled: they load, and the PDF embeds them', async ({
  context,
  extensionId,
  panel,
}) => {
  test.setTimeout(90_000);
  await seed(panel);
  await seedProfile(panel);
  const page = await openBuilder(context, extensionId);
  await page.getByTestId('resume-start-profile').click();
  await shows(page, 'Ledgerly');
  // An Amharic name renders with the bundled Ethiopic font, whatever the text font is.
  await page.getByTestId('pd-name').fill('ጀሚ ፓርክ Jamie Park');

  await page.getByTestId('tab-customize').click();
  await page.getByTestId('cz-font-group-serif').click();
  await page.getByTestId('cz-font-lora').click();
  await page.getByTestId('cz-nameFont-group-creative').click();
  await page.getByTestId('cz-nameFont-pacifico').click();
  await expect(page.getByTestId('cz-font-lora')).toHaveAttribute('aria-pressed', 'true');

  const doc = page.locator('.preview-pages > [data-testid="resume-page"]').first();
  await expect(doc).toHaveCSS('font-family', /^Lora/);
  await expect(doc.locator('.rd-name')).toHaveCSS('font-family', /^Pacifico/);
  // Pacifico has no bold: the name stays regular instead of a smeared fake bold, and Bold name
  // says why it can't apply.
  await expect(doc.locator('.rd-name')).toHaveCSS('font-weight', '400');
  await expect(page.getByTestId('cz-nameBold')).toBeDisabled();
  const loaded = () =>
    page.evaluate(() =>
      [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family),
    );
  await expect
    .poll(loaded)
    .toEqual(expect.arrayContaining(['Lora', 'Pacifico', 'Noto Sans Ethiopic']));

  const pdf = (await page.pdf({ preferCSSPageSize: true, printBackground: true })).toString(
    'latin1',
  );
  for (const name of ['Lora', 'Pacifico', 'NotoSansEthiopic'])
    expect(pdf).toMatch(new RegExp(`/BaseFont\\s*/[A-Z]{6}\\+${name}`));
});
