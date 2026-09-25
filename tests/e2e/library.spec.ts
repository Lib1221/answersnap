import type { Page } from '@playwright/test';
import { expect, FIXTURES, mockLog, seed, snipLabel, tabIdOf, test } from './fixtures';

type Body = { stream?: boolean; messages: { content: { type: string; text?: string }[] }[] };
const streamed = async () => ((await mockLog()) as Body[]).filter((b) => b.stream);

async function answerAndInsert(panel: Page, page: Page, label: string) {
  await snipLabel(panel, page, label);
  await expect(panel.getByTestId('refine')).toBeVisible();
  await panel.getByRole('button', { name: 'Insert', exact: true }).click();
  await expect(panel.getByText('Inserted')).toBeVisible();
}

test('a similar question offers Reuse, which makes no API call', async ({ context, panel }) => {
  await seed(panel);
  const page = await context.newPage();
  await page.goto(`${FIXTURES}/plain-form.html`);
  await answerAndInsert(panel, page, 'label[for="years"]');
  expect(await streamed()).toHaveLength(1);

  await page.reload();
  await snipLabel(panel, page, 'label[for="years"]');
  const card = panel.getByTestId('reuse-card');
  await expect(card).toContainText('You answered this before');
  await card.getByRole('button', { name: 'Reuse' }).click();
  await expect(panel.getByTestId('answer')).toHaveValue('5');
  expect(await streamed()).toHaveLength(1);

  // Adapt sends the old answer as an example.
  await snipLabel(panel, page, 'label[for="years"]');
  await panel.getByTestId('reuse-card').getByRole('button', { name: 'Adapt' }).click();
  await expect(panel.getByTestId('refine')).toBeVisible();
  const adapt = (await streamed()).at(-1)!;
  expect(adapt.messages[0]!.content.find((c) => c.type === 'text')!.text).toContain(
    '<saved_answers>',
  );
});

test('Library tab: search, pin, edit, use, delete', async ({ context, panel }) => {
  await seed(panel);
  const page = await context.newPage();
  await page.goto(`${FIXTURES}/plain-form.html`);
  await answerAndInsert(panel, page, 'label[for="years"]');
  await answerAndInsert(panel, page, 'label[for="why-text"]');

  await panel.getByRole('tab', { name: 'Library' }).click();
  const entries = panel.getByTestId('library-entry');
  await expect(entries).toHaveCount(2);
  await panel.getByPlaceholder('Search saved answers').fill('python');
  await expect(entries).toHaveCount(1);
  await entries.getByRole('button', { name: 'Pin' }).click();
  await expect(entries).toContainText('pinned');
  await entries.getByRole('button', { name: 'Edit' }).click();
  await panel.getByLabel('Edit saved answer').fill('Five');
  await entries.getByRole('button', { name: 'Save' }).click();
  await expect(entries).toContainText('Five');
  await entries.getByRole('button', { name: 'Use for this question' }).click();
  await expect(panel.getByRole('tab', { name: 'Answer' })).toHaveAttribute('aria-selected', 'true');
  await expect(panel.getByTestId('answer')).toHaveValue('Five');

  await panel.getByRole('tab', { name: 'Library' }).click();
  await panel.getByPlaceholder('Search saved answers').fill('');
  await panel.getByTestId('library-entry').last().getByRole('button', { name: 'Delete' }).click();
  await expect(panel.getByTestId('library-entry')).toHaveCount(1);
});

test('native choice fields: radio, select, and checkboxes', async ({ context, panel }) => {
  await seed(panel);
  const page = await context.newPage();
  await page.goto(`${FIXTURES}/choice.html`);

  await snipLabel(panel, page, '#english-label');
  await expect(panel.getByTestId('target')).toContainText('choice');
  await panel.getByRole('button', { name: 'Select', exact: true }).click();
  await expect(panel.getByText('Selected')).toBeVisible();
  await expect(page.locator('input[value="f"]')).toBeChecked();

  await snipLabel(panel, page, '#tz-label');
  await expect(panel.getByTestId('target')).toContainText('dropdown');
  await panel.getByRole('button', { name: 'Select', exact: true }).click();
  await expect(page.locator('#tz')).toHaveValue('UTC+00:00 London, Lisbon');

  await snipLabel(panel, page, '#frameworks-label');
  await panel.getByRole('button', { name: 'Select', exact: true }).click();
  await expect(page.locator('input[value="django"]')).toBeChecked();
  await expect(page.locator('input[value="flask"]')).toBeChecked();
  await expect(page.locator('input[value="fastapi"]')).not.toBeChecked();
});

test('"Answer this field" captures around the focused field and uses its label', async ({
  context,
  panel,
}) => {
  await seed(panel);
  const page = await context.newPage();
  await page.goto(`${FIXTURES}/plain-form.html`);
  await page.locator('#years').focus();
  const tabId = await tabIdOf(panel, page);
  await page.bringToFront();
  await panel.evaluate(
    (id) => chrome.runtime.sendMessage({ type: 'E2E_START_SNIP', tabId: id, mode: 'field' }),
    tabId,
  );
  await expect(panel.getByTestId('answer')).toHaveValue('5');
  await expect(panel.getByTestId('page-text')).toContainText(
    'How many years of professional Python',
  );
  await expect(panel.getByTestId('target')).toContainText('input');
  await panel.getByRole('button', { name: 'Insert', exact: true }).click();
  await expect(page.locator('#years')).toHaveValue('5');
});

test('"Use selection as job post" sets the job context', async ({ context, panel }) => {
  await seed(panel);
  const page = await context.newPage();
  await page.goto(`${FIXTURES}/job.html`);
  await page.evaluate(() => {
    const range = document.createRange();
    range.selectNodeContents(document.getElementById('post')!);
    getSelection()!.addRange(range);
  });
  const tabId = await tabIdOf(panel, page);
  await panel.evaluate(
    (id) => chrome.runtime.sendMessage({ type: 'E2E_JOB_SELECTION', tabId: id }),
    tabId,
  );
  await expect(panel.getByTestId('job-chip')).toContainText('Senior Backend Engineer');
  const stored = await panel.evaluate(async () =>
    JSON.stringify(await chrome.storage.session.get(null)),
  );
  expect(stored).toContain('reconciliation and payouts');
  expect(stored).not.toContain('pineapples');
});

test('with history off, Insert does not save; Save still does', async ({
  context,
  extensionId,
  panel,
}) => {
  await seed(panel);
  const options = await context.newPage();
  await options.goto(`chrome-extension://${extensionId}/options.html#privacy`);
  await options.getByLabel('Save answers when I insert or copy them').uncheck();
  const page = await context.newPage();
  await page.goto(`${FIXTURES}/plain-form.html`);
  await answerAndInsert(panel, page, 'label[for="years"]');
  const count = () =>
    panel.evaluate(async () => ((await chrome.storage.local.get('library')).library ?? []).length);
  expect(await count()).toBe(0);
  await panel.getByRole('button', { name: 'Save', exact: true }).click();
  await expect.poll(count).toBe(1);
});

test('privacy: last request, export, import with summary, delete all', async ({
  context,
  extensionId,
  panel,
}) => {
  await seed(panel);
  const page = await context.newPage();
  await page.goto(`${FIXTURES}/plain-form.html`);
  await answerAndInsert(panel, page, 'label[for="years"]');

  const options = await context.newPage();
  await options.goto(`chrome-extension://${extensionId}/options.html#privacy`);
  await options.getByRole('button', { name: 'Show the last request' }).click();
  const shown = await options.getByTestId('last-request').innerText();
  expect(shown).toContain('not stored');
  expect(shown).not.toContain('base64');
  expect(shown).not.toContain('test-key');

  const download = options.waitForEvent('download');
  await options.getByRole('button', { name: 'Export all data' }).click();
  const file = await (await download).path();

  await options.getByRole('button', { name: 'Delete all data' }).click();
  await options.getByRole('button', { name: 'Delete everything' }).click();
  // The page reloads to Getting started; let that finish before navigating again.
  await expect(options).toHaveURL(/#welcome$/);
  await expect(options.getByRole('heading', { name: 'Getting started' })).toBeVisible();
  expect(
    await panel.evaluate(async () => Object.keys(await chrome.storage.local.get(null))),
  ).toEqual([]);

  await options.goto(`chrome-extension://${extensionId}/options.html#privacy`);
  await options.getByTestId('import-input').setInputFiles(file);
  await expect(options.getByTestId('import-summary')).toContainText('1 source (1 in use)');
  await expect(options.getByTestId('import-summary')).toContainText('1 saved answer');
  await options.getByRole('button', { name: 'Replace my data' }).click();
  await expect(options.getByText('Imported.')).toBeVisible();
  const keys = await panel.evaluate(async () =>
    Object.keys(await chrome.storage.local.get(null)).sort(),
  );
  expect(keys).toEqual(
    expect.arrayContaining(['library', 'settings', 'sources', 'standardAnswers']),
  );
  expect(keys).not.toContain('apiKey:anthropic');
});
