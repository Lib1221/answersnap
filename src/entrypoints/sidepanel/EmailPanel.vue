<script setup lang="ts">
import { computed } from 'vue';
import { EMAIL_KINDS, mailtoUrl, type EmailKind } from '@/kb/emails';
import Icon from '@/ui/AppIcon.vue';
import { t } from '@/ui/i18n';
import AnswerPanel from './AnswerPanel.vue';
import type { useEmail } from './useEmail';

const props = defineProps<{ state: ReturnType<typeof useEmail> }>();
const emit = defineEmits<{ openSettings: [section?: string] }>();

const e = props.state;
const KINDS = Object.entries(EMAIL_KINDS) as [EmailKind, { label: string }][];
const drafting = computed(() => ['drafting', 'streaming'].includes(e.answer.phase.value));
const started = computed(() => e.answer.phase.value !== 'idle');
const ready = computed(() => e.answer.phase.value === 'done' && !!e.answer.answer.value.trim());

function openMail() {
  window.open(mailtoUrl(e.answer.answer.value), '_blank');
}
</script>

<template>
  <section class="card flex flex-col gap-3 p-4" data-testid="email-form">
    <div class="flex items-center gap-2.5">
      <span class="flex h-8 w-8 items-center justify-center rounded-lg bg-ink-soft text-ink">
        <Icon name="pen" :size="18" />
      </span>
      <div>
        <h2 class="text-[15px] leading-tight font-[650]">{{ t('email_title', 'Emails') }}</h2>
        <p class="text-[12.5px] text-graphite-2">
          {{ t('email_subtitle', 'Thank-you notes, follow-ups, and offer replies.') }}
        </p>
      </div>
    </div>

    <label class="flex flex-col gap-1 text-[13px] font-medium">
      {{ t('email_kind', 'Email') }}
      <select
        v-model="e.kind.value"
        class="field-input px-2.5 py-1.5 font-normal"
        data-testid="email-kind"
      >
        <option v-for="[id, info] in KINDS" :key="id" :value="id">{{ info.label }}</option>
      </select>
    </label>

    <div class="grid grid-cols-2 gap-2">
      <label class="flex flex-col gap-1 text-[13px] font-medium">
        {{ t('email_company', 'Company') }}
        <input v-model="e.company.value" class="field-input px-2.5 py-1.5 font-normal" />
      </label>
      <label class="flex flex-col gap-1 text-[13px] font-medium">
        {{ t('email_role', 'Role') }}
        <input v-model="e.role.value" class="field-input px-2.5 py-1.5 font-normal" />
      </label>
    </div>

    <label class="flex flex-col gap-1 text-[13px] font-medium">
      {{ t('email_to', 'To (optional)') }}
      <input
        v-model="e.recipient.value"
        class="field-input px-2.5 py-1.5 font-normal"
        :placeholder="t('email_to_ph', 'Dana Reyes')"
        data-testid="email-to"
      />
    </label>
    <label class="flex flex-col gap-1 text-[13px] font-medium">
      {{ t('email_notes', 'What to mention (optional)') }}
      <textarea
        v-model="e.notes.value"
        rows="2"
        class="field-input px-2.5 py-1.5 font-normal"
        :placeholder="EMAIL_KINDS[e.kind.value].notesHint"
        data-testid="email-notes"
      />
    </label>

    <button
      class="btn btn-primary self-start"
      type="button"
      :disabled="drafting"
      data-testid="email-write"
      @click="e.write"
    >
      <Icon name="pen" />
      {{ started ? t('email_write_again', 'Write again') : t('email_write', 'Write email') }}
    </button>
  </section>

  <AnswerPanel
    v-if="started"
    variant="email"
    :state="e.answer"
    :insert="e.insert"
    @open-settings="(s) => emit('openSettings', s)"
  />
  <button
    v-if="ready"
    class="btn self-start"
    type="button"
    data-testid="email-open"
    @click="openMail"
  >
    <Icon name="mail" /> {{ t('email_open', 'Open in email app') }}
  </button>
</template>
