<script setup lang="ts">
import { computed, ref } from 'vue';
import { quirksFor } from '@/config/models';
import { costLine, usageLine } from '@/llm/cost';
import type { useAnswer } from './useAnswer';

const props = defineProps<{ state: ReturnType<typeof useAnswer> }>();
const emit = defineEmits<{ openSettings: [section?: string] }>();

const s = props.state;
const toast = ref('');
let toastTimer = 0;

const streaming = computed(() => s.phase.value === 'streaming' || s.phase.value === 'drafting');
const showAnswer = computed(() => ['streaming', 'done', 'stopped'].includes(s.phase.value));

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

function flash(message: string) {
  toast.value = message;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (toast.value = ''), 2000);
}

async function copy() {
  await navigator.clipboard.writeText(s.answer.value);
  flash('Copied');
}
</script>

<template>
  <section class="flex flex-col gap-3 border-t border-rule pt-3" data-testid="answer-section">
    <p v-if="s.phase.value === 'drafting'" role="status">{{ s.retryNote.value || 'Drafting' }}</p>
    <p v-else-if="s.retryNote.value" role="status" class="text-graphite-2">
      {{ s.retryNote.value }}
    </p>

    <template v-if="showAnswer">
      <label class="sr-only" for="answer">Answer</label>
      <textarea
        id="answer"
        v-model="s.answer.value"
        data-testid="answer"
        class="min-h-32 w-full resize-y rounded-[6px] border border-rule bg-paper p-3 text-[15px] leading-[1.6]"
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
            class="rounded-[6px] bg-carbon-pink px-2 py-1 text-[13px] text-carbon-pink-text"
            type="button"
            @click="emit('openSettings', 'standard-answers')"
          >
            {{ item }}
          </button>
        </li>
      </ul>
      <p v-if="s.parsed.value?.notes" class="text-[13px] text-graphite-2" data-testid="notes">
        {{ s.parsed.value.notes }}
      </p>

      <div class="flex flex-wrap items-center gap-2">
        <button v-if="streaming" class="btn" type="button" @click="s.stop">Stop</button>
        <template v-else>
          <button class="btn btn-primary" type="button" :disabled="!s.answer.value" @click="copy">
            Copy
          </button>
          <button class="btn btn-quiet" type="button" @click="s.retry">Regenerate</button>
        </template>
        <span v-if="toast" role="status" class="text-[13px] text-graphite-2">{{ toast }}</span>
      </div>
      <p v-if="s.phase.value === 'stopped'" class="text-[13px] text-graphite-2">Stopped.</p>
    </template>

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
