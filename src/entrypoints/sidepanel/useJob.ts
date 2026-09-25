import { onUnmounted, ref, shallowRef } from 'vue';
import {
  buildJobContext,
  clearJobContext,
  getJobContext,
  jobLabel,
  setJobContext,
  watchJobContext,
  type JobContext,
} from '@/kb/jobContext';
import { transcribeImage } from '@/kb/profileBuilder';
import { describeError, LlmError } from '@/llm/errors';
import { createProvider } from '@/llm/provider';
import { sendToBackground, sendToTab } from '@/messaging/send';
import { getApiKey, getSettings } from '@/storage/items';
import type { PendingCapture } from '@/storage/schema';

const MIN_SNIP_TEXT = 200;

/** Job context for the site in front (spec 3.4). */
export function useJob() {
  const hostname = ref<string | null>(null);
  const job = shallowRef<JobContext | null>(null);
  const busy = ref('');
  const error = ref('');
  let unwatch: (() => void) | null = null;

  async function load() {
    job.value = hostname.value ? await getJobContext(hostname.value) : null;
  }

  async function setHost(host: string | null) {
    if (host === hostname.value) return;
    hostname.value = host;
    unwatch?.();
    unwatch = host ? watchJobContext(host, () => void load()) : null;
    await load();
  }
  onUnmounted(() => unwatch?.());

  async function summarizer() {
    const settings = await getSettings();
    const key = await getApiKey(settings.provider);
    return key
      ? {
          provider: createProvider(settings.provider, key, settings.baseUrl),
          model: settings.fastModel,
        }
      : undefined;
  }

  async function save(host: string, pageTitle: string, text: string, append: boolean) {
    const existing = append ? await getJobContext(host) : null;
    const ctx = await buildJobContext({
      hostname: host,
      pageTitle,
      text,
      existing,
      summarize: await summarizer(),
    });
    await setJobContext(ctx);
    await setHost(host);
    await load();
  }

  async function activeTabId(): Promise<number | undefined> {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    return tab?.id;
  }

  /** "Use selected text" and "Read whole page" read through the capture script. */
  async function readFromPage(scope: 'selection' | 'job') {
    error.value = '';
    const tabId = await activeTabId();
    if (tabId === undefined) return;
    busy.value = scope === 'selection' ? 'Reading the selection' : 'Reading the page';
    try {
      const ready = await sendToBackground<'ENSURE_CAPTURE'>({ type: 'ENSURE_CAPTURE', tabId });
      if (!ready.ok) {
        error.value =
          ready.error === 'RESTRICTED_PAGE'
            ? "Chrome doesn't let extensions read this page."
            : 'Press Alt+Shift+Q or click the AnswerSnap icon on the page first, then try again.';
        return;
      }
      const read = await sendToTab<'READ_PAGE_TEXT'>(tabId, { type: 'READ_PAGE_TEXT', scope });
      if (!read.text.trim()) {
        error.value =
          scope === 'selection'
            ? 'Select the job post text on the page first.'
            : 'No readable text on this page.';
        return;
      }
      await save(new URL(read.url).hostname, read.title, read.text, false);
    } catch (err) {
      error.value =
        err instanceof LlmError
          ? describeError(err)
          : "Couldn't read the page. Try snipping the job post instead.";
    } finally {
      busy.value = '';
    }
  }

  /** "Snip job post" and "Add more". */
  async function snip(append: boolean) {
    error.value = '';
    pendingAppend = append;
    const tabId = await activeTabId();
    if (tabId === undefined) return;
    const reply = await sendToBackground<'START_SNIP'>({ type: 'START_SNIP', tabId, mode: 'job' });
    if (!reply.ok) {
      error.value =
        reply.error === 'RESTRICTED_PAGE'
          ? "Chrome doesn't let extensions read this page."
          : 'Press Alt+Shift+Q or click the AnswerSnap icon on the page first, then try again.';
    }
  }

  let pendingAppend = false;

  /** A job-mode capture arrived: use its visible text, or read the image if the text is thin. */
  async function fromCapture(capture: PendingCapture) {
    busy.value = 'Reading the job post';
    try {
      let text = capture.pageText;
      if (text.length < MIN_SNIP_TEXT && capture.image) {
        const s = await summarizer();
        if (s) text = await transcribeImage(s.provider, s.model, capture.image.dataUrl);
      }
      await save(capture.page.hostname, capture.page.title, text, pendingAppend);
    } catch (err) {
      error.value = describeError(err);
    } finally {
      busy.value = '';
      pendingAppend = false;
    }
  }

  async function clear() {
    if (hostname.value) await clearJobContext(hostname.value);
    job.value = null;
  }

  return {
    hostname,
    job,
    busy,
    error,
    label: jobLabel,
    setHost,
    readFromPage,
    snip,
    fromCapture,
    clear,
  };
}
