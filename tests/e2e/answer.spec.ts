import { expect, FIXTURES, mockLog, seed, snipLabel, test } from './fixtures';

const PYTHON = 'label[for="years"]';
const WHY = 'label[for="why-text"]';

test('a snip streams an answer into the panel', async ({ context, panel }) => {
  await seed(panel);
  const page = await context.newPage();
  await page.goto(`${FIXTURES}/plain-form.html`);
  await snipLabel(panel, page, PYTHON);

  await expect(panel.getByTestId('answer')).toHaveValue('5');
  await expect(panel.getByTestId('counter')).toHaveText('1 / 300 characters');
  await expect(panel.getByTestId('usage')).toContainText(
    'Sonnet 5. In 1.9k (1.8k cached), out 42.',
  );
  await expect(panel.getByTestId('usage')).toContainText('About $');

  // The streamed answer request (a stray request from another test can't shift this).
  const body = (await mockLog()).find((b) => b.stream === true);
  const system = body!.system as { text: string; cache_control?: unknown }[];
  expect(system.map((b) => 'cache_control' in b)).toEqual([false, true]);
  expect(system[1]!.text).toContain('Jamie Park');
  expect(body).toMatchObject({
    model: 'claude-sonnet-5',
    stream: true,
    thinking: { type: 'disabled' },
  });
  expect(body).not.toHaveProperty('temperature');
  const content = (body!.messages as { content: { type: string }[] }[])[0]!.content;
  expect(content.map((c) => c.type)).toEqual(['image', 'text']);
});

test('hidden page text never reaches the request', async ({ context, panel }) => {
  await seed(panel);
  const page = await context.newPage();
  await page.goto(`${FIXTURES}/plain-form.html`);
  const box = (await page.locator('#why').boundingBox())!;
  const { drag, startSnip } = await import('./fixtures');
  await startSnip(panel, page);
  await drag(page, { x: box.x - 4, y: box.y - 4 }, { x: box.x + 300, y: box.y + 60 });

  await expect(panel.getByTestId('answer')).toHaveValue(/Ledgerly/);
  const log = JSON.stringify(await mockLog());
  expect(log).toContain('Why do you want to join us?');
  expect(log).not.toContain('pineapple');
});

test('Stop aborts a slow stream', async ({ context, panel }) => {
  await seed(panel, { key: 'slow-key' });
  const page = await context.newPage();
  await page.goto(`${FIXTURES}/plain-form.html`);
  await snipLabel(panel, page, WHY);

  await expect(panel.getByRole('button', { name: 'Stop' })).toBeVisible();
  await expect(panel.getByTestId('answer')).not.toHaveValue('');
  await panel.getByRole('button', { name: 'Stop' }).click();
  await expect(panel.getByText('Stopped.')).toBeVisible();
  const partial = await panel.getByTestId('answer').inputValue();
  await panel.waitForTimeout(800);
  expect(await panel.getByTestId('answer').inputValue()).toBe(partial);
});

test('401 asks the user to check the key', async ({ context, panel }) => {
  await seed(panel, { key: 'bad-key' });
  const page = await context.newPage();
  await page.goto(`${FIXTURES}/plain-form.html`);
  await snipLabel(panel, page, PYTHON);

  await expect(panel.getByTestId('answer-error')).toContainText(
    'The API key was rejected. Check it in Settings.',
  );
  await expect(panel.getByRole('button', { name: 'Open settings' })).toBeVisible();
  expect(await mockLog()).toHaveLength(1);
});

test('429 waits for retry-after and retries once', async ({ context, panel }) => {
  await seed(panel, { key: 'rate-limit-key' });
  const page = await context.newPage();
  await page.goto(`${FIXTURES}/plain-form.html`);
  await snipLabel(panel, page, PYTHON);

  await expect(panel.getByText('Rate limited by the API. Retrying in 2 seconds.')).toBeVisible();
  await expect(panel.getByTestId('answer')).toHaveValue('5');
  expect(await mockLog()).toHaveLength(2);
});

test('529 backs off and retries', async ({ context, panel }) => {
  await seed(panel, { key: 'overloaded-key' });
  const page = await context.newPage();
  await page.goto(`${FIXTURES}/plain-form.html`);
  await snipLabel(panel, page, PYTHON);

  await expect(panel.getByText('The AI service is busy. Retrying.')).toBeVisible();
  await expect(panel.getByTestId('answer')).toHaveValue('5', { timeout: 10_000 });
  expect(await mockLog()).toHaveLength(3);
});

test('no key shows the settings prompt', async ({ context, panel }) => {
  await seed(panel, { key: null });
  const page = await context.newPage();
  await page.goto(`${FIXTURES}/plain-form.html`);
  await snipLabel(panel, page, PYTHON);
  await expect(panel.getByTestId('needs-key')).toContainText('Add your API key to start.');
  expect(await mockLog()).toHaveLength(0);
});

test('Gemini streams an answer too', async ({ context, panel }) => {
  await seed(panel, { provider: 'gemini', key: 'test-key' });
  const page = await context.newPage();
  await page.goto(`${FIXTURES}/plain-form.html`);
  await snipLabel(panel, page, PYTHON);

  await expect(panel.getByTestId('answer')).toHaveValue('5');
  await expect(panel.getByTestId('usage')).toContainText('Gemini 3.5 Flash.');
  await expect(panel.getByTestId('usage')).toContainText('Free tier');
  const [body] = await mockLog();
  expect(body).toMatchObject({ generationConfig: { thinkingConfig: { thinkingLevel: 'low' } } });
  expect((body!.contents as { parts: object[] }[])[0]!.parts[0]).toHaveProperty('inlineData');
});

test('Gemini bad key maps to the key message', async ({ context, panel }) => {
  await seed(panel, { provider: 'gemini', key: 'bad-key' });
  const page = await context.newPage();
  await page.goto(`${FIXTURES}/plain-form.html`);
  await snipLabel(panel, page, PYTHON);
  await expect(panel.getByTestId('answer-error')).toContainText('The API key was rejected.');
});

test('Test key lists models in options', async ({ context, extensionId, panel }) => {
  await seed(panel, { key: null });
  const options = await context.newPage();
  await options.goto(`chrome-extension://${extensionId}/options.html#provider`);
  await options.getByLabel('API key').fill('test-key');
  await options.getByRole('button', { name: 'Test key' }).click();
  await expect(options.getByTestId('test-result')).toHaveText('The key works. 2 models available.');
  await expect(options.getByLabel('Model', { exact: true }).locator('option')).toHaveText([
    'Claude Sonnet 5',
    'Claude Haiku 4.5',
  ]);

  await options.getByLabel('API key').fill('bad-key');
  await options.getByRole('button', { name: 'Test key' }).click();
  await expect(options.getByTestId('test-result')).toHaveText(
    'The API key was rejected. Check it in Settings.',
  );

  await options.getByLabel(/Google Gemini/).check();
  await expect(options.getByTestId('gemini-privacy')).toBeVisible();
});
