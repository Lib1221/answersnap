import { expect, FIXTURES, mockLog, seed, snipLabel, test } from './fixtures';

type Logged = { _model?: string; contents?: unknown };

test('Gemini falls back to the next model when one hits its daily free limit', async ({
  context,
  extensionId,
  panel,
}) => {
  await seed(panel, { provider: 'gemini', key: 'quota-key' });
  const page = await context.newPage();
  await page.goto(`${FIXTURES}/plain-form.html`);
  await snipLabel(panel, page, 'label[for="years"]');

  await expect(panel.getByTestId('answer')).toHaveValue('5');
  await expect(panel.getByTestId('fallback-note')).toHaveText(
    'Gemini 3.5 Flash reached its daily free limit, so this answer uses Gemini 3.6 Flash.',
  );
  await expect(panel.getByTestId('usage')).toContainText('Gemini 3.6 Flash.');
  let models = ((await mockLog()) as Logged[]).map((b) => b._model);
  // One try on 3.5 Flash (no pointless retry on a daily quota), then 3.6 Flash.
  expect(models).toEqual(['gemini-3.5-flash', 'gemini-3.6-flash']);

  // The next question goes straight to the model that works.
  await snipLabel(panel, page, 'label[for="why-text"]');
  await expect(panel.getByTestId('answer')).toHaveValue(/Ledgerly/);
  models = ((await mockLog()) as Logged[]).map((b) => b._model);
  expect(models.slice(2)).toEqual(['gemini-3.6-flash']);

  // Settings show which model is resting.
  const options = await context.newPage();
  await options.goto(`chrome-extension://${extensionId}/options.html#provider`);
  const chain = options.getByTestId('fallback-chain');
  await expect(chain.locator('li').first()).toContainText('Gemini 3.5 Flash');
  await expect(chain.locator('li').first()).toContainText(/Limit reached, back in/);
  await expect(chain.locator('li').nth(1)).toContainText('Ready');
});

test('with fallback off, the limit message suggests switching', async ({
  context,
  extensionId,
  panel,
}) => {
  await seed(panel, { provider: 'gemini', key: 'quota-key' });
  const options = await context.newPage();
  await options.goto(`chrome-extension://${extensionId}/options.html#provider`);
  await options
    .getByText('When a model hits its free limit, switch to the next one automatically')
    .click();
  const page = await context.newPage();
  await page.goto(`${FIXTURES}/plain-form.html`);
  await snipLabel(panel, page, 'label[for="years"]');
  await expect(panel.getByTestId('answer-error')).toContainText(
    "You've reached Gemini's free-tier limit for this model.",
  );
  expect(((await mockLog()) as Logged[]).map((b) => b._model)).toEqual(['gemini-3.5-flash']);
});
