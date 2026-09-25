import type { Page } from '@playwright/test';
import { expect, FIXTURES, seed, snipLabel, test } from './fixtures';

const WHY_ANSWER = /Ledgerly/;

async function snipAndWait(panel: Page, page: Page, label: string) {
  await snipLabel(panel, page, label);
  await expect(panel.getByTestId('refine')).toBeVisible();
}

async function insert(panel: Page) {
  await panel.getByRole('button', { name: 'Insert', exact: true }).click();
  await expect(panel.getByText('Inserted')).toBeVisible();
}

test.beforeEach(async ({ panel }) => {
  await seed(panel);
});

test('plain input and textarea', async ({ context, panel }) => {
  const page = await context.newPage();
  await page.goto(`${FIXTURES}/plain-form.html`);
  await snipAndWait(panel, page, 'label[for="years"]');
  await expect(panel.getByTestId('target')).toContainText(
    'Target: "How many years of professional Python experience do you have?" input',
  );
  await insert(panel);
  await expect(page.locator('#years')).toHaveValue('5');

  await snipAndWait(panel, page, 'label[for="why-text"]');
  await insert(panel);
  await expect(page.locator('#why-text')).toHaveValue(WHY_ANSWER);
});

test('React controlled inputs keep the value in state', async ({ context, panel }) => {
  const page = await context.newPage();
  await page.goto(`${FIXTURES}/react-form.html`);
  await snipAndWait(panel, page, 'label[for="years"]');
  await insert(panel);
  await snipAndWait(panel, page, '#why-label');
  await insert(panel);
  const state = JSON.parse(await page.locator('#state').innerText());
  expect(state.years).toBe('5');
  expect(state.why).toMatch(WHY_ANSWER);
  // A re-render must not wipe it.
  await page.locator('#years').focus();
  await expect(page.locator('#why')).toHaveValue(WHY_ANSWER);
});

test('Vue v-model', async ({ context, panel }) => {
  const page = await context.newPage();
  await page.goto(`${FIXTURES}/vue-form.html`);
  await snipAndWait(panel, page, '#why-label');
  await insert(panel);
  await expect(page.locator('#state')).toContainText('Ledgerly');
});

test('plain contenteditable and Quill', async ({ context, panel }) => {
  const page = await context.newPage();
  await page.goto(`${FIXTURES}/editors.html`);
  await snipAndWait(panel, page, '#plain-label');
  await expect(panel.getByTestId('target')).toContainText('editor');
  await insert(panel);
  await expect(page.locator('#plain')).toContainText('Ledgerly');

  await snipAndWait(panel, page, '#quill-label');
  await insert(panel);
  const text = await page.evaluate(() =>
    (window as unknown as { quill: { getText(): string } }).quill.getText(),
  );
  expect(text).toMatch(WHY_ANSWER);
});

test('existing content: Replace by default, Append on request', async ({ context, panel }) => {
  const page = await context.newPage();
  await page.goto(`${FIXTURES}/prefilled.html`);
  await snipAndWait(panel, page, '#why-label');
  await expect(panel.getByRole('button', { name: 'Replace', exact: true })).toBeVisible();
  await panel.getByRole('button', { name: 'More insert options' }).click();
  await panel.getByRole('button', { name: 'Append', exact: true }).click();
  await expect(page.locator('#why')).toHaveValue(/^Draft from earlier\.\n\nI build payment APIs/);

  await panel.getByRole('button', { name: 'Replace', exact: true }).click();
  await expect(page.locator('#why')).toHaveValue(/^I build payment APIs/);
});

test('Ctrl+Enter inserts; over the limit, Insert waits', async ({ context, panel }) => {
  const page = await context.newPage();
  await page.goto(`${FIXTURES}/job.html`);
  await snipAndWait(panel, page, '#why-label');
  await panel.getByTestId('answer').fill('I build payment systems. '.repeat(50));
  await expect(panel.getByRole('button', { name: 'Insert', exact: true })).toBeDisabled();
  await panel.getByRole('button', { name: 'Cut at last sentence' }).click();
  await panel.getByTestId('answer').press('Control+Enter');
  await expect(panel.getByText('Inserted')).toBeVisible();
  const value = await page.locator('#why').inputValue();
  expect(value.length).toBeLessThanOrEqual(1000);
});

test('Pick another field', async ({ context, panel }) => {
  const page = await context.newPage();
  await page.goto(`${FIXTURES}/prefilled.html`);
  await snipAndWait(panel, page, '#why-label');
  await panel.getByRole('button', { name: 'Change' }).click();
  await expect(panel.getByTestId('target')).toContainText('Click the field on the page');
  await page.bringToFront();
  await page.locator('#other').click();
  await expect(panel.getByTestId('target')).toContainText('Target: "Anything else?" input');
  await expect(page.locator('#other')).toHaveValue('');
  await insert(panel);
  await expect(page.locator('#other')).toHaveValue(WHY_ANSWER);
  await expect(page.locator('#why')).toHaveValue('Draft from earlier.');
});

test('a field inside a cross-origin iframe falls back to copy', async ({ context, panel }) => {
  const page = await context.newPage();
  await page.goto(`${FIXTURES}/iframe-host.html`);
  await page.frameLocator('#embed').locator('#inner').click();
  await snipAndWait(panel, page, '#why-label');
  await expect(panel.getByTestId('target')).toContainText('a field inside an embedded frame');
  await panel.bringToFront();
  await panel.getByRole('button', { name: 'Insert', exact: true }).click();
  await expect(panel.getByTestId('insert-message')).toContainText(
    "Couldn't fill this field directly.",
  );
  await expect(page.frameLocator('#embed').locator('#inner')).toHaveValue('');
});

test('after the page reloads, Insert asks to pick the field again', async ({ context, panel }) => {
  const page = await context.newPage();
  await page.goto(`${FIXTURES}/plain-form.html`);
  await snipAndWait(panel, page, 'label[for="years"]');
  await page.reload();
  await panel.getByRole('button', { name: 'Insert', exact: true }).click();
  await expect(panel.getByTestId('insert-message')).toContainText(
    'The page changed since the snip.',
  );
});
