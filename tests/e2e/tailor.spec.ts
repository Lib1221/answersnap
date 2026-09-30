import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { BrowserContext, Page } from '@playwright/test';
import { expect, mockLog, seed, test } from './fixtures';

// One-click tailoring: a job post arrives (as LinkedIn's button or the side panel sends it), the
// builder opens, tailors the master resume within two pages, and writes the cover letter.

const profile = JSON.parse(
  readFileSync(join(import.meta.dirname, '../fixtures/profile.json'), 'utf8'),
);

const JOB = {
  url: 'https://www.linkedin.com/jobs/view/4012345678/',
  hostname: 'www.linkedin.com',
  title: 'Senior Backend Engineer',
  company: 'Northwind',
  location: 'Remote (EU)',
  workplace: 'Remote',
  text: [
    'About the job',
    'Northwind is hiring a Senior Backend Engineer to build payment APIs.',
    'Requirements: 5+ years with Python and Django, PostgreSQL, Kubernetes. AWS is a plus.',
    'Remote within the EU.',
  ].join('\n'),
};

async function seedProfile(panel: Page) {
  await panel.evaluate(
    (p) =>
      chrome.storage.local.set({
        profile: {
          profile: p,
          builtAt: '2026-09-01T00:00:00Z',
          editedAt: null,
          sourceIds: [],
          previous: null,
        },
      }),
    profile,
  );
}

async function openBuilder(context: BrowserContext, extensionId: string) {
  const page = await context.newPage();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`chrome-extension://${extensionId}/resume.html`);
  return page;
}

/** Send the job the way the LinkedIn button does, and return the builder tab it opens. */
async function tailor(context: BrowserContext, from: Page, job = JOB): Promise<Page> {
  const opened = context.waitForEvent('page');
  const reply = await from.evaluate(
    (j) => chrome.runtime.sendMessage({ type: 'TAILOR_JOB', job: j }),
    job,
  );
  expect(reply).toEqual({ ok: true });
  const page = await opened;
  await page.setViewportSize({ width: 1440, height: 1000 });
  return page;
}

const docText = (page: Page) =>
  page
    .locator('.preview-pages > [data-testid="resume-page"]')
    .allInnerTexts()
    .then((t) => t.join('\n'));

test('one click: a tailored two-page resume, a cover letter, and the master untouched', async ({
  context,
  extensionId,
  panel,
}) => {
  test.setTimeout(90_000);
  await seed(panel);
  await seedProfile(panel);
  const builder = await openBuilder(context, extensionId);
  await builder.getByTestId('resume-start-profile').click();
  await expect(builder.getByTestId('make-master')).toBeVisible();
  await builder.getByTestId('make-master').click();
  await expect(builder.getByTestId('master-badge')).toBeVisible();
  const masterText = await docText(builder);

  const page = await tailor(context, builder);
  await expect(page).toHaveURL(/resume\.html\?(tailor|id)=/);
  await expect(page.getByTestId('job-match')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('tailored-badge')).toBeVisible();
  await expect(page.getByTestId('match-job')).toContainText('Senior Backend Engineer');
  await expect(page.getByTestId('match-job')).toContainText('Northwind');

  // The resume itself: headline, summary, and the job's words.
  await expect.poll(() => docText(page)).toContain('Senior Backend Engineer | Python, Django');
  await expect
    .poll(() => docText(page))
    .toContain('Deployed containerized services with Kubernetes.');
  expect(
    Number(
      await page
        .getByTestId('page-count')
        .innerText()
        .then((t) => t.match(/\d+/)![0]),
    ),
  ).toBeLessThanOrEqual(2);

  // Keyword match went up, eligibility is flagged, the invented line is up for review.
  const before = Number((await page.getByTestId('match-before').innerText()).replace('%', ''));
  const now = Number((await page.getByTestId('match-now').innerText()).replace('%', ''));
  expect(now).toBeGreaterThan(before);
  await expect(page.getByTestId('eligibility-item')).toContainText('EU');
  const item = page
    .getByTestId('assumed-item')
    .filter({ hasText: 'Deployed containerized services with Kubernetes.' });
  await expect(item).toBeVisible();

  // Removing it takes it off the resume.
  await item.getByTestId('assumed-remove').click();
  await expect.poll(() => docText(page)).not.toContain('Deployed containerized services');

  // What changed: every difference from the master, word by word, each with an undo.
  const headline = page.getByTestId('change-item').filter({ hasText: 'Title line' });
  await expect(headline.getByTestId('change-diff').locator('ins')).not.toHaveCount(0);
  await headline.getByTestId('change-undo').click();
  await expect.poll(() => docText(page)).not.toContain('Senior Backend Engineer | Python, Django');
  await expect(page.getByTestId('change-item').filter({ hasText: 'Title line' })).toHaveCount(0);

  // Cover letter: written, shown in the same design, and editable.
  await expect(page.getByTestId('letter-text')).toHaveValue(/Dear Hiring Manager/, {
    timeout: 20_000,
  });
  await page.getByTestId('show-letter').click();
  await expect(page.getByTestId('letter-page')).toContainText('Dear Hiring Manager');
  await expect(page.getByTestId('letter-page')).toContainText('Hiring team, Northwind');
  await page.getByTestId('letter-text').fill('Dear Northwind team,\n\nA custom opening.');
  await expect(page.getByTestId('letter-page')).toContainText('A custom opening.');

  // Saved: a reload opens the tailored copy, not a second tailoring.
  await expect(page.getByTestId('save-state')).toHaveText('Saved');
  await page.reload();
  await expect(page.getByTestId('job-match')).toBeVisible();
  await expect(page.getByTestId('tailor-progress')).toHaveCount(0);

  // The master resume didn't change, and the application is tracked.
  await builder.bringToFront();
  await builder.reload();
  await expect.poll(() => docText(builder)).toBe(masterText);
  const apps = await panel.evaluate(
    async () => (await chrome.storage.local.get('applications')).applications,
  );
  expect(apps).toEqual(expect.arrayContaining([expect.objectContaining({ company: 'Northwind' })]));
});

test('with no master yet, the builder asks which resume to start from', async ({
  context,
  extensionId,
  panel,
}) => {
  test.setTimeout(60_000);
  await seed(panel);
  await seedProfile(panel);
  const builder = await openBuilder(context, extensionId);
  await builder.getByTestId('resume-start-profile').click();
  await builder.getByTestId('resume-blank').click();
  await expect(builder.getByTestId('resume-pick').locator('option')).toHaveCount(2);

  const page = await tailor(context, builder);
  await expect(page.getByTestId('tailor-progress')).toContainText('Which resume is your master?');
  await page.getByTestId('choose-master').filter({ hasText: 'Jamie Park' }).click();
  await expect(page.getByTestId('job-match')).toBeVisible({ timeout: 20_000 });
  await page.getByTestId('tab-content').click();
  // The chosen resume is now the master for next time.
  const resumes = await panel.evaluate(
    async () => (await chrome.storage.local.get('resumes')).resumes,
  );
  expect(resumes.filter((r: { master: boolean }) => r.master)).toHaveLength(1);
});

test('refuses job posts from other sites and ones too short to use', async ({
  context,
  extensionId,
  panel,
}) => {
  await seed(panel);
  const builder = await openBuilder(context, extensionId);
  const short = await builder.evaluate(() =>
    chrome.runtime.sendMessage({ type: 'TAILOR_JOB', job: { hostname: 'x.com', text: 'hi' } }),
  );
  expect(short).toEqual({ ok: false, error: 'NO_JOB' });
  expect(context.pages().filter((p) => p.url().includes('tailor='))).toHaveLength(0);
});

test('dealbreakers: set in Settings, asked before any AI call, then skip or tailor anyway', async ({
  context,
  extensionId,
  panel,
}) => {
  test.setTimeout(90_000);
  await seed(panel);
  await seedProfile(panel);

  // Settings: the job title says Senior, which this candidate skips.
  const options = await context.newPage();
  await options.goto(`chrome-extension://${extensionId}/options.html#applications`);
  await options.getByTestId('db-titles').fill('Senior, Intern');
  await options.getByTestId('db-titles').press('Tab');
  await expect(options.getByTestId('dealbreakers')).toContainText('Saved');
  const stored = await panel.evaluate(
    async () => (await chrome.storage.local.get('settings')).settings.dealbreakers.titleWords,
  );
  expect(stored).toEqual(['Senior', 'Intern']);

  const builder = await openBuilder(context, extensionId);
  await builder.getByTestId('resume-start-profile').click();
  await builder.getByTestId('make-master').click();
  await expect(builder.getByTestId('master-badge')).toBeVisible();

  // Skip: the tab closes, and nothing went to the AI.
  const tailorCalls = async () =>
    (await mockLog()).filter((b) => JSON.stringify(b).includes('ATS specialist')).length;
  const skipped = await tailor(context, builder);
  await expect(skipped.getByTestId('dealbreaker-item')).toHaveText('The title says "Senior".');
  const closed = skipped.waitForEvent('close');
  await skipped.getByTestId('skip-job').click();
  await closed;
  expect(await tailorCalls()).toBe(0);

  // Tailor anyway: it goes on, and Job match still shows the dealbreaker.
  const page = await tailor(context, builder);
  await page.getByTestId('tailor-anyway').click();
  await expect(page.getByTestId('job-match')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('dealbreaker-item')).toContainText(
    'Your dealbreaker: The title says "Senior".',
  );
  expect(await tailorCalls()).toBe(1);
});
