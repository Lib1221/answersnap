<script setup lang="ts">
import { computed } from 'vue';
import { LETTER_LENGTHS, type LetterLength } from '@/kb/coverLetter';
import Icon from '@/ui/AppIcon.vue';
import { t } from '@/ui/i18n';
import AnswerPanel from './AnswerPanel.vue';
import type { useJob } from './useJob';
import type { useLetter } from './useLetter';

const props = defineProps<{
  state: ReturnType<typeof useLetter>;
  job: ReturnType<typeof useJob>;
}>();
const emit = defineEmits<{ openSettings: [section?: string] }>();

const l = props.state;
const LENGTHS = Object.entries(LETTER_LENGTHS) as [LetterLength, { label: string }][];
const drafting = computed(() => ['drafting', 'streaming'].includes(l.answer.phase.value));
const started = computed(() => l.answer.phase.value !== 'idle');
</script>

<template>
  <section class="card flex flex-col gap-3 p-4" data-testid="letter-form">
    <div class="flex items-center gap-2.5">
      <span class="flex h-8 w-8 items-center justify-center rounded-lg bg-ink-soft text-ink">
        <Icon name="mail" :size="18" />
      </span>
      <div>
        <h2 class="text-[15px] leading-tight font-[650]">
          {{ t('letter_title', 'Cover letter') }}
        </h2>
        <p class="text-[12.5px] text-graphite-2">
          {{
            l.hasSample.value
              ? t('letter_subtitle_sample', 'Written from your profile and your own cover letter.')
              : t('letter_subtitle', 'Written from your profile.')
          }}
        </p>
      </div>
    </div>

    <p
      v-if="props.job.job.value"
      class="success flex items-start gap-2 text-[13px]"
      data-testid="letter-job"
    >
      <Icon name="briefcase" :size="15" class="mt-0.5 shrink-0" />
      {{
        t(
          'letter_job_saved',
          'Tailored to the job post saved for $1.',
          props.job.hostname.value ?? '',
        )
      }}
    </p>
    <p
      v-else
      class="flex items-start gap-2 rounded-control bg-surface px-3 py-2 text-[13px] text-graphite-2"
      data-testid="letter-no-job"
    >
      <Icon name="briefcase" :size="15" class="mt-0.5 shrink-0" />
      <span>
        {{ t('letter_tip_use', 'Tip: use') }}
        <strong class="text-graphite">{{ t('job_set_job', 'Set job') }}</strong>
        {{
          t(
            'letter_tip_rest',
            'above to save the job post, and the letter will match it. Or just fill in the company and role.',
          )
        }}
      </span>
    </p>

    <div class="grid grid-cols-2 gap-2">
      <label class="flex flex-col gap-1 text-[13px] font-medium">
        {{ t('letter_company', 'Company') }}
        <input
          v-model="l.company.value"
          class="field-input px-2.5 py-1.5 font-normal"
          :placeholder="t('letter_company_ph', 'Acme')"
          data-testid="letter-company"
        />
      </label>
      <label class="flex flex-col gap-1 text-[13px] font-medium">
        {{ t('letter_role', 'Role') }}
        <input
          v-model="l.role.value"
          class="field-input px-2.5 py-1.5 font-normal"
          :placeholder="t('letter_role_ph', 'Backend Engineer')"
          data-testid="letter-role"
        />
      </label>
    </div>

    <fieldset class="flex flex-col gap-1">
      <legend class="mb-1 text-[13px] font-medium">{{ t('letter_length', 'Length') }}</legend>
      <div class="grid grid-cols-3 gap-1 rounded-[10px] bg-rule/60 p-1" role="radiogroup">
        <button
          v-for="[id, info] in LENGTHS"
          :key="id"
          type="button"
          role="radio"
          :aria-checked="l.length.value === id"
          class="rounded-[8px] py-1 text-[12.5px] font-medium transition-colors"
          :class="
            l.length.value === id
              ? 'bg-paper text-graphite shadow-[var(--shadow-sm)]'
              : 'text-graphite-2 hover:text-graphite'
          "
          @click="l.length.value = id"
        >
          {{ info.label }}
        </button>
      </div>
    </fieldset>

    <label class="flex flex-col gap-1 text-[13px] font-medium">
      {{ t('letter_notes', 'Anything to mention (optional)') }}
      <textarea
        v-model="l.notes.value"
        rows="2"
        class="field-input px-2.5 py-1.5 font-normal"
        :placeholder="
          t(
            'letter_notes_ph',
            'For example: I can start in two weeks, or mention my open source work',
          )
        "
        data-testid="letter-notes"
      />
    </label>

    <div class="flex flex-wrap items-center gap-2">
      <button
        class="btn btn-primary"
        type="button"
        :disabled="drafting"
        data-testid="letter-write"
        @click="l.write"
      >
        <Icon name="pen" />
        {{
          started ? t('letter_write_again', 'Write again') : t('letter_write', 'Write cover letter')
        }}
      </button>
      <button
        v-if="!l.hasSample.value"
        class="btn btn-quiet text-[12.5px]"
        type="button"
        data-testid="letter-add-own"
        @click="emit('openSettings', 'cover-letter')"
      >
        {{ t('letter_add_own', 'Add your own cover letter') }}
      </button>
    </div>
  </section>

  <AnswerPanel
    v-if="started"
    variant="letter"
    :state="l.answer"
    :insert="l.insert"
    @open-settings="(s) => emit('openSettings', s)"
  />
</template>
