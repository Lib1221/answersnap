<script setup lang="ts">
import { computed, ref } from 'vue';
import { quirksFor } from '@/config/models';
import { missingItemHash } from '@/kb/missing';
import { cutAtLastSentence } from '@/llm/conversation';
import { costLine, usageLine } from '@/llm/cost';
import FactCheck from './FactCheck.vue';
import Icon from '@/ui/AppIcon.vue';
import { t } from '@/ui/i18n';
import type { FieldInfo } from '@/storage/schema';
import type { useAnswer } from './useAnswer';
import type { useInsert } from './useInsert';

const props = defineProps<{
  state: ReturnType<typeof useAnswer>;
  insert: ReturnType<typeof useInsert>;
  /** Job tab drafts: their own wording and a taller box. */
  variant?: 'letter' | 'email';
}>();
const emit = defineEmits<{ openSettings: [section?: string] }>();

const s = props.state;
const ins = props.insert;
const appendOpen = ref(false);

const KIND_NAMES: Record<FieldInfo['kind'], string> = {
  input: t('answer_kind_input', 'input'),
  textarea: t('answer_kind_textarea', 'text box'),
  contenteditable: t('answer_kind_editor', 'editor'),
  select: t('answer_kind_select', 'dropdown'),
  'radio-group': t('answer_kind_radio', 'choice'),
  'checkbox-group': t('answer_kind_checkbox', 'checkboxes'),
};

const targetText = computed(() => {
  const f = ins.target.value;
  if (!f) return null;
  if (f.inIframe) return t('answer_target_iframe', 'a field inside an embedded frame');
  return f.label
    ? t('answer_target_labeled', '"$1" $2', f.label, KIND_NAMES[f.kind])
    : KIND_NAMES[f.kind];
});

const streaming = computed(() => s.phase.value === 'streaming' || s.phase.value === 'drafting');
// Keep the previous answer on screen while a refinement drafts.
const showAnswer = computed(
  () =>
    ['streaming', 'done', 'stopped'].includes(s.phase.value) ||
    (s.phase.value === 'drafting' && !!s.answer.value),
);
const changeRequest = ref('');

function sendChange() {
  const text = changeRequest.value.trim();
  if (!text) return;
  changeRequest.value = '';
  void s.refine({ kind: 'custom', text });
}

function cut() {
  const l = s.limits.value;
  if (l) s.answer.value = cutAtLastSentence(s.answer.value, l.maxChars);
}

const counter = computed(() => {
  const l = s.limits.value;
  const parts = [
    t(
      'answer_counter_chars',
      '$1 / $2 characters',
      s.chars.value.toLocaleString(),
      (l?.maxChars ?? 0).toLocaleString(),
    ),
  ];
  if (l?.maxWords)
    parts.push(
      t('answer_counter_words', '$1 / $2 words', String(s.words.value), String(l.maxWords)),
    );
  return parts.join(', ');
});

const footer = computed(() => {
  const u = s.usage.value;
  const settings = s.settings.value;
  if (!settings || (u.inputTokens === 0 && u.outputTokens === 0)) return null;
  // Ollama runs locally; Gemini's free tier has no charge either.
  const free =
    settings.provider === 'ollama' || (settings.provider === 'gemini' && settings.geminiFreeTier);
  return {
    usage: usageLine(s.model.value, u),
    cost: costLine(u, settings.prices[s.model.value], free),
  };
});

/** Caching silently does nothing below the model's minimum prefix (spec 11.2). */
const cacheOff = computed(() => {
  const u = s.usage.value;
  const settings = s.settings.value;
  if (!settings || settings.provider !== 'anthropic' || s.phase.value !== 'done') return false;
  return (
    quirksFor(s.model.value).minCacheTokens !== undefined &&
    u.cacheReadTokens === 0 &&
    u.cacheWriteTokens === 0
  );
});
</script>

<template>
  <section class="card flex flex-col gap-3 p-3.5" data-testid="answer-section">
    <p class="eyebrow flex items-center gap-1.5">
      <Icon :name="variant ? 'mail' : 'sparkle'" :size="14" class="text-ink" />
      {{
        variant === 'letter'
          ? t('answer_heading_letter', 'Your cover letter')
          : variant === 'email'
            ? t('answer_heading_email', 'Your email')
            : t('answer_heading', 'Your answer')
      }}
    </p>
    <p
      v-if="s.fallbackNote.value"
      class="text-[13px] text-graphite-2"
      role="status"
      data-testid="fallback-note"
    >
      {{ s.fallbackNote.value }}
    </p>
    <p
      v-if="s.phase.value === 'drafting'"
      role="status"
      class="flex items-center gap-2 text-graphite-2"
    >
      <span class="h-2 w-2 animate-pulse rounded-full bg-ink" aria-hidden="true" />
      {{ s.retryNote.value || t('answer_drafting', 'Drafting') }}
    </p>
    <p v-else-if="s.retryNote.value" role="status" class="text-graphite-2">
      {{ s.retryNote.value }}
    </p>

    <template v-if="showAnswer">
      <div
        v-if="s.versions.value.length > 1"
        class="flex items-center gap-1 text-[13px] text-graphite-2"
        data-testid="versions"
      >
        <button
          class="btn btn-icon min-h-0 p-1"
          type="button"
          :aria-label="t('answer_prev_version', 'Previous version')"
          :disabled="streaming || s.versionIndex.value === 0"
          @click="s.showVersion(s.versionIndex.value - 1)"
        >
          ‹
        </button>
        <span class="tabular-nums" data-testid="version-label">
          {{
            t(
              'answer_version_of',
              'Version $1 of $2: $3',
              String(s.versionIndex.value + 1),
              String(s.versions.value.length),
              s.versions.value[s.versionIndex.value]?.label ?? '',
            )
          }}
        </span>
        <button
          class="btn btn-icon min-h-0 p-1"
          type="button"
          :aria-label="t('answer_next_version', 'Next version')"
          :disabled="streaming || s.versionIndex.value === s.versions.value.length - 1"
          @click="s.showVersion(s.versionIndex.value + 1)"
        >
          ›
        </button>
      </div>
      <label class="sr-only" for="answer">{{ t('answer_label', 'Answer') }}</label>
      <textarea
        id="answer"
        v-model="s.answer.value"
        data-testid="answer"
        class="field-input min-h-36 resize-y p-3 text-[15px] leading-[1.6]"
        :readonly="streaming"
        :rows="variant === 'letter' ? 16 : variant === 'email' ? 12 : 6"
      />
      <p
        class="text-[13px] tabular-nums"
        :class="s.overLimit.value ? 'notice' : 'text-graphite-2'"
        data-testid="counter"
      >
        {{ counter }}
      </p>
      <p class="sr-only" aria-live="polite">
        {{ s.phase.value === 'done' ? t('answer_ready', 'Answer ready') : '' }}
      </p>

      <ul
        v-if="s.parsed.value?.missing.length"
        class="flex flex-wrap gap-2"
        :aria-label="t('answer_missing', 'Missing information')"
      >
        <li v-for="item in s.parsed.value.missing" :key="item">
          <button
            class="inline-flex items-center gap-1 rounded-full bg-carbon-pink px-2.5 py-1 text-[12.5px] font-medium text-carbon-pink-text"
            type="button"
            @click="emit('openSettings', missingItemHash(item))"
          >
            <Icon name="alert" :size="13" /> {{ item }}
          </button>
        </li>
      </ul>
      <FactCheck :state="s" />
      <p
        v-if="s.parsed.value?.notes"
        class="text-[13px]"
        :class="
          /^assumed\b/i.test(s.parsed.value.notes)
            ? 'rounded-control border border-canary-edge bg-canary px-3 py-2 text-ink-strong'
            : 'text-graphite-2'
        "
        data-testid="notes"
      >
        {{ s.parsed.value.notes }}
      </p>

      <div class="flex flex-wrap items-center gap-2">
        <button v-if="streaming" class="btn" type="button" @click="s.stop">
          <Icon name="stop" /> {{ t('answer_stop', 'Stop') }}
        </button>
        <template v-else>
          <span v-if="ins.fillable.value" class="inline-flex">
            <button
              class="btn btn-primary"
              :class="ins.hasExisting.value ? 'rounded-r-none' : ''"
              type="button"
              :disabled="!ins.canInsert.value || ins.busy.value"
              title="Ctrl+Enter"
              @click="ins.insert('replace')"
            >
              <Icon :name="ins.isChoice.value ? 'check' : 'insert'" />
              {{
                ins.isChoice.value
                  ? t('answer_select', 'Select')
                  : ins.hasExisting.value
                    ? t('answer_replace', 'Replace')
                    : t('answer_insert', 'Insert')
              }}
            </button>
            <button
              v-if="ins.hasExisting.value"
              class="btn btn-primary rounded-l-none border-l-paper px-2"
              type="button"
              :aria-label="t('answer_more_insert', 'More insert options')"
              :aria-expanded="appendOpen"
              :disabled="!ins.canInsert.value || ins.busy.value"
              @click="appendOpen = !appendOpen"
            >
              ▾
            </button>
          </span>
          <button
            v-if="appendOpen && ins.hasExisting.value"
            class="btn"
            type="button"
            :disabled="!ins.canInsert.value"
            @click="((appendOpen = false), ins.insert('append'))"
          >
            {{ t('answer_append', 'Append') }}
          </button>
          <button
            class="btn"
            :class="ins.fillable.value ? '' : 'btn-primary'"
            type="button"
            :disabled="!s.answer.value"
            @click="ins.copy"
          >
            <Icon name="copy" /> {{ t('answer_copy', 'Copy') }}
          </button>
          <button class="btn btn-quiet" type="button" @click="ins.saveToLibrary">
            <Icon name="bookmark" :size="15" /> {{ t('answer_save', 'Save') }}
          </button>
          <button class="btn btn-quiet" type="button" @click="s.retry">
            <Icon name="refresh" :size="15" /> {{ t('answer_regenerate', 'Regenerate') }}
          </button>
        </template>
        <span
          v-if="ins.toast.value"
          role="status"
          class="inline-flex items-center gap-1 text-[13px] font-medium text-success"
          ><Icon name="check" :size="14" />{{ ins.toast.value }}</span
        >
      </div>
      <p v-if="ins.message.value" class="notice" role="alert" data-testid="insert-message">
        {{ ins.message.value }}
      </p>

      <div
        v-if="!streaming && s.answer.value && s.canRefine.value"
        class="flex flex-col gap-2"
        data-testid="refine"
      >
        <p class="eyebrow">{{ t('answer_refine', 'Refine') }}</p>
        <div class="flex flex-wrap gap-1.5">
          <template v-if="s.overLimit.value">
            <button
              class="chip border-carbon-pink-text text-carbon-pink-text"
              type="button"
              @click="s.refine({ kind: 'fit' })"
            >
              {{ t('answer_fit_limit', 'Fit limit') }}
            </button>
            <button
              class="chip border-carbon-pink-text text-carbon-pink-text"
              type="button"
              @click="cut"
            >
              {{ t('answer_cut', 'Cut at last sentence') }}
            </button>
          </template>
          <button class="chip" type="button" @click="s.refine({ kind: 'shorter' })">
            {{ t('answer_shorter', 'Shorter') }}
          </button>
          <button class="chip" type="button" @click="s.refine({ kind: 'longer' })">
            {{ t('answer_longer', 'Longer') }}
          </button>
          <button class="chip" type="button" @click="s.refine({ kind: 'tone', tone: 'formal' })">
            {{ t('answer_more_formal', 'More formal') }}
          </button>
          <button class="chip" type="button" @click="s.refine({ kind: 'tone', tone: 'casual' })">
            {{ t('answer_more_casual', 'More casual') }}
          </button>
          <button class="chip" type="button" @click="s.refine({ kind: 'angle' })">
            {{ t('answer_another_angle', 'Another angle') }}
          </button>
        </div>
        <form class="flex gap-2" @submit.prevent="sendChange">
          <label for="change-request" class="sr-only">{{
            t('answer_change_it', 'Change it')
          }}</label>
          <input
            id="change-request"
            v-model="changeRequest"
            class="field-input min-w-0 flex-1"
            :placeholder="t('answer_change_placeholder', 'Change it...')"
            data-testid="change-request"
          />
          <button class="btn" type="submit" :disabled="!changeRequest.trim()">
            {{ t('answer_send', 'Send') }}
          </button>
        </form>
      </div>
      <p v-if="s.phase.value === 'stopped'" class="text-[13px] text-graphite-2">
        {{ t('answer_stopped', 'Stopped.') }}
      </p>
    </template>

    <div
      v-else-if="s.phase.value === 'match' && s.match.value"
      class="flex flex-col gap-2 rounded-[10px] border border-canary-edge bg-canary p-3.5"
      data-testid="reuse-card"
    >
      <p class="flex items-center gap-1.5 font-[650]">
        <Icon name="bookmark" :size="15" class="text-ink" />
        {{ t('answer_reuse_title', 'You answered this before') }}
      </p>
      <p class="text-[13px] text-graphite-2">
        {{ s.match.value.entry.question }} ({{ s.match.value.entry.hostname }})
      </p>
      <p class="whitespace-pre-wrap">{{ s.match.value.entry.answer }}</p>
      <div class="flex flex-wrap gap-2">
        <button class="btn btn-primary" type="button" @click="s.reuse()">
          {{ t('answer_reuse', 'Reuse') }}
        </button>
        <button class="btn" type="button" @click="s.adapt">{{ t('answer_adapt', 'Adapt') }}</button>
        <button class="btn btn-quiet" type="button" @click="s.writeNew">
          {{ t('answer_write_new', 'Write new') }}
        </button>
      </div>
    </div>

    <p v-else-if="s.phase.value === 'assessment'" data-testid="assessment">
      {{
        t(
          'answer_assessment',
          'This looks like a test question. AnswerSnap only drafts answers about your own background.',
        )
      }}
    </p>

    <div
      v-else-if="s.phase.value === 'error' && s.error.value"
      class="flex flex-col items-start gap-2"
      data-testid="answer-error"
    >
      <p role="alert">{{ s.error.value.message }}</p>
      <button
        v-if="s.error.value.kind === 'auth'"
        class="btn"
        type="button"
        @click="emit('openSettings', 'provider')"
      >
        {{ t('buttonOpenSettings', 'Open settings') }}
      </button>
      <button v-else class="btn btn-primary" type="button" @click="s.retry">
        {{ t('panel_retry', 'Retry') }}
      </button>
    </div>

    <div
      v-else-if="s.phase.value === 'needs-key'"
      class="flex flex-col items-start gap-2"
      data-testid="needs-key"
    >
      <p>{{ t('panelNeedsKey', 'Add your API key to start.') }}</p>
      <button class="btn btn-primary" type="button" @click="emit('openSettings', 'provider')">
        {{ t('buttonOpenSettings', 'Open settings') }}
      </button>
    </div>

    <div
      v-else-if="s.phase.value === 'needs-profile'"
      class="flex flex-col items-start gap-2"
      data-testid="needs-profile"
    >
      <p>{{ t('panelNeedsProfile', 'Add your resume so answers have something to draw from.') }}</p>
      <button class="btn btn-primary" type="button" @click="emit('openSettings', 'sources')">
        {{ t('buttonAddResume', 'Add resume') }}
      </button>
    </div>

    <p
      class="flex flex-wrap items-center gap-x-2 text-[13px] text-graphite-2"
      data-testid="target"
      @mouseenter="ins.highlight(true)"
      @mouseleave="ins.highlight(false)"
    >
      <span v-if="ins.picking.value">{{
        t('answer_picking', 'Click the field on the page. Esc cancels.')
      }}</span>
      <span v-else-if="targetText">{{ t('answer_target', 'Target: $1', targetText) }}</span>
      <span v-else-if="variant === 'letter'">{{
        t('answer_target_letter', 'Copy the letter, or pick the cover letter field on the page.')
      }}</span>
      <span v-else-if="variant === 'email'">{{
        t('answer_target_email', 'Copy the email, or open it in your email app.')
      }}</span>
      <span v-else>{{
        t(
          'answer_target_none',
          'No text field found near the question. Copy the answer or pick a field.',
        )
      }}</span>
      <button
        class="btn btn-quiet min-h-0"
        type="button"
        :disabled="ins.picking.value"
        @click="ins.pick"
      >
        {{ ins.target.value ? t('answer_change', 'Change') : t('answer_pick_field', 'Pick field') }}
      </button>
    </p>

    <footer
      v-if="footer"
      class="border-t border-rule pt-2 text-[12px] text-graphite-2 tabular-nums"
      data-testid="usage"
    >
      <p>{{ footer.usage }}</p>
      <p v-if="footer.cost">{{ footer.cost }}</p>
      <p v-if="cacheOff">
        {{ t('answer_cache_off', 'Cache off (profile too short for this model)') }}
      </p>
    </footer>
  </section>
</template>
