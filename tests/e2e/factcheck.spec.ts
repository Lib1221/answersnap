import { expect, FIXTURES, mockLog, seed, snipLabel, test } from './fixtures';

type Logged = { system?: { text: string }[]; model?: string; _model?: string; stream?: boolean };
const checks = async () =>
  ((await mockLog()) as Logged[]).filter((b) =>
    JSON.stringify(b).includes('You check a drafted job application answer'),
  );

test('the fact check flags an unsupported sentence, and Fix it rewrites without it', async ({
  context,
  panel,
}) => {
  await seed(panel);
  const page = await context.newPage();
  await page.goto(`${FIXTURES}/project-form.html`);
  await snipLabel(panel, page, '#project-label');

  const flags = panel.getByTestId('fact-check-flags');
  await expect(flags).toContainText('Fact check: 1 of 2 sentences aren’t backed by your profile.');
  await expect(flags).toContainText(
    'The system was struggling under heavy load before I stepped in.',
  );
  await expect(flags).toContainText('Your resume never mentions load problems');
  // Insert still works; the check only warns.
  await expect(panel.getByRole('button', { name: 'Insert', exact: true })).toBeEnabled();

  const [check] = await checks();
  expect(check!.model).toBe('claude-haiku-4-5-20251001'); // the fast model by default
  expect(check!.system!.map((b) => 'cache_control' in b)).toEqual([false, true]);

  await flags.getByRole('button', { name: 'Fix it' }).click();
  await expect(panel.getByTestId('answer')).not.toHaveValue(/struggling/);
  await expect(panel.getByTestId('fact-check-ok')).toHaveText(
    '✓ Fact check: the sentence is backed by your profile.',
  );
  expect(await checks()).toHaveLength(2);
});

test('editing makes the check stale; Keep anyway dismisses the warning', async ({
  context,
  panel,
}) => {
  await seed(panel);
  const page = await context.newPage();
  await page.goto(`${FIXTURES}/project-form.html`);
  await snipLabel(panel, page, '#project-label');
  const flags = panel.getByTestId('fact-check-flags');
  await expect(flags).toBeVisible();
  await flags.getByRole('button', { name: 'Keep anyway' }).click();
  await expect(panel.getByTestId('fact-check')).toContainText('you kept 1 sentence');

  await panel
    .getByTestId('answer')
    .fill('I moved report generation to Celery workers at Ledgerly, cutting p95 latency.');
  await expect(panel.getByTestId('fact-check')).toContainText(
    'You edited the answer since the fact check.',
  );
  await panel.getByRole('button', { name: 'Check again' }).click();
  await expect(panel.getByTestId('fact-check-ok')).toBeVisible();
});

test('no fact check for value answers or when turned off', async ({
  context,
  extensionId,
  panel,
}) => {
  await seed(panel);
  const page = await context.newPage();
  await page.goto(`${FIXTURES}/plain-form.html`);
  await snipLabel(panel, page, 'label[for="years"]');
  await expect(panel.getByTestId('answer')).toHaveValue('5');
  await panel.waitForTimeout(500);
  expect(await checks()).toHaveLength(0);

  const options = await context.newPage();
  await options.goto(`chrome-extension://${extensionId}/options.html#writing-style`);
  await options.getByText('Check every answer against my profile').click();
  const project = await context.newPage();
  await project.goto(`${FIXTURES}/project-form.html`);
  await snipLabel(panel, project, '#project-label');
  await expect(panel.getByTestId('answer')).toHaveValue(/struggling/);
  await panel.waitForTimeout(500);
  expect(await checks()).toHaveLength(0);
  await expect(panel.getByTestId('fact-check')).toHaveCount(0);
});

test('Gemini checks with its fast model through a JSON schema', async ({ context, panel }) => {
  await seed(panel, { provider: 'gemini' });
  const page = await context.newPage();
  await page.goto(`${FIXTURES}/project-form.html`);
  await snipLabel(panel, page, '#project-label');
  await expect(panel.getByTestId('fact-check-flags')).toBeVisible();
  const [check] = await checks();
  expect(check!._model).toBe('gemini-3.5-flash-lite');
  expect(JSON.stringify(check)).toContain('responseJsonSchema');
});
