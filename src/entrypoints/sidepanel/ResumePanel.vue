<script setup lang="ts">
import { computed, ref } from 'vue';
import type { TailoredResume } from '@/llm/resumeTailor';
import Icon from '@/ui/AppIcon.vue';
import type { useJob } from './useJob';
import type { useJobTool } from './useJobTool';

const props = defineProps<{
  state: ReturnType<typeof useJobTool<TailoredResume>>;
  job: ReturnType<typeof useJob>;
}>();
const r = props.state;
const res = computed(() => r.result.value);
const copied = ref('');

async function copy(id: string, text: string) {
  try {
    await navigator.clipboard.writeText(text);
    copied.value = id;
    setTimeout(() => (copied.value = ''), 1500);
  } catch {
    // Clipboard refused; the text stays selectable.
  }
}
const allBullets = computed(() =>
  (res.value?.bullets ?? []).map((b) => `• ${b.tailored}`).join('\n'),
);
</script>

<template>
  <section
    v-if="!props.job.job.value"
    class="card flex flex-col items-center gap-2 px-5 py-7 text-center"
    data-testid="resume-needs-job"
  >
    <div class="flex h-12 w-12 items-center justify-center rounded-2xl bg-ink-soft text-ink">
      <Icon name="file" :size="22" />
    </div>
    <h2 class="text-[15px] font-[650]">Save the job post first</h2>
    <p class="text-[13px] text-graphite-2">
      Use <strong class="text-graphite">Set job</strong> above, then get your resume bullets
      reworded for this job.
    </p>
  </section>

  <template v-else>
    <section class="card flex flex-col gap-3 p-4" data-testid="resume">
      <div class="flex items-center gap-2.5">
        <span class="flex h-8 w-8 items-center justify-center rounded-lg bg-ink-soft text-ink">
          <Icon name="file" :size="18" />
        </span>
        <div class="min-w-0 flex-1">
          <h2 class="text-[15px] leading-tight font-[650]">Tailor my resume</h2>
          <p class="truncate text-[12.5px] text-graphite-2">
            For {{ props.job.label(props.job.job.value) }}
          </p>
        </div>
      </div>
      <p class="text-[12.5px] text-graphite-2">
        Your real bullets, reworded in the job post's language. Facts and numbers stay the same.
      </p>
      <p
        v-if="r.status.value === 'running'"
        role="status"
        class="flex items-center gap-2 text-[13px] text-graphite-2"
      >
        <span class="h-2 w-2 animate-pulse rounded-full bg-ink" aria-hidden="true" />
        Tailoring your resume…
      </p>
      <p v-if="r.error.value" class="notice text-[13px]" role="alert">{{ r.error.value }}</p>
      <button
        class="btn self-start"
        :class="res ? '' : 'btn-primary'"
        type="button"
        :disabled="r.status.value === 'running'"
        data-testid="resume-run"
        @click="r.run"
      >
        <Icon :name="res ? 'refresh' : 'sparkle'" />
        {{ res ? 'Tailor again' : 'Tailor my resume' }}
      </button>
    </section>

    <template v-if="res && r.status.value !== 'running'">
      <section class="card flex flex-col gap-2 p-4">
        <div class="flex items-center justify-between">
          <p class="eyebrow">Summary</p>
          <button
            class="btn btn-quiet min-h-0 text-[12.5px]"
            type="button"
            @click="copy('summary', res.summary)"
          >
            <Icon :name="copied === 'summary' ? 'check' : 'copy'" :size="14" />
            {{ copied === 'summary' ? 'Copied' : 'Copy' }}
          </button>
        </div>
        <p class="text-[13.5px] leading-relaxed" data-testid="resume-summary">{{ res.summary }}</p>
      </section>

      <section class="card flex flex-col gap-2 p-4">
        <div class="flex items-center justify-between">
          <p class="eyebrow">Bullets</p>
          <button
            class="btn btn-quiet min-h-0 text-[12.5px]"
            type="button"
            @click="copy('all', allBullets)"
          >
            <Icon :name="copied === 'all' ? 'check' : 'copy'" :size="14" />
            {{ copied === 'all' ? 'Copied' : 'Copy all' }}
          </button>
        </div>
        <ul class="flex flex-col gap-3" data-testid="resume-bullets">
          <li v-for="(b, i) in res.bullets" :key="i" class="flex flex-col gap-1">
            <p class="text-[13.5px]">
              {{ b.tailored }}
              <span
                v-if="b.assumed"
                class="chip ml-1 min-h-0 border-canary-edge bg-canary py-0 text-[11px]"
                title="Not in your data: check before using"
                >Assumed</span
              >
            </p>
            <p v-if="b.original" class="text-[12px] text-graphite-2">Was: {{ b.original }}</p>
            <p v-else class="text-[12px] text-graphite-2">New bullet for a gap in your profile.</p>
            <button
              class="btn btn-quiet min-h-0 self-start px-0 text-[12.5px]"
              type="button"
              @click="copy(`b${i}`, b.tailored)"
            >
              <Icon :name="copied === `b${i}` ? 'check' : 'copy'" :size="13" />
              {{ copied === `b${i}` ? 'Copied' : 'Copy' }}
            </button>
          </li>
        </ul>
      </section>

      <section v-if="res.skills.length" class="card flex flex-col gap-2 p-4">
        <div class="flex items-center justify-between">
          <p class="eyebrow">Skills, in this order</p>
          <button
            class="btn btn-quiet min-h-0 text-[12.5px]"
            type="button"
            @click="copy('skills', res.skills.join(', '))"
          >
            <Icon :name="copied === 'skills' ? 'check' : 'copy'" :size="14" />
            {{ copied === 'skills' ? 'Copied' : 'Copy' }}
          </button>
        </div>
        <ul class="flex flex-wrap gap-1.5" data-testid="resume-skills">
          <li v-for="k in res.skills" :key="k" class="chip">{{ k }}</li>
        </ul>
      </section>
    </template>
  </template>
</template>
