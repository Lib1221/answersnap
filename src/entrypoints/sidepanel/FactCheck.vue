<script setup lang="ts">
import { computed } from 'vue';
import { t } from '@/ui/i18n';
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
    <p
      v-if="fc.status === 'checking'"
      role="status"
      class="flex items-center gap-2 text-graphite-2"
    >
      <span class="h-2 w-2 animate-pulse rounded-full bg-ink" aria-hidden="true" />
      {{ t('factcheck_checking', 'Checking facts against your profile…') }}
    </p>

    <p v-else-if="stale" class="flex flex-wrap items-center gap-2 text-graphite-2">
      {{ t('factcheck_stale', 'You edited the answer since the fact check.') }}
      <button class="btn btn-quiet min-h-0" type="button" @click="s.checkFacts">
        {{ t('factcheck_check_again', 'Check again') }}
      </button>
    </p>

    <p v-else-if="fc.status === 'error'" class="flex flex-wrap items-center gap-2 text-graphite-2">
      {{ t('factcheck_error', "Couldn't run the fact check.") }}
      <button class="btn btn-quiet min-h-0" type="button" @click="s.checkFacts">
        {{ t('factcheck_try_again', 'Try again') }}
      </button>
    </p>

    <p
      v-else-if="fc.status === 'done' && !flagged.length"
      class="success"
      data-testid="fact-check-ok"
    >
      {{
        checkable.length === 1
          ? t('factcheck_ok_one', '✓ Fact check: the sentence is backed by your profile.')
          : t(
              'factcheck_ok_many',
              '✓ Fact check: all $1 sentences are backed by your profile.',
              String(checkable.length),
            )
      }}
    </p>

    <p v-else-if="fc.status === 'done' && fc.dismissed" class="text-graphite-2">
      {{
        flagged.length === 1
          ? t(
              'factcheck_kept_one',
              "Fact check: you kept 1 sentence it couldn't match to your profile.",
            )
          : t(
              'factcheck_kept_many',
              "Fact check: you kept $1 sentences it couldn't match to your profile.",
              String(flagged.length),
            )
      }}
    </p>

    <div
      v-else-if="fc.status === 'done'"
      class="notice flex flex-col gap-2"
      role="alert"
      data-testid="fact-check-flags"
    >
      <p class="font-medium">
        {{
          checkable.length === 1
            ? t(
                'factcheck_flagged_one',
                'Fact check: $1 of $2 sentence isn’t backed by your profile.',
                String(flagged.length),
                String(checkable.length),
              )
            : t(
                'factcheck_flagged_many',
                'Fact check: $1 of $2 sentences aren’t backed by your profile.',
                String(flagged.length),
                String(checkable.length),
              )
        }}
      </p>
      <ul class="flex flex-col gap-1.5">
        <li v-for="c in flagged" :key="c.sentence">
          <q class="italic">{{ c.sentence }}</q>
          <span v-if="c.issue" class="block">{{ c.issue }}</span>
        </li>
      </ul>
      <div class="flex flex-wrap gap-2">
        <button class="btn btn-primary" type="button" @click="fix">
          {{ t('factcheck_fix', 'Fix it') }}
        </button>
        <button class="btn" type="button" @click="s.dismissFactCheck">
          {{ t('factcheck_keep', 'Keep anyway') }}
        </button>
      </div>
    </div>
  </div>
</template>
