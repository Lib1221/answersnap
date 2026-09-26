import { expect, FIXTURES, mockLog, seed, snipLabel, test } from './fixtures';

test('later pages of an application see the answers given earlier on the site', async ({
  context,
  panel,
}) => {
  await seed(panel);
  const page = await context.newPage();
  await page.goto(`${FIXTURES}/plain-form.html`);
  await snipLabel(panel, page, 'label[for="years"]');
  await expect(panel.getByTestId('answer')).toHaveValue('5');
  await panel.getByTestId('answer').focus();
  await panel.keyboard.press('Control+Enter');
  await expect(page.locator('#years')).toHaveValue('5');

  await snipLabel(panel, page, 'label[for="why-text"]');
  await expect(panel.getByTestId('refine')).toBeVisible();
  const second = JSON.stringify(
    (await mockLog()).filter((b) => (b as { stream?: boolean }).stream).at(-1),
  );
  expect(second).toContain('<earlier_answers>');
  expect(second).toMatch(/<example question=\\"[^"]*Python[^"]*\\">5<\/example>/);
});
