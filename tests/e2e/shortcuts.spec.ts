import { expect, FIXTURES, mockLog, seed, snipLabel, test } from './fixtures';

test('panel shortcuts: tabs, regenerate, versions, and the help sheet', async ({
  context,
  panel,
}) => {
  await seed(panel);
  const page = await context.newPage();
  await page.goto(`${FIXTURES}/job.html`);
  await snipLabel(panel, page, '#why-label');
  await expect(panel.getByTestId('refine')).toBeVisible();
  const first = await panel.getByTestId('answer').inputValue();

  await panel.bringToFront();
  await panel.locator('body').click({ position: { x: 5, y: 5 } });
  await panel.keyboard.press('Alt+2');
  await expect(panel.getByRole('tab', { name: 'Job' })).toHaveAttribute('aria-selected', 'true');
  await panel.keyboard.press('Alt+1');
  await expect(panel.getByRole('tab', { name: 'Answer' })).toHaveAttribute('aria-selected', 'true');

  await panel.getByRole('button', { name: 'Another angle' }).click();
  await expect(panel.getByTestId('version-label')).toHaveText('Version 2 of 2: Another angle');
  await panel.keyboard.press('Alt+ArrowLeft');
  await expect(panel.getByTestId('answer')).toHaveValue(first);
  await panel.keyboard.press('Alt+ArrowRight');
  await expect(panel.getByTestId('answer')).toHaveValue(/^ANOTHER ANGLE/);

  const before = (await mockLog()).length;
  await panel.keyboard.press('Alt+R');
  await expect(panel.getByTestId('versions')).toHaveCount(0);
  await expect(panel.getByTestId('refine')).toBeVisible();
  expect((await mockLog()).length).toBeGreaterThan(before);

  await panel.locator('body').click({ position: { x: 5, y: 5 } });
  await panel.keyboard.press('?');
  await expect(panel.getByTestId('shortcuts')).toBeVisible();
  await panel.keyboard.press('Escape');
  await expect(panel.getByTestId('shortcuts')).toHaveCount(0);
});

test('Regenerate keeps a cover letter a cover letter', async ({ panel }) => {
  await seed(panel);
  await panel.getByRole('tab', { name: 'Job' }).click();
  await panel.getByTestId('letter-write').click();
  await expect(panel.getByTestId('answer')).toHaveValue(/^Dear Hiring Manager,/);
  await panel.getByRole('button', { name: 'Regenerate' }).click();
  await expect(panel.getByTestId('answer')).toHaveValue(/^Dear Hiring Manager,/);
  const letters = (await mockLog()).filter((b) =>
    JSON.stringify(b).includes('Write a cover letter'),
  ) as { max_tokens: number }[];
  expect(letters).toHaveLength(2);
  expect(JSON.stringify(letters[1])).toContain('a cover letter of about 300 words');
  expect(letters[1]!.max_tokens).toBeGreaterThanOrEqual(2048);
});
