import { computed, onMounted, onUnmounted, shallowRef } from 'vue';
import {
  findApplication,
  getApplications,
  trackJob,
  updateApplication,
  watchApplications,
  type Application,
  type ApplicationStatus,
} from '@/kb/applications';
import type { useJob } from './useJob';

/** The tracked application for the saved job post, for the Job tab's status bar. */
export function useTracker(job: ReturnType<typeof useJob>) {
  const list = shallowRef<Application[]>([]);
  const load = async () => {
    list.value = await getApplications();
  };
  let unwatch: (() => void) | null = null;
  onMounted(() => {
    void load();
    unwatch = watchApplications(() => void load());
  });
  onUnmounted(() => unwatch?.());

  const current = computed(() => {
    const j = job.job.value;
    return j ? findApplication(list.value, j.hostname, j.title) : undefined;
  });

  async function setStatus(status: ApplicationStatus) {
    if (current.value) await updateApplication(current.value.id, { status });
    await load();
  }

  /** Job posts saved before the tracker existed aren't tracked yet. */
  async function track() {
    const j = job.job.value;
    if (!j) return;
    await trackJob({ hostname: j.hostname, company: j.company, role: j.title });
    await load();
  }

  return { current, setStatus, track };
}
