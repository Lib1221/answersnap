<script setup lang="ts">
import { computed } from 'vue';
import type { useAnswer } from './useAnswer';

const props = defineProps<{ state: ReturnType<typeof useAnswer> }>();
const s = props.state;

const fc = computed(() => s.factCheck.value);
const stale = computed(
  () =>
    (fc.value.status === 'done' || fc.value.status === 'error') &&
    fc.value.forText !== s.answer.value.trim(),
);
const checkable = computed(
  () => fc.value.result?.checks.filter((c) => c.verdict !== 'placeholder') ?? [],
);
const flagged = computed(() => fc.value.result?.unsupported ?? []);

function fix() {
  void s.refine({ kind: 'fix-facts', unsupported: flagged.value });
}
</script>

<template>
  <div
    v-if="s.phase.value === 'done' && fc.status !== 'off'"
    class="text-[13px]"
    data-testid="fact-check"
  >
    <p v-if="fc.status === 'checking'" role="status" class="text-graphite-2">
      Checking facts against your profile…
    </p>

    <p v-else-if="stale" class="flex flex-wrap items-center gap-2 text-graphite-2">
      You edited the answer since the fact check.
      <button class="btn btn-quiet min-h-0" type="button" @click="s.checkFacts">Check again</button>
    </p>

    <p v-else-if="fc.status === 'error'" class="flex flex-wrap items-center gap-2 text-graphite-2">
      Couldn't run the fact check.
      <button class="btn btn-quiet min-h-0" type="button" @click="s.checkFacts">Try again</button>
    </p>

    <p
      v-else-if="fc.status === 'done' && !flagged.length"
      class="text-graphite-2"
      data-testid="fact-check-ok"
    >
      ✓ Fact check:
      {{
        checkable.length === 1 ? 'the sentence is' : `all ${checkable.length} sentences are`
      }}
      backed by your profile.
    </p>

    <p v-else-if="fc.status === 'done' && fc.dismissed" class="text-graphite-2">
      Fact check: you kept {{ flagged.length }}
      {{ flagged.length === 1 ? 'sentence' : 'sentences' }} it couldn't match to your profile.
    </p>

    <div
      v-else-if="fc.status === 'done'"
      class="notice flex flex-col gap-2"
      role="alert"
      data-testid="fact-check-flags"
    >
      <p class="font-medium">
        Fact check: {{ flagged.length }} of {{ checkable.length }}
        {{ checkable.length === 1 ? 'sentence isn’t' : 'sentences aren’t' }} backed by your profile.
      </p>
      <ul class="flex flex-col gap-1.5">
        <li v-for="c in flagged" :key="c.sentence">
          <q class="italic">{{ c.sentence }}</q>
          <span v-if="c.issue" class="block">{{ c.issue }}</span>
        </li>
      </ul>
      <div class="flex flex-wrap gap-2">
        <button class="btn btn-primary" type="button" @click="fix">Fix it</button>
        <button class="btn" type="button" @click="s.dismissFactCheck">Keep anyway</button>
      </div>
    </div>
  </div>
</template>
