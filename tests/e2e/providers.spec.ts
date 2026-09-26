import { expect, FIXTURES, mockLog, seed, snipLabel, test } from './fixtures';

type Body = {
  _model: string;
  _auth: string | null;
  stream?: boolean;
  messages: { role: string }[];
};

test('OpenRouter streams an answer with the key as a bearer token', async ({ context, panel }) => {
  await seed(panel, { provider: 'openrouter', key: 'sk-or-v1-test' });
  const page = await context.newPage();
  await page.goto(`${FIXTURES}/plain-form.html`);
  await snipLabel(panel, page, 'label[for="years"]');
  await expect(panel.getByTestId('answer')).toHaveValue('5');
  const body = ((await mockLog()) as Body[]).find((b) => b.stream)!;
  expect(body._model).toBe('openrouter/auto');
  expect(body._auth).toBe('Bearer sk-or-v1-test');
  expect(body.messages[0]!.role).toBe('system');
});

test('Ollama answers with no key, and Connect lists the installed models', async ({
  context,
  extensionId,
  panel,
}) => {
  await seed(panel, { provider: 'ollama', key: null });
  const page = await context.newPage();
  await page.goto(`${FIXTURES}/plain-form.html`);
  await snipLabel(panel, page, 'label[for="years"]');
  await expect(panel.getByTestId('answer')).toHaveValue('5');
  const body = ((await mockLog()) as Body[]).find((b) => b.stream)!;
  expect(body._model).toBe('llama3.2');
  expect(body._auth).toBeNull();
  // Free: no cost estimate.
  await expect(panel.getByTestId('usage')).not.toContainText('$');

  const options = await context.newPage();
  await options.goto(`chrome-extension://${extensionId}/options.html#provider`);
  await expect(options.getByLabel('API key')).toHaveCount(0);
  await expect(options.getByTestId('ollama-setup')).toContainText('OLLAMA_ORIGINS');
  await options.getByTestId('ollama-connect').click();
  await expect(options.getByTestId('test-result')).toHaveText(
    /Connected to Ollama\. 2 models installed\./,
  );
});

test('bad OpenRouter key maps to the key message', async ({ context, panel }) => {
  await seed(panel, { provider: 'openrouter', key: 'bad-key' });
  const page = await context.newPage();
  await page.goto(`${FIXTURES}/plain-form.html`);
  await snipLabel(panel, page, 'label[for="years"]');
  await expect(panel.getByTestId('answer-error')).toContainText('The API key was rejected.');
});
