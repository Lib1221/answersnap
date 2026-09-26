<script setup lang="ts">
import { computed, ref } from 'vue';
import { VERDICT_LABELS } from '@/llm/jobFit';
import Icon from '@/ui/AppIcon.vue';
import { t } from '@/ui/i18n';
import type { useJob } from './useJob';
import type { useJobFit } from './useJobFit';

const props = defineProps<{
  state: ReturnType<typeof useJobFit>;
  job: ReturnType<typeof useJob>;
}>();
const f = props.state;
const fit = computed(() => f.result.value);
const copied = ref(false);

const tone = computed(() => {
  const s = fit.value?.score ?? 0;
  return s >= 60 ? 'bg-success' : s >= 40 ? 'bg-canary-edge' : 'bg-carbon-pink';
});

async function copyKeywords() {
  if (!fit.value) return;
  try {
    await navigator.clipboard.writeText(fit.value.keywords.join(', '));
    copied.value = true;
    setTimeout(() => (copied.value = false), 1500);
  } catch {
    // Clipboard refused (panel not focused); the chips stay selectable.
  }
}
</script>

<template>
  <section
    v-if="!props.job.job.value"
    class="card flex flex-col items-center gap-2 px-5 py-7 text-center"
    data-testid="fit-needs-job"
  >
    <div class="flex h-12 w-12 items-center justify-center rounded-2xl bg-ink-soft text-ink">
      <Icon name="target" :size="22" />
    </div>
    <h2 class="text-[15px] font-[650]">
      {{ t('job_save_post_first', 'Save the job post first') }}
    </h2>
    <p class="text-[13px] text-graphite-2">
      {{ t('job_use', 'Use') }}
      <strong class="text-graphite">{{ t('job_set_job', 'Set job') }}</strong>
      {{ t('fit_needs_job', 'above, then check how well your profile matches it.') }}
    </p>
  </section>

  <template v-else>
    <section class="card flex flex-col gap-3 p-4" data-testid="fit">
      <div class="flex items-center gap-2.5">
        <span class="flex h-8 w-8 items-center justify-center rounded-lg bg-ink-soft text-ink">
          <Icon name="target" :size="18" />
        </span>
        <div class="min-w-0 flex-1">
          <h2 class="text-[15px] leading-tight font-[650]">{{ t('fit_title', 'Job fit') }}</h2>
          <p class="truncate text-[12.5px] text-graphite-2">
            {{ t('fit_against', 'Your profile against $1', props.job.label(props.job.job.value)) }}
          </p>
        </div>
      </div>

      <p
        v-if="f.status.value === 'running'"
        role="status"
        class="flex items-center gap-2 text-[13px] text-graphite-2"
      >
        <span class="h-2 w-2 animate-pulse rounded-full bg-ink" aria-hidden="true" />
        {{ t('fit_running', 'Comparing your profile with the job post…') }}
      </p>
      <p v-if="f.error.value" class="notice text-[13px]" role="alert" data-testid="fit-error">
        {{ f.error.value }}
      </p>

      <div v-if="fit && f.status.value !== 'running'" class="flex flex-col gap-2">
        <div class="flex items-end justify-between gap-2">
          <p class="text-[28px] leading-none font-[700] tabular-nums" data-testid="fit-score">
            {{ fit.score }}<span class="text-[14px] font-medium text-graphite-2">/100</span>
          </p>
          <span class="chip" data-testid="fit-verdict">{{ VERDICT_LABELS[fit.verdict] }}</span>
        </div>
        <div class="h-2 overflow-hidden rounded-full bg-rule" aria-hidden="true">
          <div class="h-full rounded-full" :class="tone" :style="{ width: `${fit.score}%` }" />
        </div>
        <p class="text-[13.5px]" data-testid="fit-summary">{{ fit.summary }}</p>
      </div>

      <button
        class="btn self-start"
        :class="fit ? '' : 'btn-primary'"
        type="button"
        :disabled="f.status.value === 'running'"
        data-testid="fit-run"
        @click="f.run"
      >
        <Icon :name="fit ? 'refresh' : 'target'" />
        {{ fit ? t('fit_run_again', 'Check again') : t('fit_run', 'Check my fit') }}
      </button>
    </section>

    <template v-if="fit && f.status.value !== 'running'">
      <section class="card flex flex-col gap-2 p-4">
        <p class="eyebrow">{{ t('fit_requirements', 'Requirements') }}</p>
        <ul class="flex flex-col gap-2.5" data-testid="fit-requirements">
          <li v-for="r in fit.requirements" :key="r.requirement" class="flex gap-2">
            <Icon
              :name="r.met ? 'check' : 'alert'"
              :size="16"
              class="mt-0.5 shrink-0"
              :class="r.met ? 'text-success' : 'text-carbon-pink-text'"
            />
            <div class="min-w-0 text-[13.5px]">
              <p>
                {{ r.requirement }}
                <span v-if="r.mustHave" class="ml-1 text-[11.5px] text-graphite-2">{{
                  t('fit_must_have', 'must-have')
                }}</span>
              </p>
              <p v-if="r.met && r.evidence" class="text-[12.5px] text-graphite-2">
                {{ r.evidence }}
              </p>
              <p v-else-if="!r.met && r.advice" class="text-[12.5px] text-graphite-2">
                {{ r.advice }}
              </p>
            </div>
          </li>
        </ul>
      </section>

      <section v-if="fit.keywords.length" class="card flex flex-col gap-2 p-4">
        <div class="flex items-center justify-between">
          <p class="eyebrow">{{ t('fit_keywords', 'Keywords to use') }}</p>
          <button class="btn btn-quiet min-h-0 text-[12.5px]" type="button" @click="copyKeywords">
            <Icon :name="copied ? 'check' : 'copy'" :size="14" />
            {{ copied ? t('fit_copied', 'Copied') : t('fit_copy_all', 'Copy all') }}
          </button>
        </div>
        <ul class="flex flex-wrap gap-1.5" data-testid="fit-keywords">
          <li v-for="k in fit.keywords" :key="k" class="chip">{{ k }}</li>
        </ul>
      </section>

      <section v-if="fit.talkingPoints.length" class="card flex flex-col gap-2 p-4">
        <p class="eyebrow">{{ t('fit_talking_points', 'Talking points') }}</p>
        <ol class="flex list-decimal flex-col gap-1.5 pl-5 text-[13.5px]">
          <li v-for="p in fit.talkingPoints" :key="p">{{ p }}</li>
        </ol>
      </section>
    </template>
  </template>
</template>
