import { onUnmounted, ref, watch, type ComputedRef, type ShallowRef } from 'vue';
import { storage } from 'wxt/utils/storage';
import { loadCandidateData } from '@/kb/candidate';
import { jobPromptText } from '@/kb/jobContext';
import {
  countWords,
  DEFAULT_WORD_LIMIT,
  letterLimitFrom,
  runMotivationLetter,
  type MotivationInput,
} from '@/llm/motivation';
import type { Requirements } from '@/llm/requirements';
import { t } from '@/ui/i18n';
import { jobTaskError, prepareJobTask } from './jobTask';
import type { useJob } from './useJob';

// The Study tab's motivation letter: one per saved programme or call page, kept on this computer
// with what the applicant said about their reasons and goals.

export interface SavedLetter extends MotivationInput {
  text: string;
  missing: string[];
  updatedAt: string;
}

const MAX_SAVED = 40;
const lettersItem = storage.defineItem<Record<string, SavedLetter>>('local:motivationLetters', {
  fallback: {},
});

export function useMotivation(
  job: ReturnType<typeof useJob>,
  requirements: ShallowRef<Requirements | null>,
  /** One letter per saved page. */
  pageKey: ComputedRef<string>,
) {
  const blank = (): SavedLetter => ({
    program: '',
    institution: '',
    wordLimit: DEFAULT_WORD_LIMIT,
    why: '',
    goals: '',
    text: '',
    missing: [],
    updatedAt: '',
  });
  const form = ref<SavedLetter>(blank());
  const status = ref<'idle' | 'writing' | 'error'>('idle');
  const error = ref('');
  let controller: AbortController | null = null;

  /** What the page and the requirements say, for fields the applicant hasn't set. */
  function defaults(): Partial<SavedLetter> {
    const j = job.job.value;
    const r = requirements.value;
    return {
      program: r?.program || j?.title || '',
      institution: r?.institution || j?.company || '',
      wordLimit: letterLimitFrom(r) ?? DEFAULT_WORD_LIMIT,
    };
  }

  watch(
    pageKey,
    async (key) => {
      controller?.abort();
      status.value = 'idle';
      error.value = '';
      const saved = key ? (await lettersItem.getValue())[key] : undefined;
      form.value = saved ?? { ...blank(), ...defaults() };
    },
    { immediate: true },
  );
  // The requirements arrive after the page: fill what is still empty or default.
  watch(requirements, () => {
    const d = defaults();
    const f = form.value;
    form.value = {
      ...f,
      program: f.program || d.program || '',
      institution: f.institution || d.institution || '',
      wordLimit: f.text || f.wordLimit !== DEFAULT_WORD_LIMIT ? f.wordLimit : d.wordLimit!,
    };
  });
  onUnmounted(() => controller?.abort());

  async function save() {
    const key = pageKey.value;
    if (!key) return;
    const all = await lettersItem.getValue();
    // A JSON copy: storage can't take Vue's reactive arrays.
    all[key] = {
      ...(JSON.parse(JSON.stringify(form.value)) as SavedLetter),
      updatedAt: new Date().toISOString(),
    };
    // Keep the newest letters: essays add up, and local storage is shared with resumes.
    const kept = Object.entries(all)
      .sort((a, b) => b[1].updatedAt.localeCompare(a[1].updatedAt))
      .slice(0, MAX_SAVED);
    await lettersItem.setValue(Object.fromEntries(kept));
  }

  async function write() {
    const j = job.job.value;
    const key = pageKey.value;
    if (!j || !key) return;
    error.value = '';
    const task = await prepareJobTask();
    if (!task.ok) {
      status.value = 'error';
      error.value = task.error;
      return;
    }
    status.value = 'writing';
    controller = new AbortController();
    try {
      const letter = await runMotivationLetter({
        provider: task.provider,
        model: task.settings.model,
        settings: task.settings,
        data: await loadCandidateData(),
        input: form.value,
        // The whole page when it's there: what the letter must cover hides in the details.
        pageText: j.text || (jobPromptText(j) ?? ''),
        hostname: j.hostname,
        signal: controller.signal,
      });
      if (pageKey.value !== key) return;
      form.value = { ...form.value, text: letter.text, missing: letter.missing };
      status.value = 'idle';
      await save();
    } catch (err) {
      if (controller.signal.aborted) return;
      status.value = 'error';
      error.value = jobTaskError(
        err,
        task.settings,
        t('sch_letter_error', "Couldn't write the letter. Try again."),
      );
    }
  }

  const words = () => countWords(form.value.text);

  return { form, status, error, write, save, words };
}
