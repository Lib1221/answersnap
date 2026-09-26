import { computed, ref, shallowRef, watch } from 'vue';
import { jobPromptText } from '@/kb/jobContext';
import { runJobFit, type JobFit } from '@/llm/jobFit';
import { prepareJobTask, jobTaskError } from './jobTask';
import { t } from '@/ui/i18n';
import type { useJob } from './useJob';

/** Fit check for the saved job post; results are kept per job for the session. */
export function useJobFit(job: ReturnType<typeof useJob>) {
  const status = ref<'idle' | 'running' | 'done' | 'error'>('idle');
  const result = shallowRef<JobFit | null>(null);
  const error = ref('');
  const cache = new Map<string, JobFit>();
  let controller: AbortController | null = null;

  const jobKey = computed(() => {
    const j = job.job.value;
    return j ? `${j.hostname}|${j.createdAt}` : '';
  });
  watch(
    jobKey,
    (k) => {
      controller?.abort();
      result.value = cache.get(k) ?? null;
      status.value = result.value ? 'done' : 'idle';
      error.value = '';
    },
    { immediate: true },
  );

  async function run() {
    const j = job.job.value;
    if (!j) return;
    const k = jobKey.value;
    error.value = '';
    const task = await prepareJobTask();
    if (!task.ok) {
      status.value = 'error';
      error.value = task.error;
      return;
    }
    controller?.abort();
    controller = new AbortController();
    const signal = controller.signal;
    status.value = 'running';
    try {
      const fit = await runJobFit({
        provider: task.provider,
        model: task.settings.model,
        candidateBlock: task.candidateBlock,
        jobText: jobPromptText(j) ?? '',
        signal,
      });
      cache.set(k, fit);
      if (jobKey.value !== k) return;
      result.value = fit;
      status.value = 'done';
    } catch (err) {
      if (signal.aborted) return;
      status.value = 'error';
      error.value = jobTaskError(
        err,
        task.settings,
        t('fit_error', "Couldn't check the fit. Try again."),
      );
    }
  }

  return { status, result, error, run };
}
