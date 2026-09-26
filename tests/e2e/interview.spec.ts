import { expect, mockLog, saveJob, seed, test } from './fixtures';

test('interview prep lists likely questions; answers copy and save to the Library', async ({
  context,
  panel,
}) => {
  await seed(panel);
  await panel.getByRole('tab', { name: 'Job' }).click();
  await panel.getByRole('button', { name: 'Interview' }).click();
  await expect(panel.getByTestId('interview-needs-job')).toBeVisible();

  await saveJob(panel, context);
  await panel.getByTestId('interview-run').click();
  const items = panel.getByTestId('interview-questions').locator('li');
  await expect(items).toHaveCount(2);
  await expect(items.first()).toContainText('Tell me about a time you made a slow system fast.');
  await expect(items.first()).toContainText('Behavioral');
  await expect(items.nth(1)).toContainText('Assumed');

  await items.first().getByRole('button', { name: 'Show suggested answer' }).click();
  await expect(items.first()).toContainText('p95 latency dropped from 900 ms to 240 ms');
  await expect(items.first()).toContainText('Lead with the result.');
  await items.first().getByRole('button', { name: 'Save to Library' }).click();
  await expect(items.first().getByRole('button', { name: 'Saved' })).toBeDisabled();

  const body = (await mockLog()).find((b) =>
    JSON.stringify(b).includes('You prepare a candidate for a job interview'),
  )!;
  // Confident mode is the default, and style rules come along.
  expect(JSON.stringify(body)).toContain('about a year of hands-on experience');
  expect(JSON.stringify(body)).toContain('No em dashes');

  await panel.getByRole('tab', { name: 'Library' }).click();
  await expect(panel.getByTestId('library')).toContainText(
    'Tell me about a time you made a slow system fast.',
  );
});
