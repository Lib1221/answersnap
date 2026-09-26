import { readFileSync } from 'node:fs';
import { expect, saveJob, seed, test } from './fixtures';

test('saving a job post tracks the application; status moves from the Job tab and Settings', async ({
  context,
  extensionId,
  panel,
}) => {
  await seed(panel);
  await saveJob(panel, context);
  await panel.getByRole('tab', { name: 'Job' }).click();
  await expect(panel.getByTestId('application-status')).toHaveValue('saved');
  await panel.getByTestId('application-status').selectOption('applied');

  const options = await context.newPage();
  await options.goto(`chrome-extension://${extensionId}/options.html#applications`);
  const list = options.getByTestId('application-list');
  await expect(list.locator('li')).toHaveCount(1);
  await expect(list).toContainText('127.0.0.1');
  await expect(list.locator('li').first()).toContainText('Applied');
  await expect(options.getByTestId('application-counts')).toContainText('1Applied');

  await list.getByPlaceholder(/Notes/).fill('Recruiter: Dana');
  await list.getByPlaceholder(/Notes/).blur();
  const download = options.waitForEvent('download');
  await options.getByTestId('application-export').click();
  const csv = readFileSync(await (await download).path(), 'utf8');
  expect(csv).toContain('Applied');
  expect(csv).toContain('Recruiter: Dana');

  // Closed applications drop out of the default view.
  await list.getByRole('combobox').selectOption('rejected');
  await expect(list.locator('li')).toHaveCount(0);
  await options.getByTestId('application-filter').selectOption('all');
  await expect(list.locator('li')).toHaveCount(1);

  // The panel follows the change.
  await panel.bringToFront();
  await expect(panel.getByTestId('application-status')).toHaveValue('rejected');
});
