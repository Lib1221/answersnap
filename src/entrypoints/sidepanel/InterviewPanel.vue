<script setup lang="ts">
import { ref } from 'vue';
import { KIND_LABELS, type InterviewQuestion } from '@/llm/interviewPrep';
import Icon from '@/ui/AppIcon.vue';
import { t } from '@/ui/i18n';
import type { useInterview } from './useInterview';
import type { useJob } from './useJob';

const props = defineProps<{
  state: ReturnType<typeof useInterview>;
  job: ReturnType<typeof useJob>;
}>();
const iv = props.state;
const open = ref(new Set<string>());
const copied = ref('');
const ASSUMED_TITLE = t(
  'interview_assumed_title',
  "This answer claims experience your profile doesn't show",
);

function toggle(q: string) {
  const next = new Set(open.value);
  if (!next.delete(q)) next.add(q);
  open.value = next;
}

async function copy(q: InterviewQuestion) {
  try {
    await navigator.clipboard.writeText(q.answer);
    copied.value = q.question;
    setTimeout(() => (copied.value = ''), 1500);
  } catch {
    // Clipboard refused; the answer text stays selectable.
  }
}
</script>

<template>
  <section
    v-if="!props.job.job.value"
    class="card flex flex-col items-center gap-2 px-5 py-7 text-center"
    data-testid="interview-needs-job"
  >
    <div class="flex h-12 w-12 items-center justify-center rounded-2xl bg-ink-soft text-ink">
      <Icon name="user" :size="22" />
    </div>
    <h2 class="text-[15px] font-[650]">
      {{ t('job_save_post_first', 'Save the job post first') }}
    </h2>
    <p class="text-[13px] text-graphite-2">
      {{ t('job_use', 'Use') }}
      <strong class="text-graphite">{{ t('job_set_job', 'Set job') }}</strong>
      {{
        t(
          'interview_needs_job',
          'above, then get the questions this interviewer is likely to ask, with answers from your profile.',
        )
      }}
    </p>
  </section>

  <template v-else>
    <section class="card flex flex-col gap-3 p-4" data-testid="interview">
      <div class="flex items-center gap-2.5">
        <span class="flex h-8 w-8 items-center justify-center rounded-lg bg-ink-soft text-ink">
          <Icon name="user" :size="18" />
        </span>
        <div class="min-w-0 flex-1">
          <h2 class="text-[15px] leading-tight font-[650]">
            {{ t('interview_title', 'Interview prep') }}
          </h2>
          <p class="truncate text-[12.5px] text-graphite-2">
            {{ t('interview_for', 'For $1', props.job.label(props.job.job.value)) }}
          </p>
        </div>
      </div>
      <p
        v-if="iv.status.value === 'running'"
        role="status"
        class="flex items-center gap-2 text-[13px] text-graphite-2"
      >
        <span class="h-2 w-2 animate-pulse rounded-full bg-ink" aria-hidden="true" />
        {{ t('interview_running', 'Writing likely questions and answers…') }}
      </p>
      <p v-if="iv.error.value" class="notice text-[13px]" role="alert">{{ iv.error.value }}</p>
      <button
        class="btn self-start"
        :class="iv.questions.value.length ? '' : 'btn-primary'"
        type="button"
        :disabled="iv.status.value === 'running'"
        data-testid="interview-run"
        @click="iv.run"
      >
        <Icon :name="iv.questions.value.length ? 'refresh' : 'sparkle'" />
        {{
          iv.questions.value.length
            ? t('interview_run_again', 'New questions')
            : t('interview_run', 'Prepare questions')
        }}
      </button>
    </section>

    <ol
      v-if="iv.questions.value.length && iv.status.value !== 'running'"
      class="flex flex-col gap-2.5"
      data-testid="interview-questions"
    >
      <li v-for="q in iv.questions.value" :key="q.question" class="card flex flex-col gap-2 p-3.5">
        <div class="flex flex-wrap items-center gap-1.5">
          <span class="chip min-h-0 py-0.5 text-[11.5px]">{{ KIND_LABELS[q.kind] }}</span>
          <span
            v-if="q.assumed"
            class="chip min-h-0 border-canary-edge bg-canary py-0.5 text-[11.5px]"
            :title="ASSUMED_TITLE"
          >
            {{ t('interview_assumed', 'Assumed') }}
          </span>
        </div>
        <p class="font-medium">{{ q.question }}</p>
        <p class="text-[12.5px] text-graphite-2">{{ q.why }}</p>
        <button
          class="btn btn-quiet min-h-0 self-start px-0 text-[13px]"
          type="button"
          :aria-expanded="open.has(q.question)"
          @click="toggle(q.question)"
        >
          {{
            open.has(q.question)
              ? t('interview_hide_answer', 'Hide answer')
              : t('interview_show_answer', 'Show suggested answer')
          }}
        </button>
        <template v-if="open.has(q.question)">
          <p
            class="rounded-control bg-surface p-3 text-[13.5px] leading-relaxed whitespace-pre-wrap"
          >
            {{ q.answer }}
          </p>
          <p v-if="q.tip" class="flex items-start gap-1.5 text-[12.5px] text-graphite-2">
            <Icon name="sparkle" :size="13" class="mt-0.5 shrink-0" /> {{ q.tip }}
          </p>
          <div class="flex flex-wrap gap-2">
            <button class="btn min-h-0 py-1 text-[13px]" type="button" @click="copy(q)">
              <Icon :name="copied === q.question ? 'check' : 'copy'" :size="14" />
              {{
                copied === q.question
                  ? t('interview_copied', 'Copied')
                  : t('interview_copy', 'Copy')
              }}
            </button>
            <button
              class="btn min-h-0 py-1 text-[13px]"
              type="button"
              :disabled="iv.saved.value.has(q.question)"
              @click="iv.save(q)"
            >
              <Icon :name="iv.saved.value.has(q.question) ? 'check' : 'bookmark'" :size="14" />
              {{
                iv.saved.value.has(q.question)
                  ? t('interview_saved', 'Saved')
                  : t('interview_save', 'Save to Library')
              }}
            </button>
          </div>
        </template>
      </li>
    </ol>
  </template>
</template>
