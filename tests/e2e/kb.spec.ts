import { resolve } from 'node:path';
import type { Page } from '@playwright/test';
import { drag, expect, FIXTURES, mockLog, seed, snipLabel, test } from './fixtures';

const RESUMES = resolve(import.meta.dirname, '../fixtures/resumes');
const SECOND_ORIGIN = 'http://127.0.0.1:4611';

async function openOptions(
  context: import('@playwright/test').BrowserContext,
  extensionId: string,
  section: string,
) {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/options.html#${section}`);
  return page;
}

async function sourceLabels(options: Page) {
  return options.getByTestId('source-list').locator('li .font-medium').allTextContents();
}

test.describe('resume import', () => {
  test('PDF: text extracted, print header and footer stripped, saved as a source', async ({
    context,
    extensionId,
    panel,
  }) => {
    await seed(panel, { profile: false });
    const options = await openOptions(context, extensionId, 'sources');
    await options.getByTestId('resume-input').setInputFiles(resolve(RESUMES, 'jamie-park.pdf'));
    const review = options.getByTestId('review-text');
    await expect(review).toHaveValue(/Ledgerly/);
    const text = await review.inputValue();
    expect(text).toContain('Cut p95 latency of the invoicing service');
    expect(text).not.toContain('1:40 PM');
    expect(text).not.toContain('jamiepark.example/resume');
    await options.getByRole('button', { name: 'Save source' }).click();
    await expect.poll(() => sourceLabels(options)).toEqual(['jamie-park']);
  });

  test('DOCX and Markdown', async ({ context, extensionId, panel }) => {
    await seed(panel, { profile: false });
    const options = await openOptions(context, extensionId, 'sources');
    await options.getByTestId('resume-input').setInputFiles(resolve(RESUMES, 'jamie-park.docx'));
    await expect(options.getByTestId('review-text')).toHaveValue(/Brightpath Analytics/);
    await options.getByRole('button', { name: 'Save source' }).click();
    await options.getByTestId('resume-input').setInputFiles(resolve(RESUMES, 'jamie-park.md'));
    await expect(options.getByTestId('review-text')).toHaveValue(/## Experience/);
    await options.getByTestId('review-label').fill('Resume (markdown)');
    await options.getByRole('button', { name: 'Save source' }).click();
    await expect.poll(() => sourceLabels(options)).toEqual(['jamie-park', 'Resume (markdown)']);
  });

  test('scanned PDF offers Read with AI', async ({ context, extensionId, panel }) => {
    await seed(panel, { profile: false });
    const options = await openOptions(context, extensionId, 'sources');
    await options
      .getByTestId('resume-input')
      .setInputFiles(resolve(RESUMES, 'jamie-park-scanned.pdf'));
    await expect(options.getByTestId('scanned-notice')).toBeVisible();
    await options.getByRole('button', { name: 'Read with AI' }).click();
    await expect(options.getByTestId('review-text')).toHaveValue(
      /Payments APIs with Django at Ledgerly/,
    );
    const [req] = await mockLog();
    expect(JSON.stringify(req)).toContain('Transcribe all readable text');
    expect(req).toMatchObject({ model: 'claude-haiku-4-5-20251001' });
    await options.getByRole('button', { name: 'Save source' }).click();
    await expect(options.getByTestId('source-list')).toContainText('Read by AI');
  });
});

test.describe('website import', () => {
  test('reads the page, llms.txt, JSON-LD, and picked pages; app-only routes fail visibly', async ({
    context,
    extensionId,
    panel,
  }) => {
    await seed(panel, { profile: false });
    const options = await openOptions(context, extensionId, 'sources');
    await options.getByTestId('site-url').fill(`${FIXTURES}/site/`);
    await options.getByRole('button', { name: 'Import' }).click();
    const result = options.getByTestId('site-result');
    await expect(result).toContainText('plus an llms.txt file');
    await expect(options.getByTestId('site-fallback')).toHaveCount(0);
    for (const page of ['about.html', 'projects.html', 'resume'])
      await result.getByLabel(new RegExp(page)).check();

    await result.getByRole('button', { name: 'Download and add it' }).click();
    await expect(options.getByText('Added jamie-park-resume.pdf as a source.')).toBeVisible();

    await options.getByRole('button', { name: 'Review text' }).click();
    const review = options.getByTestId('review-text');
    await expect(review).toHaveValue(/About Jamie/);
    const text = await review.inputValue();
    expect(text).toContain('Open to remote backend roles in fintech'); // llms.txt
    expect(text).toContain('Job title: Backend Engineer'); // JSON-LD in @graph
    expect(text).toContain('Shift Planner is a Vue 3 and Django app');
    await expect(options.getByTestId('review')).toContainText('/site/resume: Returned 404');
    await options.getByRole('button', { name: 'Save source' }).click();
    await expect.poll(() => sourceLabels(options)).toEqual(['jamie-park-resume', '127.0.0.1:4610']);
  });

  test('a canvas-only site shows the fallback, and tab import reads it with AI', async ({
    context,
    extensionId,
    panel,
  }) => {
    await seed(panel, { profile: false });
    const options = await openOptions(context, extensionId, 'sources');
    await options.getByTestId('site-url').fill(`${SECOND_ORIGIN}/three.html`);
    await options.getByRole('button', { name: 'Import' }).click();
    await expect(options.getByTestId('site-fallback')).toContainText(
      'Import this page into AnswerSnap',
    );

    // The user opens the site and right-clicks "Import this page into AnswerSnap".
    const site = await context.newPage();
    await site.goto(`${SECOND_ORIGIN}/three.html`);
    const tabId = await panel.evaluate(async (url) => {
      const tabs: { id: number; url?: string }[] = await chrome.tabs.query({});
      return tabs.find((t) => t.url === url)!.id;
    }, site.url());
    const opened = context.waitForEvent('page', {
      predicate: (p) => p.url().includes('options.html#sources'),
    });
    await panel.evaluate(
      (id) => chrome.runtime.sendMessage({ type: 'E2E_IMPORT_PAGE', tabId: id }),
      tabId,
    );
    const review = await opened;
    await expect(review.getByTestId('tab-fallback')).toBeVisible();

    await review.getByRole('button', { name: 'Read with AI' }).click();
    await site.locator('answersnap-overlay').waitFor({ state: 'attached' });
    await drag(site, { x: 40, y: 60 }, { x: 700, y: 260 });
    await expect(review.getByTestId('review-text').first()).toHaveValue(/Backend Engineer, Lisbon/);
    await review.getByRole('button', { name: 'Save source' }).first().click();
    await expect(review.getByTestId('source-list')).toContainText('Read by AI');
  });
});

test('profile: build, edit, survive a reload, rebuild with per-section choice, undo', async ({
  context,
  extensionId,
  panel,
}) => {
  await seed(panel);
  const options = await openOptions(context, extensionId, 'profile');
  await options.getByTestId('build-profile').click();
  await expect(options.getByTestId('profile-fullName')).toHaveValue('Jamie Park');
  const [req] = await mockLog();
  expect(JSON.stringify(req)).toContain('"format":{"type":"json_schema"');

  await options.getByTestId('profile-headline').fill('Senior Backend Engineer, payments');
  await options.getByRole('button', { name: 'Add skill' }).click();
  await options.getByRole('button', { name: 'Save profile' }).click();
  await options.reload();
  await expect(options.getByTestId('profile-headline')).toHaveValue(
    'Senior Backend Engineer, payments',
  );

  await options.getByTestId('build-profile').click();
  const compare = options.getByTestId('rebuild-compare');
  await expect(compare).toContainText('Basics');
  await expect(compare.getByRole('radio', { name: 'Keep mine' }).first()).toBeChecked();
  await compare.getByRole('button', { name: 'Apply' }).click();
  await expect(options.getByTestId('profile-headline')).toHaveValue(
    'Senior Backend Engineer, payments',
  );

  await options.getByRole('button', { name: 'Undo last change' }).click();
  await expect(options.getByTestId('profile-headline')).toHaveValue(
    'Senior Backend Engineer, payments',
  );
});

test('standard answers persist and reach the prompt', async ({ context, extensionId, panel }) => {
  await seed(panel);
  const options = await openOptions(context, extensionId, 'standard-answers');
  await options.getByTestId('sa-timezone').fill('UTC+0 (Lisbon)');
  await options.getByRole('button', { name: 'Add question' }).click();
  await options.getByLabel('Question 1').fill('Can you start within two weeks?');
  await options.getByLabel('Answer 1').fill('Yes');
  await options.getByRole('button', { name: 'Save' }).click();
  await options.reload();
  await expect(options.getByTestId('sa-timezone')).toHaveValue('UTC+0 (Lisbon)');

  const page = await context.newPage();
  await page.goto(`${FIXTURES}/plain-form.html`);
  await snipLabel(panel, page, 'label[for="years"]');
  await expect(panel.getByTestId('answer')).toHaveValue('5');
  const system = JSON.stringify((await mockLog()).at(-1)!.system);
  expect(system).toContain('UTC+0 (Lisbon)');
  expect(system).toContain('Can you start within two weeks?');
});
