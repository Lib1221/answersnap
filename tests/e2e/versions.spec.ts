import { expect, FIXTURES, mockLog, seed, snipLabel, test } from './fixtures';

type Body = { stream?: boolean; messages: { content: { text?: string }[] }[] };

test('every refinement is a version you can step back to, and refine from', async ({
  context,
  panel,
}) => {
  await seed(panel);
  const page = await context.newPage();
  await page.goto(`${FIXTURES}/job.html`);
  await snipLabel(panel, page, '#why-label');
  await expect(panel.getByTestId('refine')).toBeVisible();
  const first = await panel.getByTestId('answer').inputValue();
  await expect(panel.getByTestId('versions')).toHaveCount(0);

  await panel.getByRole('button', { name: 'Another angle' }).click();
  await expect(panel.getByTestId('answer')).toHaveValue(/^ANOTHER ANGLE/);
  await expect(panel.getByTestId('version-label')).toHaveText('Version 2 of 2: Another angle');
  await expect(panel.getByRole('button', { name: 'Next version' })).toBeDisabled();

  await panel.getByRole('button', { name: 'Previous version' }).click();
  await expect(panel.getByTestId('answer')).toHaveValue(first);
  await expect(panel.getByTestId('version-label')).toHaveText('Version 1 of 2: First draft');

  // Refining now builds on version 1, not on the other angle.
  await panel.getByRole('button', { name: 'Shorter' }).click();
  await expect(panel.getByTestId('version-label')).toHaveText('Version 3 of 3: Shorter');
  const answers = ((await mockLog()) as Body[]).filter((b) => b.stream);
  const last = answers.at(-1)!;
  expect(last.messages).toHaveLength(3);
  expect(last.messages[1]!.content[0]!.text).not.toContain('ANOTHER ANGLE');
  expect(last.messages[2]!.content[0]!.text).toContain('about 40% shorter');
});
