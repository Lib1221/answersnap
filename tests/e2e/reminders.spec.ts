import { backdateApplied, expect, saveJob, seed, test } from './fixtures';

test('a quiet application triggers one follow-up notification', async ({ context, panel }) => {
  await seed(panel);
  await saveJob(panel, context);
  await backdateApplied(panel);
  const [worker] = context.serviceWorkers();
  // Scheduled at start-up: every 6 hours.
  const alarm = await worker!.evaluate(() => chrome.alarms.get('follow-up-check'));
  expect(alarm?.periodInMinutes).toBe(360);

  // The real alarm, fired early (unpacked extensions may use short alarm delays).
  await worker!.evaluate(() => chrome.alarms.create('follow-up-check', { when: Date.now() + 100 }));
  await expect
    .poll(() => worker!.evaluate(() => chrome.notifications.getAll()), { timeout: 10_000 })
    .toHaveProperty('follow-up');

  // Same quiet spell: no second notification.
  await worker!.evaluate(() => chrome.notifications.clear('follow-up'));
  await worker!.evaluate(() => chrome.alarms.create('follow-up-check', { when: Date.now() + 100 }));
  await panel.waitForTimeout(1500);
  expect(await worker!.evaluate(() => chrome.notifications.getAll())).toEqual({});
});
