<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import {
  APPLICATION_STATUSES,
  countByStatus,
  getApplications,
  removeApplication,
  STATUS_LABELS,
  toCsv,
  updateApplication,
  watchApplications,
  type Application,
  type ApplicationStatus,
} from '@/kb/applications';
import Icon from '@/ui/AppIcon.vue';

const list = ref<Application[]>([]);
const filter = ref<ApplicationStatus | 'all' | 'active'>('active');
const load = async () => {
  list.value = await getApplications();
};
let unwatch: (() => void) | null = null;
onMounted(() => {
  void load();
  unwatch = watchApplications(() => void load());
});
onUnmounted(() => unwatch?.());

const CLOSED: ApplicationStatus[] = ['rejected', 'withdrawn'];
const counts = computed(() => countByStatus(list.value));
const shown = computed(() =>
  [...list.value]
    .filter((a) =>
      filter.value === 'all'
        ? true
        : filter.value === 'active'
          ? !CLOSED.includes(a.status)
          : a.status === filter.value,
    )
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
);

const day = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

const STATUS_TONE: Record<ApplicationStatus, string> = {
  saved: 'bg-surface text-graphite-2',
  applied: 'bg-ink-soft text-ink',
  interviewing: 'bg-canary text-ink-strong',
  offer: 'bg-success-soft text-success',
  rejected: 'bg-surface text-graphite-2',
  withdrawn: 'bg-surface text-graphite-2',
};

function exportCsv() {
  const blob = new Blob([toCsv(list.value)], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `applications-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
</script>

<template>
  <section id="applications" class="flex flex-col gap-6" aria-labelledby="applications-title">
    <div>
      <h2 id="applications-title" class="text-xl font-[650]">Applications</h2>
      <p class="text-graphite-2">
        Every job post you save in the side panel is tracked here. Move it along from the Job tab or
        here. Stored only in this browser.
      </p>
    </div>

    <ul class="grid grid-cols-3 gap-2 sm:grid-cols-6" data-testid="application-counts">
      <li
        v-for="s in APPLICATION_STATUSES"
        :key="s"
        class="flex flex-col rounded-control border border-rule bg-paper px-3 py-2"
      >
        <span class="text-[20px] leading-tight font-[650] tabular-nums">{{ counts[s] }}</span>
        <span class="text-[12.5px] text-graphite-2">{{ STATUS_LABELS[s] }}</span>
      </li>
    </ul>

    <div class="flex flex-wrap items-center gap-2">
      <label class="flex items-center gap-2 text-[13px]">
        Show
        <select v-model="filter" class="field-input px-2 py-1" data-testid="application-filter">
          <option value="active">Open applications</option>
          <option value="all">All</option>
          <option v-for="s in APPLICATION_STATUSES" :key="s" :value="s">
            {{ STATUS_LABELS[s] }}
          </option>
        </select>
      </label>
      <button
        class="btn ml-auto"
        type="button"
        :disabled="!list.length"
        data-testid="application-export"
        @click="exportCsv"
      >
        <Icon name="file" /> Export CSV
      </button>
    </div>

    <p v-if="!list.length" class="rounded-control bg-surface p-4 text-graphite-2">
      Nothing tracked yet. In the side panel, use <strong>Set job</strong> on a job post and it
      shows up here.
    </p>
    <p v-else-if="!shown.length" class="text-graphite-2">No applications with this status.</p>

    <ul class="flex flex-col gap-3" data-testid="application-list">
      <li v-for="a in shown" :key="a.id" class="card flex flex-col gap-2 p-4">
        <div class="flex flex-wrap items-start gap-2">
          <div class="min-w-0 flex-1">
            <p class="font-medium">
              {{ a.role || 'Untitled role'
              }}<span v-if="a.company" class="text-graphite-2"> at {{ a.company }}</span>
            </p>
            <a
              v-if="a.url"
              :href="a.url"
              target="_blank"
              rel="noopener noreferrer"
              class="text-[13px] text-ink underline-offset-2 hover:underline"
              >{{ a.hostname }}</a
            >
            <p v-else class="text-[13px] text-graphite-2">{{ a.hostname }}</p>
          </div>
          <span
            class="rounded-full px-2.5 py-0.5 text-[12px] font-medium"
            :class="STATUS_TONE[a.status]"
          >
            {{ STATUS_LABELS[a.status] }}
          </span>
        </div>
        <p class="text-[12.5px] text-graphite-2">
          Saved {{ day(a.createdAt) }}
          <template v-if="a.updatedAt !== a.createdAt"> · Updated {{ day(a.updatedAt) }}</template>
        </p>
        <div class="flex flex-wrap items-center gap-2">
          <select
            class="field-input w-auto px-2 py-1 text-[13px]"
            :value="a.status"
            :aria-label="`Status for ${a.role ?? a.hostname}`"
            @change="
              updateApplication(a.id, {
                status: ($event.target as HTMLSelectElement).value as ApplicationStatus,
              })
            "
          >
            <option v-for="s in APPLICATION_STATUSES" :key="s" :value="s">
              {{ STATUS_LABELS[s] }}
            </option>
          </select>
          <button class="btn btn-quiet ml-auto" type="button" @click="removeApplication(a.id)">
            Delete
          </button>
        </div>
        <textarea
          class="field-input px-2.5 py-1.5 text-[13px]"
          rows="2"
          placeholder="Notes: who you talked to, next steps, salary range…"
          :value="a.notes"
          :aria-label="`Notes for ${a.role ?? a.hostname}`"
          @change="updateApplication(a.id, { notes: ($event.target as HTMLTextAreaElement).value })"
        />
      </li>
    </ul>
  </section>
</template>
