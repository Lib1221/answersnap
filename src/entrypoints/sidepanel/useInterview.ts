import { computed, ref, shallowRef, watch } from 'vue';
import { jobLabel, jobPromptText } from '@/kb/jobContext';
import { upsertEntry } from '@/kb/library';
import { runInterviewPrep, type InterviewQuestion } from '@/llm/interviewPrep';
import { jobTaskError, prepareJobTask } from './jobTask';
import type { useJob } from './useJob';

/** Interview prep for the saved job post; kept per job for the session. */
export function useInterview(job: ReturnType<typeof useJob>) {
  const status = ref<'idle' | 'running' | 'done' | 'error'>('idle');
  const questions = shallowRef<InterviewQuestion[]>([]);
  const error = ref('');
  const model = ref('');
  /** Questions saved to the Library, by question text. */
  const saved = ref(new Set<string>());
  const cache = new Map<string, { questions: InterviewQuestion[]; model: string }>();
  let controller: AbortController | null = null;

  const jobKey = computed(() => {
    const j = job.job.value;
    return j ? `${j.hostname}|${j.createdAt}` : '';
  });
  watch(
    jobKey,
    (k) => {
      controller?.abort();
      const hit = cache.get(k);
      questions.value = hit?.questions ?? [];
      model.value = hit?.model ?? '';
      status.value = hit ? 'done' : 'idle';
      error.value = '';
      saved.value = new Set();
    },
    { immediate: true },
  );

  async function run() {
    const j = job.job.value;
    if (!j) return;
    const k = jobKey.value;
    error.value = '';
    const task = await prepareJobTask((e) => (model.value = e.to));
    if (!task.ok) {
      status.value = 'error';
      error.value = task.error;
      return;
    }
    controller?.abort();
    controller = new AbortController();
    const signal = controller.signal;
    status.value = 'running';
    model.value = task.settings.model;
    try {
      const result = await runInterviewPrep({
        provider: task.provider,
        model: task.settings.model,
        candidateBlock: task.candidateBlock,
        jobText: jobPromptText(j) ?? '',
        styleRules: task.settings.styleRules,
        fillGaps: task.settings.fillGaps,
        signal,
      });
      cache.set(k, { questions: result, model: model.value });
      if (jobKey.value !== k) return;
      questions.value = result;
      saved.value = new Set();
      status.value = 'done';
    } catch (err) {
      if (signal.aborted) return;
      status.value = 'error';
      error.value = jobTaskError(err, task.settings, "Couldn't prepare the questions. Try again.");
    }
  }

  async function save(q: InterviewQuestion) {
    const j = job.job.value;
    if (!j) return;
    await upsertEntry({
      hostname: j.hostname,
      pageTitle: `Interview: ${jobLabel(j)}`,
      question: q.question,
      questionType: 'long_text',
      answer: q.answer,
      model: model.value,
    });
    saved.value = new Set([...saved.value, q.question]);
  }

  return { status, questions, error, saved, run, save };
}
