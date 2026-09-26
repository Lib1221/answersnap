import { expect, mockLog, seed, test } from './fixtures';

type Body = { max_tokens?: number; system?: { text: string }[]; messages?: unknown };

test('save your own cover letter in Settings; it becomes a source', async ({
  context,
  extensionId,
  panel,
}) => {
  await seed(panel);
  const options = await context.newPage();
  await options.goto(`chrome-extension://${extensionId}/options.html#cover-letter`);
  await expect(options.getByTestId('cover-letter-save')).toBeDisabled();
  await options
    .getByTestId('cover-letter-text')
    .fill('Dear Hiring Manager,\n\nI love building reliable payment systems.\n\nJamie');
  await options.getByTestId('cover-letter-save').click();
  await expect(options.getByRole('status')).toHaveText('Saved');
  await expect(options.getByTestId('cover-letter-enabled')).toBeChecked();

  await options.goto(`chrome-extension://${extensionId}/options.html#sources`);
  await expect(options.getByTestId('source-list')).toContainText('My cover letter');
  await expect(options.getByTestId('source-list')).toContainText('Cover letter,');

  // Reloading shows the saved text.
  await options.goto(`chrome-extension://${extensionId}/options.html#cover-letter`);
  await expect(options.getByTestId('cover-letter-text')).toHaveValue(/reliable payment systems/);
});

test('the Letter tab writes a cover letter from the profile and your own letter', async ({
  context,
  extensionId,
  panel,
}) => {
  await seed(panel);
  const options = await context.newPage();
  await options.goto(`chrome-extension://${extensionId}/options.html#cover-letter`);
  await options
    .getByTestId('cover-letter-text')
    .fill('Dear Hiring Manager,\n\nI love building reliable payment systems.\n\nJamie');
  await options.getByTestId('cover-letter-save').click();
  await expect(options.getByRole('status')).toHaveText('Saved');

  await panel.bringToFront();
  await panel.getByRole('tab', { name: 'Job' }).click();
  await expect(panel.getByTestId('letter-no-job')).toBeVisible();
  await expect(panel.getByTestId('letter-add-own')).toHaveCount(0);
  await panel.getByTestId('letter-company').fill('Globex');
  await panel.getByTestId('letter-role').fill('Backend Engineer');
  await panel.getByRole('radio', { name: 'Long' }).click();
  await panel.getByTestId('letter-notes').fill('I can start in two weeks');
  await panel.getByTestId('letter-write').click();

  await expect(panel.getByTestId('answer')).toHaveValue(/^Dear Hiring Manager,/);
  await expect(panel.getByTestId('answer')).toHaveValue(/Jamie Park$/);
  await expect(panel.getByTestId('letter-write')).toHaveText(/Write again/);

  const body = ((await mockLog()) as Body[]).find((b) =>
    JSON.stringify(b.messages).includes('Write a cover letter'),
  )!;
  const turn = JSON.stringify(body.messages);
  expect(turn).toContain('Write a cover letter for the Backend Engineer role at Globex.');
  expect(turn).toContain('My cover letter');
  expect(turn).toContain('I can start in two weeks');
  expect(turn).toContain('about 400 words');
  expect(body.max_tokens).toBeGreaterThanOrEqual(2048);
  expect(JSON.stringify(body.system)).toContain('I love building reliable payment systems.');

  // The Answer tab is untouched.
  await panel.getByRole('tab', { name: 'Answer' }).click();
  await expect(panel.locator('[data-state="idle"]')).toBeVisible();
});

test('without a saved letter the Letter tab offers to add one', async ({ panel }) => {
  await seed(panel);
  await panel.getByRole('tab', { name: 'Job' }).click();
  await expect(panel.getByTestId('letter-add-own')).toBeVisible();
  await expect(panel.getByTestId('letter-write')).toHaveText(/Write cover letter/);
});
