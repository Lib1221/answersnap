import type { Page } from '@playwright/test';
import { drag, expect, FIXTURES, mockLog, seed, snipLabel, test } from './fixtures';

type Body = {
  system: unknown;
  messages: { role: string; content: { type: string; text?: string }[] }[];
  max_tokens?: number;
  stream?: boolean;
};

async function answered(panel: Page) {
  await expect(panel.getByTestId('refine')).toBeVisible();
}

test('refinements keep the system blocks byte-identical and build on hand edits', async ({
  context,
  panel,
}) => {
  await seed(panel);
  const page = await context.newPage();
  await page.goto(`${FIXTURES}/job.html`);
  await snipLabel(panel, page, '#why-label');
  await answered(panel);

  await panel.getByTestId('answer').fill('I like payments work. Edited by me.');
  await panel.getByRole('button', { name: 'Shorter' }).click();
  await answered(panel);
  await panel.getByTestId('change-request').fill('mention Celery');
  await panel.getByRole('button', { name: 'Send' }).click();
  await answered(panel);

  const log = (await mockLog()) as Body[];
  const answers = log.filter((b) => b.stream);
  expect(answers).toHaveLength(3);
  expect(JSON.stringify(answers[1]!.system)).toBe(JSON.stringify(answers[0]!.system));
  expect(JSON.stringify(answers[2]!.system)).toBe(JSON.stringify(answers[0]!.system));
  expect(answers[1]!.messages.map((m) => m.role)).toEqual(['user', 'assistant', 'user']);
  expect(answers[1]!.messages[1]!.content[0]!.text).toContain(
    '<answer>I like payments work. Edited by me.</answer>',
  );
  expect(answers[1]!.messages[2]!.content[0]!.text).toBe(
    'Rewrite the answer about 40% shorter. Keep the strongest specific facts. Same tags.',
  );
  expect(answers[2]!.messages).toHaveLength(5);
  expect(answers[2]!.messages[4]!.content[0]!.text).toContain(
    'Change request from the candidate: mention Celery.',
  );
  // The first turn (with the screenshot) is resent unchanged.
  expect(JSON.stringify(answers[2]!.messages[0])).toBe(JSON.stringify(answers[0]!.messages[0]));
});

test('over the limit: Fit limit and Cut at last sentence', async ({ context, panel }) => {
  await seed(panel);
  const page = await context.newPage();
  await page.goto(`${FIXTURES}/job.html`);
  await snipLabel(panel, page, '#why-label');
  await answered(panel);
  await panel.getByTestId('answer').fill('I build payment systems. '.repeat(50));
  await expect(panel.getByTestId('counter')).toHaveClass(/notice/);
  await expect(panel.getByRole('button', { name: 'Fit limit' })).toBeVisible();
  await panel.getByRole('button', { name: 'Cut at last sentence' }).click();
  const cut = await panel.getByTestId('answer').inputValue();
  expect(cut.length).toBeLessThanOrEqual(1000);
  expect(cut.endsWith('.')).toBe(true);
  await expect(panel.getByRole('button', { name: 'Fit limit' })).toHaveCount(0);
});

test('job context from the whole page leaves hidden text out and reaches the prompt', async ({
  context,
  panel,
}) => {
  await seed(panel);
  const page = await context.newPage();
  await page.goto(`${FIXTURES}/job.html`);
  await page.bringToFront();
  await panel.getByRole('button', { name: 'Set job' }).click();
  await panel.getByRole('button', { name: 'Read whole page' }).click();
  await expect(panel.getByTestId('job-chip')).toHaveText('Job: Senior Backend Engineer');

  await snipLabel(panel, page, '#why-label');
  await answered(panel);
  const body = ((await mockLog()) as Body[]).find((b) => b.stream)!;
  const userText = body.messages[0]!.content.find((c) => c.type === 'text')!.text!;
  expect(userText).toContain('<job_context>');
  expect(userText).toContain('Stack: Python, Django, PostgreSQL, Kafka.');
  expect(userText).not.toContain('pineapples');

  await panel.getByRole('button', { name: 'Clear job' }).click();
  await expect(panel.getByTestId('job-chip')).toHaveCount(0);
});

test('job context from a selection and from a snip; the question card stays', async ({
  context,
  panel,
}) => {
  await seed(panel);
  const page = await context.newPage();
  await page.goto(`${FIXTURES}/job.html`);
  await snipLabel(panel, page, '#why-label');
  await answered(panel);
  const question = await panel.getByTestId('page-text').innerText();

  await page.evaluate(() => {
    const range = document.createRange();
    range.selectNodeContents(document.getElementById('post')!);
    getSelection()!.removeAllRanges();
    getSelection()!.addRange(range);
  });
  await page.bringToFront();
  await panel.getByRole('button', { name: 'Set job' }).click();
  await panel.getByRole('button', { name: 'Use selected text' }).click();
  await expect(panel.getByTestId('job-chip')).toBeVisible();
  await panel.getByRole('button', { name: 'Clear job' }).click();

  await panel.getByRole('button', { name: 'Set job' }).click();
  await panel.getByRole('button', { name: 'Snip job post' }).click();
  await page.locator('answersnap-overlay').waitFor({ state: 'attached' });
  const post = (await page.locator('#post').boundingBox())!;
  await drag(
    page,
    { x: post.x - 2, y: post.y - 2 },
    { x: post.x + post.width, y: post.y + post.height },
  );
  await expect(panel.getByTestId('job-chip')).toBeVisible();
  await expect(panel.getByTestId('page-text')).toHaveText(question);
  const stored = await panel.evaluate(
    async () =>
      Object.entries(await chrome.storage.session.get(null)).find(([k]) =>
        k.startsWith('jobContext:'),
      )?.[1],
  );
  expect(JSON.stringify(stored)).toContain('reconciliation and payouts');
  expect(JSON.stringify(stored)).not.toContain('pineapples');
});

test('a missing-info chip opens the matching standard answer', async ({ context, panel }) => {
  await seed(panel);
  const page = await context.newPage();
  await page.goto(`${FIXTURES}/job.html`);
  await snipLabel(panel, page, '#rate-label');
  const chip = panel.getByRole('button', { name: 'expected hourly rate in USD' });
  await expect(chip).toBeVisible();
  const opened = context.waitForEvent('page');
  await chip.click();
  const options = await opened;
  await expect(options).toHaveURL(/#standard-answers\?field=expectedHourlyRate/);
  await expect(options.getByTestId('sa-expectedHourlyRate')).toBeFocused();
});

test('opening the panel pre-warms the cache once', async ({ panel }) => {
  await seed(panel, { prewarm: true });
  await expect
    .poll(async () => ((await mockLog()) as Body[]).filter((b) => b.max_tokens === 0).length)
    .toBe(1);
  const warm = ((await mockLog()) as Body[]).find((b) => b.max_tokens === 0)!;
  expect(warm).not.toHaveProperty('stream');
  expect(warm.messages[0]!.content[0]!.text).toBe('warmup');
  await panel.reload();
  await panel.waitForTimeout(500);
  expect(((await mockLog()) as Body[]).filter((b) => b.max_tokens === 0)).toHaveLength(1);
});
