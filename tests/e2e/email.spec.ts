import { expect, mockLog, seed, test } from './fixtures';

test('Job > Email writes a thank-you email with a subject line', async ({ panel }) => {
  await seed(panel);
  await panel.getByRole('tab', { name: 'Job' }).click();
  await panel.getByRole('button', { name: 'Email', exact: true }).click();
  await expect(panel.getByTestId('email-kind')).toHaveValue('thank-you');
  await panel.getByTestId('email-to').fill('Dana Reyes');
  await panel.getByTestId('email-notes').fill('we talked about payouts');
  await panel.getByTestId('email-write').click();

  await expect(panel.getByTestId('answer')).toHaveValue(/^Subject: Thank you for today/);
  await expect(panel.getByTestId('email-open')).toBeVisible();
  const body = JSON.stringify(
    (await mockLog()).find((b) => JSON.stringify(b).includes('Write a thank-you email')),
  );
  expect(body).toContain('Address it to Dana Reyes.');
  expect(body).toContain('we talked about payouts');
  expect(body).toContain('an email of 80 to 150 words');

  // Other kinds change the placeholder hint.
  await panel.getByTestId('email-kind').selectOption('accept');
  await expect(panel.getByTestId('email-notes')).toHaveAttribute('placeholder', /Start date/);
});
