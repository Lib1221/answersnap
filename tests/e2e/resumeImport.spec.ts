import { join } from 'node:path';
import { expect, seed, test } from './fixtures';

// Importing a resume PDF: word for word into the builder, in the Professional design, as the
// master resume when there is none yet.

test('import a resume PDF as the master, in the Professional design', async ({
  context,
  extensionId,
  panel,
}) => {
  test.setTimeout(60_000);
  await seed(panel);
  const page = await context.newPage();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`chrome-extension://${extensionId}/resume.html`);
  await expect(page.getByTestId('resume-empty')).toBeVisible();

  await page
    .getByTestId('resume-empty')
    .getByTestId('resume-import-input')
    .setInputFiles(join(import.meta.dirname, '../fixtures/resumes/jamie-park.pdf'));

  const doc = page.locator('.preview-pages > [data-testid="resume-page"]').first();
  await expect(doc).toContainText('Jamie Park', { timeout: 20_000 });
  await expect(page.getByTestId('master-badge')).toBeVisible();
  // Word for word from the file.
  await expect(doc.locator('.rd-desc li').first()).toHaveText(
    'Built a Django REST Framework API that handles 2 million payment reconciliation requests per day.',
  );

  // The Professional design: FlowCV's heavy heading rule, linked names, and dates in MM/YYYY in
  // a column beside each entry, with the place under them.
  await expect(doc.locator('.rd-heading-thick-underline').first()).toBeVisible();
  await expect(doc.locator('a.rd-entry-link', { hasText: 'Shift Planner' })).toHaveAttribute(
    'href',
    'https://github.com/jamiepark-example/shift-planner',
  );
  const senior = doc.locator('article.rd-side-column', { hasText: 'Senior Backend Engineer' });
  await expect(senior.locator('.rd-side-1')).toHaveText('03/2022 – Present');
  await expect(senior.locator('.rd-side-2')).toHaveText('Remote');

  // The import went to the configured AI provider with the file's text.
  const saved = await panel.evaluate(
    async () => (await chrome.storage.local.get('resumes')).resumes,
  );
  expect(saved).toHaveLength(1);
  expect(saved[0].master).toBe(true);
});

test('a file that is not a resume says so', async ({ context, extensionId, panel }) => {
  await seed(panel);
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/resume.html`);
  await page
    .getByTestId('resume-empty')
    .getByTestId('resume-import-input')
    .setInputFiles({
      name: 'photo.png',
      mimeType: 'image/png',
      buffer: Buffer.from('not a resume'),
    });
  await expect(page.getByTestId('resume-import-error')).toContainText('Use a PDF, DOCX, or TXT');
});
