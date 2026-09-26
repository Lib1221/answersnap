import type { Page } from '@playwright/test';
import { expect, saveJob, seed, test } from './fixtures';

/** Pretend the tracked application was marked applied 9 days ago. */
async function backdateApplied(panel: Page) {
  await panel.evaluate(async () => {
    const { applications } = (await chrome.storage.local.get('applications')) as {
      applications: {
        status: string;
        history: { status: string; at: string }[];
        updatedAt: string;
      }[];
    };
    const at = new Date(Date.now() - 9 * 24 * 60 * 60 * 1000).toISOString();
    for (const a of applications) {
      a.status = 'applied';
      a.history = [
        { status: 'saved', at },
        { status: 'applied', at },
      ];
      a.updatedAt = at;
    }
    await chrome.storage.local.set({ applications });
  });
}

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
