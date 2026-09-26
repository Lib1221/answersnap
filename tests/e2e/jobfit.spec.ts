import { expect, mockLog, saveJob, seed, test } from './fixtures';

test('the fit check scores the profile against the saved job post', async ({ context, panel }) => {
  await seed(panel);
  await panel.getByRole('tab', { name: 'Job' }).click();
  await panel.getByRole('button', { name: 'Fit' }).click();
  await expect(panel.getByTestId('fit-needs-job')).toBeVisible();

  await saveJob(panel, context);
  await panel.getByTestId('fit-run').click();
  await expect(panel.getByTestId('fit-score')).toHaveText('72/100');
  await expect(panel.getByTestId('fit-verdict')).toHaveText('Good fit');
  await expect(panel.getByTestId('fit-summary')).toContainText('Kubernetes is the main gap');
  // Must-haves first; duplicate keywords dropped.
  const reqs = panel.getByTestId('fit-requirements').locator('li');
  await expect(reqs).toHaveCount(3);
  await expect(reqs.last()).toContainText('Kubernetes in production');
  await expect(reqs.last()).toContainText('Lead with your Docker');
  await expect(panel.getByTestId('fit-keywords').locator('li')).toHaveText([
    'Django',
    'PostgreSQL',
    'reconciliation',
  ]);

  const body = (await mockLog()).find((b) =>
    JSON.stringify(b).includes('You compare a candidate with a job post'),
  )!;
  expect(JSON.stringify(body)).toContain('reconciliation and payouts');
  await expect(panel.getByTestId('fit-run')).toHaveText(/Check again/);

  // Switching sub-sections keeps the result.
  await panel.getByRole('button', { name: 'Letter' }).click();
  await expect(panel.getByTestId('letter-job')).toBeVisible();
  await panel.getByRole('button', { name: 'Fit' }).click();
  await expect(panel.getByTestId('fit-score')).toHaveText('72/100');
});
