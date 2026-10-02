import { computed, onMounted, onUnmounted, ref, type Ref, type ShallowRef } from 'vue';
import {
  closingDate,
  getScholarships,
  removeScholarship,
  sortScholarships,
  trackScholarship,
  updateScholarship,
  watchScholarships,
  type Scholarship,
} from '@/kb/scholarships';
import type { Requirements } from '@/llm/requirements';
import { getSettings, saveSettings } from '@/storage/items';
import type { useJob } from './useJob';

// The Study tab's tracker: the calls the applicant is working on, soonest deadline first.

export function useScholarshipTracker(
  job: ReturnType<typeof useJob>,
  requirements: ShallowRef<Requirements | null>,
  /** Documents already ticked in the Requirements view, carried over when tracking. */
  checklist: Ref<string[]>,
) {
  const all = ref<Scholarship[]>([]);
  const reminders = ref(true);
  const load = async () => {
    all.value = await getScholarships();
  };
  let unwatch: (() => void) | null = null;
  onMounted(() => {
    void load();
    void getSettings().then((s) => (reminders.value = s.deadlineReminders));
    unwatch = watchScholarships(() => void load());
  });
  onUnmounted(() => unwatch?.());

  const list = computed(() => sortScholarships(all.value));
  /** The tracked entry for the call whose requirements are showing. */
  const tracked = computed(() => {
    const name = requirements.value?.program.trim().toLowerCase();
    return name ? all.value.find((s) => s.program.trim().toLowerCase() === name) : undefined;
  });

  /** The saved page's address, when Chrome lets the panel see it and it is that site. */
  async function pageUrl(hostname: string): Promise<string> {
    try {
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      const url = tab?.url ?? '';
      return /^https?:/i.test(url) && new URL(url).hostname === hostname ? url.slice(0, 2000) : '';
    } catch {
      return '';
    }
  }

  /** Track the call whose requirements were just read (or refresh it). */
  async function track() {
    const r = requirements.value;
    const j = job.job.value;
    if (!r) return;
    await trackScholarship({
      program: r.program || j?.title || '',
      institution: r.institution,
      hostname: j?.hostname ?? '',
      url: j ? await pageUrl(j.hostname) : '',
      deadline: closingDate(r),
      steps: r.deadlines.map((d) => ({ what: d.what, date: d.date })),
      documents: r.documents.map((d) => ({
        name: d.name,
        done: checklist.value.includes(d.name),
      })),
    });
    await load();
  }

  /** Add one by hand: a name and, when known, its closing date. */
  async function add(program: string, deadline: string) {
    if (!program.trim()) return;
    await trackScholarship({
      program,
      institution: '',
      hostname: '',
      url: '',
      deadline: /^\d{4}-\d{2}-\d{2}$/.test(deadline) ? deadline : null,
      steps: [],
      documents: [],
    });
    await load();
  }

  async function update(id: string, patch: Parameters<typeof updateScholarship>[1]) {
    await updateScholarship(id, patch);
    await load();
  }
  async function toggleDocument(s: Scholarship, name: string) {
    await update(s.id, {
      documents: s.documents.map((d) => (d.name === name ? { ...d, done: !d.done } : { ...d })),
    });
  }
  async function remove(id: string) {
    await removeScholarship(id);
    await load();
  }
  async function setReminders(on: boolean) {
    reminders.value = on;
    await saveSettings({ deadlineReminders: on });
  }

  return { list, tracked, reminders, track, add, update, toggleDocument, remove, setReminders };
}
