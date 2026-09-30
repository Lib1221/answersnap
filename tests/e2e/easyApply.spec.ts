import { expect, FIXTURES, mockLog, seed, test } from './fixtures';

// The Easy Apply co-pilot: the form in the open window only, screening questions answered from
// the candidate's own data or left to them, and never Next or Submit.

const master = {
  id: 'r-master',
  name: 'Master',
  master: true,
  personal: { fullName: 'Jamie Park' },
  sections: [
    {
      id: 's-exp',
      type: 'experience',
      entries: [
        {
          id: 'e1',
          title: 'Senior Backend Engineer',
          subtitle: 'Ledgerly',
          start: '2022-03',
          present: true,
          description: '- Built payment services in Go.',
        },
        {
          id: 'e2',
          title: 'Backend Engineer',
          subtitle: 'Brightpath',
          start: '2016-01',
          end: '2019-12',
          description: '- Wrote ETL pipelines in Python and pandas.',
        },
      ],
    },
  ],
};

test('Easy Apply: the open window only, screening answered from the resume, never Next', async ({
  context,
  panel,
}) => {
  await seed(panel);
  await panel.evaluate((r) => chrome.storage.local.set({ resumes: [r] }), master);
  const page = await context.newPage();
  await page.goto(`${FIXTURES}/easy-apply.html`);
  await page.bringToFront();

  await panel.getByRole('tab', { name: 'Form' }).click();
  await panel.getByRole('button', { name: 'Scan this form' }).click();
  await expect(panel.getByTestId('form-dialog')).toContainText(
    'This step: Additional Questions (50%)',
  );
  const fields = panel.getByTestId('form-fields');
  await expect(fields).toContainText('Why do you want to join Northwind?');
  // The job search box behind the window isn't part of the form.
  await expect(fields).not.toContainText('Search jobs');

  await panel.getByRole('button', { name: /Draft \d+ answers/ }).click();
  const items = panel.getByTestId('form-item');
  const years = items.filter({ hasText: 'years of work experience' });
  // 2016-01 to 2019-12 in Python; the Go job doesn't count.
  await expect(years.getByRole('textbox')).toHaveValue('4');
  await expect(years).toContainText('From your resume');
  await expect(years).toContainText('Backend Engineer, Brightpath');
  await expect(years).toContainText('The form says: Enter a whole number between 0 and 99');
  await expect(items.filter({ hasText: 'Terraform' })).toContainText(
    "Your resume and profile don't mention Terraform",
  );
  await expect(
    items.filter({ hasText: 'authorized to work' }).getByRole('checkbox'),
  ).toBeDisabled();
  const gender = items.filter({ hasText: 'Gender' });
  await expect(gender).toContainText('You answer this one on the page.');
  await expect(gender.getByRole('combobox')).toHaveCount(0);
  await expect(items.filter({ hasText: 'Location (city)' })).toContainText(
    'pick the matching suggestion',
  );

  // Only the other questions went to the model.
  const sent = JSON.stringify(await mockLog());
  expect(sent).toContain('Why do you want to join Northwind?');
  expect(sent).not.toContain('Gender');
  expect(sent).not.toContain('authorized to work');
  expect(sent).not.toContain('years of work experience');

  await panel.getByTestId('insert-selected').click();
  await expect(panel.getByTestId('form-summary')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('#years-python')).toHaveValue('4');
  await expect(page.locator('#gender')).toHaveValue('Select an option');
  await expect(page.locator('#auth-yes')).not.toBeChecked();
  await expect(page.locator('#auth-no')).not.toBeChecked();
  await expect(page.locator('#search')).toHaveValue('');
  await expect(page.locator('#follow-company-checkbox')).toBeChecked();
  const flags = await page.evaluate(() => {
    const w = window as unknown as { nextClicked?: boolean; submitted?: boolean };
    return { next: w.nextClicked, submitted: w.submitted };
  });
  expect(flags).toEqual({ next: undefined, submitted: undefined });
});
