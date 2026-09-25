<script setup lang="ts">
import { computed, ref } from 'vue';
import { quirksFor } from '@/config/models';
import { missingItemHash } from '@/kb/missing';
import { cutAtLastSentence } from '@/llm/conversation';
import { costLine, usageLine } from '@/llm/cost';
import FactCheck from './FactCheck.vue';
import Icon from '@/ui/AppIcon.vue';
import type { FieldInfo } from '@/storage/schema';
import type { useAnswer } from './useAnswer';
import type { useInsert } from './useInsert';

const props = defineProps<{
  state: ReturnType<typeof useAnswer>;
  insert: ReturnType<typeof useInsert>;
}>();
const emit = defineEmits<{ openSettings: [section?: string] }>();

const s = props.state;
const ins = props.insert;
const appendOpen = ref(false);

const KIND_NAMES: Record<FieldInfo['kind'], string> = {
  input: 'input',
  textarea: 'text box',
  contenteditable: 'editor',
  select: 'dropdown',
  'radio-group': 'choice',
  'checkbox-group': 'checkboxes',
};

const targetText = computed(() => {
  const f = ins.target.value;
  if (!f) return null;
  if (f.inIframe) return 'a field inside an embedded frame';
  return f.label ? `"${f.label}" ${KIND_NAMES[f.kind]}` : KIND_NAMES[f.kind];
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
    `${s.chars.value.toLocaleString()} / ${(l?.maxChars ?? 0).toLocaleString()} characters`,
  ];
  if (l?.maxWords) parts.push(`${s.words.value} / ${l.maxWords} words`);
  return parts.join(', ');
});

const footer = computed(() => {
  const u = s.usage.value;
  const settings = s.settings.value;
  if (!settings || (u.inputTokens === 0 && u.outputTokens === 0)) return null;
  const free = settings.provider === 'gemini' && settings.geminiFreeTier;
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
      <Icon name="sparkle" :size="14" class="text-ink" /> Your answer
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
      {{ s.retryNote.value || 'Drafting' }}
    </p>
    <p v-else-if="s.retryNote.value" role="status" class="text-graphite-2">
      {{ s.retryNote.value }}
    </p>

    <template v-if="showAnswer">
      <label class="sr-only" for="answer">Answer</label>
      <textarea
        id="answer"
        v-model="s.answer.value"
        data-testid="answer"
        class="field-input min-h-36 resize-y p-3 text-[15px] leading-[1.6]"
        :readonly="streaming"
        rows="6"
      />
      <p
        class="text-[13px] tabular-nums"
        :class="s.overLimit.value ? 'notice' : 'text-graphite-2'"
        data-testid="counter"
      >
        {{ counter }}
      </p>
      <p class="sr-only" aria-live="polite">{{ s.phase.value === 'done' ? 'Answer ready' : '' }}</p>

      <ul
        v-if="s.parsed.value?.missing.length"
        class="flex flex-wrap gap-2"
        aria-label="Missing information"
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
      <p v-if="s.parsed.value?.notes" class="text-[13px] text-graphite-2" data-testid="notes">
        {{ s.parsed.value.notes }}
      </p>

      <div class="flex flex-wrap items-center gap-2">
        <button v-if="streaming" class="btn" type="button" @click="s.stop">
          <Icon name="stop" /> Stop
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
              {{ ins.isChoice.value ? 'Select' : ins.hasExisting.value ? 'Replace' : 'Insert' }}
            </button>
            <button
              v-if="ins.hasExisting.value"
              class="btn btn-primary rounded-l-none border-l-paper px-2"
              type="button"
              aria-label="More insert options"
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
            Append
          </button>
          <button
            class="btn"
            :class="ins.fillable.value ? '' : 'btn-primary'"
            type="button"
            :disabled="!s.answer.value"
            @click="ins.copy"
          >
            <Icon name="copy" /> Copy
          </button>
          <button class="btn btn-quiet" type="button" @click="ins.saveToLibrary">
            <Icon name="bookmark" :size="15" /> Save
          </button>
          <button class="btn btn-quiet" type="button" @click="s.retry">
            <Icon name="refresh" :size="15" /> Regenerate
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
        <p class="eyebrow">Refine</p>
        <div class="flex flex-wrap gap-1.5">
          <template v-if="s.overLimit.value">
            <button
              class="chip border-carbon-pink-text text-carbon-pink-text"
              type="button"
              @click="s.refine({ kind: 'fit' })"
            >
              Fit limit
            </button>
            <button
              class="chip border-carbon-pink-text text-carbon-pink-text"
              type="button"
              @click="cut"
            >
              Cut at last sentence
            </button>
          </template>
          <button class="chip" type="button" @click="s.refine({ kind: 'shorter' })">Shorter</button>
          <button class="chip" type="button" @click="s.refine({ kind: 'longer' })">Longer</button>
          <button class="chip" type="button" @click="s.refine({ kind: 'tone', tone: 'formal' })">
            More formal
          </button>
          <button class="chip" type="button" @click="s.refine({ kind: 'tone', tone: 'casual' })">
            More casual
          </button>
        </div>
        <form class="flex gap-2" @submit.prevent="sendChange">
          <label for="change-request" class="sr-only">Change it</label>
          <input
            id="change-request"
            v-model="changeRequest"
            class="field-input min-w-0 flex-1"
            placeholder="Change it..."
            data-testid="change-request"
          />
          <button class="btn" type="submit" :disabled="!changeRequest.trim()">Send</button>
        </form>
      </div>
      <p v-if="s.phase.value === 'stopped'" class="text-[13px] text-graphite-2">Stopped.</p>
    </template>

    <div
      v-else-if="s.phase.value === 'match' && s.match.value"
      class="flex flex-col gap-2 rounded-[10px] border border-canary-edge bg-canary p-3.5"
      data-testid="reuse-card"
    >
      <p class="flex items-center gap-1.5 font-[650]">
        <Icon name="bookmark" :size="15" class="text-ink" /> You answered this before
      </p>
      <p class="text-[13px] text-graphite-2">
        {{ s.match.value.entry.question }} ({{ s.match.value.entry.hostname }})
      </p>
      <p class="whitespace-pre-wrap">{{ s.match.value.entry.answer }}</p>
      <div class="flex flex-wrap gap-2">
        <button class="btn btn-primary" type="button" @click="s.reuse()">Reuse</button>
        <button class="btn" type="button" @click="s.adapt">Adapt</button>
        <button class="btn btn-quiet" type="button" @click="s.writeNew">Write new</button>
      </div>
    </div>

    <p v-else-if="s.phase.value === 'assessment'" data-testid="assessment">
      This looks like a test question. AnswerSnap only drafts answers about your own background.
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
        Open settings
      </button>
      <button v-else class="btn btn-primary" type="button" @click="s.retry">Retry</button>
    </div>

    <div
      v-else-if="s.phase.value === 'needs-key'"
      class="flex flex-col items-start gap-2"
      data-testid="needs-key"
    >
      <p>Add your API key to start.</p>
      <button class="btn btn-primary" type="button" @click="emit('openSettings', 'provider')">
        Open settings
      </button>
    </div>

    <div
      v-else-if="s.phase.value === 'needs-profile'"
      class="flex flex-col items-start gap-2"
      data-testid="needs-profile"
    >
      <p>Add your resume so answers have something to draw from.</p>
      <button class="btn btn-primary" type="button" @click="emit('openSettings', 'sources')">
        Add resume
      </button>
    </div>

    <p
      class="flex flex-wrap items-center gap-x-2 text-[13px] text-graphite-2"
      data-testid="target"
      @mouseenter="ins.highlight(true)"
      @mouseleave="ins.highlight(false)"
    >
      <span v-if="ins.picking.value">Click the field on the page. Esc cancels.</span>
      <span v-else-if="targetText">Target: {{ targetText }}</span>
      <span v-else>No text field found near the question. Copy the answer or pick a field.</span>
      <button
        class="btn btn-quiet min-h-0"
        type="button"
        :disabled="ins.picking.value"
        @click="ins.pick"
      >
        {{ ins.target.value ? 'Change' : 'Pick field' }}
      </button>
    </p>

    <footer
      v-if="footer"
      class="border-t border-rule pt-2 text-[12px] text-graphite-2 tabular-nums"
      data-testid="usage"
    >
      <p>{{ footer.usage }}</p>
      <p v-if="footer.cost">{{ footer.cost }}</p>
      <p v-if="cacheOff">Cache off (profile too short for this model)</p>
    </footer>
  </section>
</template>
