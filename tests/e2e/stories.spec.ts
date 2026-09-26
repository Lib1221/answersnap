import { expect, mockLog, seed, test } from './fixtures';

test('write a story, keep a suggested one, and answers get them as sources', async ({
  context,
  extensionId,
  panel,
}) => {
  await seed(panel);
  const options = await context.newPage();
  await options.goto(`chrome-extension://${extensionId}/options.html#stories`);

  await options.getByTestId('story-add').click();
  await expect(options.getByTestId('story-save')).toBeDisabled();
  await options.getByTestId('story-title').fill('Led the payouts migration');
  await options.getByTestId('story-action').fill('I planned the cutover in three stages.');
  await options.getByTestId('story-result').fill('Zero downtime, 40k merchants moved.');
  await options.getByTestId('story-skills').fill('Planning, PostgreSQL');
  await options.getByTestId('story-save').click();
  const list = options.getByTestId('story-list').locator(':scope > li');
  await expect(list).toHaveCount(1);
  await expect(list.first()).toContainText('Zero downtime, 40k merchants moved.');
  await expect(list.first()).toContainText('PostgreSQL');

  // Edit keeps the same story.
  await list.first().getByRole('button', { name: 'Edit' }).click();
  await expect(options.getByTestId('story-action')).toHaveValue(
    'I planned the cutover in three stages.',
  );
  await options.getByTestId('story-result').fill('Zero downtime, 45k merchants moved.');
  await options.getByTestId('story-save').click();
  await expect(list).toHaveCount(1);
  await expect(list.first()).toContainText('45k merchants');

  // Suggestions skip incomplete drafts; kept ones join the list.
  await options.getByTestId('story-suggest').click();
  const suggested = options.getByTestId('story-suggestions').locator('article');
  await expect(suggested).toHaveCount(1);
  await suggested.first().getByRole('button', { name: 'Keep' }).click();
  await expect(list).toHaveCount(2);
  await expect(options.getByTestId('story-suggestions')).toHaveCount(0);

  await options.goto(`chrome-extension://${extensionId}/options.html#sources`);
  await expect(options.getByTestId('source-list')).toContainText('Story: Faster invoice reports');

  // Interview prep and answers send them with the candidate data.
  const body = (await mockLog()).find((b) =>
    JSON.stringify(b).includes('You help a candidate build a bank of STAR stories'),
  );
  expect(body).toBeTruthy();
});
