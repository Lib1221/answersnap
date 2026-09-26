import { expect, mockLog, saveJob, seed, test } from './fixtures';

for (const fillGaps of [true, false]) {
  test(`resume tailoring rewrites real bullets (answer confidently: ${fillGaps})`, async ({
    context,
    panel,
  }) => {
    await seed(panel, { fillGaps });
    await saveJob(panel, context);
    await panel.getByRole('tab', { name: 'Job' }).click();
    await panel.getByRole('button', { name: 'Resume' }).click();
    await panel.getByTestId('resume-run').click();

    await expect(panel.getByTestId('resume-summary')).toHaveText(
      'Backend engineer with 5 years of Python building payments APIs.',
    );
    const bullets = panel.getByTestId('resume-bullets').locator('li');
    await expect(bullets.first()).toContainText('Cut billing report latency');
    await expect(bullets.first()).toContainText('Was: Moved report generation to Celery workers.');
    await expect(panel.getByTestId('resume-skills').locator('li')).toHaveText([
      'Python',
      'Django',
      'PostgreSQL',
    ]);
    if (fillGaps) {
      await expect(bullets).toHaveCount(3);
      await expect(bullets.last()).toContainText('Assumed');
      await expect(bullets.last()).toContainText('New bullet for a gap');
    } else {
      await expect(bullets).toHaveCount(2);
    }
    const body = JSON.stringify(
      (await mockLog()).find((b) => JSON.stringify(b).includes("You tailor a candidate's resume")),
    );
    expect(body).toContain(fillGaps ? 'add at most 2 new bullets' : 'Do not add new bullets');
  });
}
