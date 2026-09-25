import { expect, FIXTURES, mockLog, seed, tabIdOf, test } from './fixtures';

const batches = async () =>
  (await mockLog()).filter((b) => JSON.stringify(b).includes('Write an answer for every field'));

test('fill the whole form: scan, draft in one request, review, insert, never submit', async ({
  context,
  panel,
}) => {
  await seed(panel);
  const page = await context.newPage();
  await page.goto(`${FIXTURES}/full-form.html`);
  await page.bringToFront();

  await panel.getByRole('tab', { name: 'Form' }).click();
  await panel.getByRole('button', { name: 'Scan this form' }).click();
  const fields = panel.getByTestId('form-fields').locator('li');
  await expect(fields).toHaveCount(10);
  // The already-filled field starts unticked.
  await expect(panel.getByLabel('Draft How did you hear about us?')).not.toBeChecked();
  await panel.getByRole('button', { name: 'Draft 9 answers' }).click();

  const items = panel.getByTestId('form-item');
  await expect(items).toHaveCount(9);
  expect(await batches()).toHaveLength(1);
  const batch = JSON.stringify((await batches())[0]);
  expect(batch).toContain('"format":{"type":"json_schema"');
  expect(batch).toContain('max_chars=\\"1000\\"');

  // Placeholders and test questions start unticked.
  const rate = items.filter({ hasText: 'hourly rate' });
  await expect(rate.getByRole('checkbox')).not.toBeChecked();
  await expect(rate).toContainText('expected hourly rate in USD');
  const quiz = items.filter({ hasText: 'What does this print' });
  await expect(quiz).toContainText('A test question');
  await expect(quiz.getByRole('checkbox')).toBeDisabled();

  // Edit one answer before inserting.
  await items.filter({ hasText: 'Full name' }).getByRole('textbox').fill('Jamie S. Park');
  await panel.getByTestId('insert-selected').click();
  await expect(panel.getByTestId('form-summary')).toContainText('Inserted 7.', { timeout: 15_000 });

  await expect(page.locator('#name')).toHaveValue('Jamie S. Park');
  await expect(page.locator('#email')).toHaveValue('jamie.park@example.com');
  await expect(page.locator('#years')).toHaveValue('5');
  await expect(page.locator('#why')).toHaveValue(/Ledgerly/);
  await expect(page.locator('input[value="fluent"]')).toBeChecked();
  await expect(page.locator('#tz')).toHaveValue('UTC+00:00 London, Lisbon');
  await expect(page.locator('input[value="django"]')).toBeChecked();
  await expect(page.locator('input[value="spring"]')).not.toBeChecked();
  await expect(page.locator('#rate')).toHaveValue('');
  await expect(page.locator('#quiz')).toHaveValue('');
  await expect(page.locator('#ref')).toHaveValue('A friend');
  expect(
    await page.evaluate(() => (window as unknown as { submitted?: boolean }).submitted),
  ).toBeUndefined();
});

test('the context menu scan opens the Form tab; saved answers are reused without a request', async ({
  context,
  panel,
}) => {
  await seed(panel);
  const page = await context.newPage();
  await page.goto(`${FIXTURES}/full-form.html`);
  const tabId = await tabIdOf(panel, page);

  // First pass fills and saves the answers.
  await panel.evaluate(
    (id) => chrome.runtime.sendMessage({ type: 'E2E_FILL_FORM', tabId: id }),
    tabId,
  );
  await expect(panel.getByRole('tab', { name: 'Form' })).toHaveAttribute('aria-selected', 'true');
  await panel.getByRole('button', { name: /Draft \d+ answers/ }).click();
  await panel.getByTestId('insert-selected').click();
  await expect(panel.getByTestId('form-summary')).toBeVisible({ timeout: 15_000 });
  expect(await batches()).toHaveLength(1);

  // Same form again on the same site: answers come from the library.
  await page.reload();
  await panel.evaluate(
    (id) => chrome.runtime.sendMessage({ type: 'E2E_FILL_FORM', tabId: id }),
    tabId,
  );
  await panel.getByRole('button', { name: /Draft \d+ answers/ }).click();
  const reused = panel.getByTestId('form-item').filter({ hasText: 'From your saved answers' });
  await expect(reused).toHaveCount(7);
  await expect(
    panel.getByTestId('form-item').filter({ hasText: 'Why do you want to join us?' }),
  ).toContainText('From your saved answers');
  // Only the two fields that weren't inserted last time (rate, quiz) went to the model.
  const all = await batches();
  expect(all).toHaveLength(2);
  expect(JSON.stringify(all[1])).not.toContain('Why do you want to join us');
});
