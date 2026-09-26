import { onMounted, onUnmounted, ref, shallowRef, watch } from 'vue';
import {
  findCoverLetter,
  LETTER_LENGTHS,
  LETTER_MAX_CHARS,
  LETTER_MAX_TOKENS,
  letterQuestion,
  type LetterLength,
} from '@/kb/coverLetter';
import { getJobContext } from '@/kb/jobContext';
import { getSources, sourcesItem } from '@/storage/items';
import type { PendingCapture } from '@/storage/schema';
import { useAnswer } from './useAnswer';
import { useInsert } from './useInsert';
import type { useJob } from './useJob';

/** Letter tab: a cover letter for the job in front, drafted with the answer engine. */
export function useLetter(job: ReturnType<typeof useJob>) {
  const answer = useAnswer();
  // The letter has no snipped field; Insert picks one on the page.
  const capture = shallowRef<PendingCapture | null>(null);
  const insert = useInsert(capture, answer);

  const company = ref('');
  const role = ref('');
  const notes = ref('');
  const length = ref<LetterLength>('standard');
  /** The candidate's own cover letter is saved and turned on. */
  const hasSample = ref(false);

  // Fill company and role from the saved job post, without overwriting what the user typed.
  watch(
    () => job.job.value,
    (j) => {
      if (!j) return;
      if (!company.value.trim() && j.company) company.value = j.company;
      if (!role.value.trim() && j.title) role.value = j.title;
    },
    { immediate: true },
  );

  async function loadSample() {
    hasSample.value = !!findCoverLetter(await getSources())?.enabled;
  }
  let unwatch: (() => void) | null = null;
  onMounted(() => {
    void loadSample();
    unwatch = sourcesItem.watch(() => void loadSample());
  });
  onUnmounted(() => unwatch?.());

  async function write() {
    await loadSample();
    const { capture: c } = await activeTabRequest((jobCtx) =>
      letterQuestion({
        company: company.value,
        role: role.value,
        notes: notes.value,
        hasJob: jobCtx,
        hasSample: hasSample.value,
      }),
    );
    capture.value = c;
    await answer.run(c, {
      force: 'new',
      length: `${LETTER_LENGTHS[length.value].guide}, always under ${LETTER_MAX_CHARS} characters`,
      limits: { maxChars: LETTER_MAX_CHARS, explicitChars: false },
      maxTokens: LETTER_MAX_TOKENS,
    });
  }

  return { answer, insert, company, role, notes, length, hasSample, write };
}

/**
 * A request drafted by the answer engine without a snip (letters, emails): the question is our own
 * text, the page is the active tab, so its saved job post and Insert's field picker still apply.
 */
export async function activeTabRequest(
  question: (hasJob: boolean) => string,
): Promise<{ capture: PendingCapture; hasJob: boolean }> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  const url = tab?.url?.startsWith('http') ? new URL(tab.url) : null;
  const hasJob = !!(url && (await getJobContext(url.hostname)));
  return {
    hasJob,
    capture: {
      id: `request-${Date.now()}`,
      createdAt: Date.now(),
      mode: 'question',
      tabId: tab?.id ?? -1,
      windowId: tab?.windowId ?? -1,
      pageText: question(hasJob),
      hiddenTextChars: 0,
      page: {
        title: tab?.title ?? '',
        hostname: url?.hostname ?? '',
        path: url?.pathname ?? '',
        lang: '',
      },
      candidates: [],
    },
  };
}
