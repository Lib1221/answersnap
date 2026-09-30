<script setup lang="ts">
import { computed } from 'vue';
import type { Resume } from '@/kb/resume/model';
import type { JobPost } from '@/kb/resume/tailoring';
import Icon from '@/ui/AppIcon.vue';
import type { TailorPhase } from './useTailor';

// Shown over the preview while one-click tailoring runs, when the master resume must be chosen
// first, or when something went wrong.

const props = defineProps<{
  phase: TailorPhase;
  job: JobPost | null;
  error: string;
  resumes: Resume[];
  /** Dealbreakers the job hits ("Should I apply?"). */
  hits: string[];
}>();
const emit = defineEmits<{
  choose: [resume: Resume];
  retry: [];
  close: [];
  proceed: [];
  skip: [];
}>();
defineSlots<{ import?: () => unknown }>();

const target = computed(() => {
  const j = props.job;
  if (!j) return 'this job';
  return [j.title, j.company && `at ${j.company}`].filter(Boolean).join(' ') || 'this job';
});

const STEPS: { phase: TailorPhase; label: string }[] = [
  { phase: 'loading', label: 'Reading the job post' },
  { phase: 'tailoring', label: "Matching your resume to the job's requirements" },
  { phase: 'fitting', label: 'Fitting it to two pages' },
];
const order: TailorPhase[] = ['loading', 'tailoring', 'fitting', 'done'];
const state = (p: TailorPhase) => {
  const now = order.indexOf(props.phase);
  const at = order.indexOf(p);
  return at < now ? 'done' : at === now ? 'active' : 'waiting';
};
const originals = computed(() => props.resumes.filter((r) => !r.tailoring));
</script>

<template>
  <div class="app-chrome flex justify-center px-6 py-10" data-testid="tailor-progress">
    <div class="card flex w-full max-w-lg flex-col gap-4 p-6">
      <template v-if="phase === 'need-master'">
        <h2 class="text-[17px] font-[650]">Which resume is your master?</h2>
        <p class="text-[13.5px] text-graphite-2">
          Every tailored copy for {{ target }} and future jobs starts from your master resume, and
          tailoring never changes it. Pick one, or import your resume PDF.
        </p>
        <ul v-if="originals.length" class="flex flex-col gap-1.5">
          <li v-for="r in originals" :key="r.id">
            <button
              type="button"
              class="btn w-full justify-between text-left"
              data-testid="choose-master"
              @click="emit('choose', r)"
            >
              <span class="truncate">{{ r.name }}</span>
              <span class="text-[12px] text-graphite-2">{{ r.personal.fullName }}</span>
            </button>
          </li>
        </ul>
        <slot name="import" />
      </template>

      <template v-else-if="phase === 'dealbreakers'">
        <h2 class="text-[17px] font-[650]">Should you apply?</h2>
        <p class="text-[13.5px] text-graphite-2">
          {{ target }} hits
          {{ hits.length === 1 ? 'one of your dealbreakers' : 'your dealbreakers' }}. Nothing has
          been sent to the AI yet.
        </p>
        <ul class="flex flex-col gap-1.5">
          <li
            v-for="(h, i) in hits"
            :key="i"
            class="notice rounded-control px-2.5 py-1.5 text-[13px]"
            data-testid="dealbreaker-item"
          >
            {{ h }}
          </li>
        </ul>
        <div class="flex flex-wrap gap-2">
          <button
            type="button"
            class="btn btn-primary"
            data-testid="skip-job"
            @click="emit('skip')"
          >
            Skip this job
          </button>
          <button type="button" class="btn" data-testid="tailor-anyway" @click="emit('proceed')">
            Tailor anyway
          </button>
        </div>
        <p class="text-[12.5px] text-graphite-2">
          Change your dealbreakers in Settings, Applications.
        </p>
      </template>

      <template v-else-if="phase === 'error'">
        <h2 class="text-[17px] font-[650]">Couldn't tailor your resume</h2>
        <p class="notice text-[13.5px]" role="alert" data-testid="tailor-error">{{ error }}</p>
        <div class="flex gap-2">
          <button
            v-if="job"
            type="button"
            class="btn btn-primary"
            data-testid="tailor-retry"
            @click="emit('retry')"
          >
            Try again
          </button>
          <button type="button" class="btn btn-quiet" @click="emit('close')">
            Back to my resumes
          </button>
        </div>
      </template>

      <template v-else>
        <h2 class="text-[17px] font-[650]" aria-live="polite">Tailoring your resume</h2>
        <p class="text-[13.5px] text-graphite-2">
          For {{ target }}. This takes about half a minute.
        </p>
        <ol class="flex flex-col gap-2" role="status">
          <li
            v-for="s in STEPS"
            :key="s.phase"
            class="flex items-center gap-2 text-[13.5px]"
            :class="state(s.phase) === 'waiting' ? 'text-graphite-2' : 'text-graphite'"
            :data-state="state(s.phase)"
          >
            <span class="grid size-5 place-items-center" aria-hidden="true">
              <Icon v-if="state(s.phase) === 'done'" name="check" :size="15" class="text-ink" />
              <span
                v-else-if="state(s.phase) === 'active'"
                class="size-3.5 animate-spin rounded-full border-2 border-ink border-t-transparent motion-reduce:animate-none"
              />
              <span v-else class="size-2 rounded-full bg-rule" />
            </span>
            {{ s.label }}
          </li>
        </ol>
      </template>
    </div>
  </div>
</template>
