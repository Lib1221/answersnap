import { createTailorButton } from '@/linkedin/button';
import { extractLinkedInJob, jobIdFromUrl, paneJobId } from '@/linkedin/extract';
import { t } from '@/ui/i18n';

// LinkedIn's "Tailor resume" button (approved by Liben, 2026-09-29): shown while a job is open,
// one click reads that job and asks the service worker to tailor the master resume for it. Reads
// the page only when clicked; no network, no storage, nothing written into LinkedIn's own markup.

export default defineContentScript({
  // The e2e fixture server stands in for LinkedIn in test builds only.
  matches:
    import.meta.env.MODE === 'e2e'
      ? ['https://www.linkedin.com/*', 'http://127.0.0.1/linkedin/*']
      : ['https://www.linkedin.com/*'],
  runAt: 'document_idle',
  // WXT would otherwise announce the script (with the extension's id) to the page on every
  // LinkedIn load. Newer copies still replace older ones through WXT's document event.
  noScriptStartedPostMessage: true,
  main(ctx) {
    let enabled = false;
    const button = createTailorButton(() => void tailor());
    ctx.onInvalidated(() => button.destroy());

    const update = () => button.show(enabled && jobIdFromUrl(location.href) !== null);

    // Settings can turn the button off; ask once, and again whenever the tab comes back.
    const ask = () =>
      browser.runtime
        .sendMessage({ type: 'LINKEDIN_BUTTON' })
        .then((reply: { show?: boolean } | undefined) => {
          enabled = !!reply?.show;
          update();
        })
        .catch(() => undefined);
    void ask();
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void ask();
    });

    // LinkedIn is a single-page app: the job changes without a page load.
    let last = location.href;
    ctx.setInterval(() => {
      if (location.href === last) return;
      last = location.href;
      update();
    }, 700);

    /**
     * LinkedIn changes the URL before the job pane: wait (up to 8 s) until the pane shows the job
     * in the URL, so a quick click never reads the previous job.
     */
    async function paneReady(): Promise<boolean> {
      for (let waited = 0; waited <= 8000; waited += 250) {
        const want = jobIdFromUrl(location.href);
        const shown = paneJobId(document);
        if (!want || !shown || shown === want) return true;
        await new Promise((r) => setTimeout(r, 250));
      }
      return false;
    }

    async function tailor() {
      button.setState('busy');
      if (!(await paneReady())) {
        button.setState(
          'error',
          t('li_tailor_loading', 'The job is still loading. Try again in a moment.'),
        );
        return;
      }
      const job = extractLinkedInJob(document, location.href);
      if (!job) {
        button.setState(
          'error',
          t(
            'li_tailor_no_job',
            "Couldn't read this job. Open it so its description shows, then try again.",
          ),
        );
        return;
      }
      try {
        const reply = (await browser.runtime.sendMessage({ type: 'TAILOR_JOB', job })) as
          { ok: boolean } | undefined;
        if (reply?.ok) button.setState('done', t('li_tailor_opened', 'Opened in a new tab.'));
        else
          button.setState(
            'error',
            t('li_tailor_failed', "Couldn't start. Reload the page and try again."),
          );
      } catch {
        // The extension was updated or reloaded: this old copy of the script can't reach it.
        button.setState(
          'error',
          t('li_tailor_failed', "Couldn't start. Reload the page and try again."),
        );
      }
    }
  },
});
