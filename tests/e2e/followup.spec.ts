import { backdateApplied, expect, saveJob, seed, test } from './fixtures';

test('quiet applications get a follow-up nudge in the panel and on the Applications page', async ({
  context,
  extensionId,
  panel,
}) => {
  await seed(panel);
  await saveJob(panel, context);
  await backdateApplied(panel);
  await panel.bringToFront();
  await panel.getByRole('tab', { name: 'Job' }).click();
  await expect(panel.getByTestId('follow-up-nudge')).toContainText('No news in 9 days.');
  await panel.getByRole('button', { name: 'Write a follow-up' }).click();
  await expect(panel.getByTestId('email-kind')).toHaveValue('follow-up');

  const options = await context.newPage();
  await options.goto(`chrome-extension://${extensionId}/options.html#applications`);
  await expect(options.getByTestId('week-summary')).toContainText('Last 7 days');
  const due = options.getByTestId('follow-ups');
  await expect(due).toContainText('applied, no news in 9 days');
  await due.getByRole('button', { name: 'Mark followed up' }).click();
  await expect(due).toHaveCount(0);
  await expect(options.getByTestId('application-list').getByPlaceholder(/Notes/)).toHaveValue(
    /^Followed up on \d{4}-\d{2}-\d{2}\.$/,
  );

  await panel.bringToFront();
  await expect(panel.getByTestId('follow-up-nudge')).toHaveCount(0);
});
