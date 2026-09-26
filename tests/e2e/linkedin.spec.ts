import { expect, mockLog, seed, test } from './fixtures';

test('the Profile tab writes LinkedIn headlines and an About section', async ({ panel }) => {
  await seed(panel);
  await panel.getByRole('tab', { name: 'Profile' }).click();
  await panel.getByTestId('linkedin-role').fill('Senior Backend Engineer');
  await panel.getByTestId('linkedin-run').click();
  await expect(panel.getByTestId('linkedin-headlines').locator('li')).toHaveCount(2);
  await expect(panel.getByTestId('linkedin-about')).toContainText('900 ms to 240 ms');
  const body = JSON.stringify(
    (await mockLog()).find((b) => JSON.stringify(b).includes('LinkedIn headline and About')),
  );
  expect(body).toContain('<target_role>Senior Backend Engineer</target_role>');
});
