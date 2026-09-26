import { computed, ref, shallowRef, watch, type ShallowRef } from 'vue';
import { jobPromptText, type JobContext } from '@/kb/jobContext';
import type { Settings } from '@/storage/schema';
import { jobTaskError, prepareJobTask } from './jobTask';
import type { useJob } from './useJob';

export interface JobToolRun<T> {
  (input: {
    task: Extract<Awaited<ReturnType<typeof prepareJobTask>>, { ok: true }>;
    jobText: string;
    job: JobContext;
    signal: AbortSignal;
  }): Promise<T>;
}

/**
 * One AI tool for the saved job post (resume tailoring, and so on): run it, keep the result per
 * job for the session, and drop stale results when the job changes.
 */
export function useJobTool<T>(
  job: ReturnType<typeof useJob>,
  runTool: JobToolRun<T>,
  failMessage: string,
) {
  const status = ref<'idle' | 'running' | 'done' | 'error'>('idle');
  const result = shallowRef<T | null>(null) as ShallowRef<T | null>;
  const error = ref('');
  const settings = shallowRef<Settings | null>(null);
  const cache = new Map<string, T>();
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
    settings.value = task.settings;
    controller?.abort();
    controller = new AbortController();
    const signal = controller.signal;
    status.value = 'running';
    try {
      const out = await runTool({ task, jobText: jobPromptText(j) ?? '', job: j, signal });
      cache.set(k, out);
      if (jobKey.value !== k) return;
      result.value = out;
      status.value = 'done';
    } catch (err) {
      if (signal.aborted) return;
      status.value = 'error';
      error.value = jobTaskError(err, task.settings, failMessage);
    }
  }

  return { status, result, error, settings, run };
}
