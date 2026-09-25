<script setup lang="ts">
import { nextTick, onMounted, ref } from 'vue';
import { STANDARD_ANSWER_FIELDS, type StandardAnswers } from '@/kb/profileSchema';
import { getStandardAnswers, saveStandardAnswers } from '@/storage/items';

const answers = ref<StandardAnswers | null>(null);
const saved = ref(false);

/** Deep link from a missing-info chip: #standard-answers?field=key or ?ask=question. */
async function followLink() {
  const query = new URLSearchParams(location.hash.split('?')[1] ?? '');
  const field = query.get('field');
  const ask = query.get('ask');
  if (!answers.value || (!field && !ask)) return;
  if (ask && !answers.value.custom.some((c) => c.question === ask)) {
    answers.value.custom.push({ id: crypto.randomUUID(), question: ask, answer: '' });
  }
  await nextTick();
  const target = field
    ? document.querySelector<HTMLInputElement>(`[data-testid="sa-${CSS.escape(field)}"]`)
    : document.querySelector<HTMLInputElement>(
        `[aria-label="Answer ${answers.value.custom.length}"]`,
      );
  target?.focus();
  target?.scrollIntoView({ block: 'center' });
}

onMounted(async () => {
  answers.value = await getStandardAnswers();
  await followLink();
});

async function save() {
  if (!answers.value) return;
  await saveStandardAnswers(answers.value);
  saved.value = true;
  setTimeout(() => (saved.value = false), 2000);
}

function addCustom() {
  answers.value?.custom.push({ id: crypto.randomUUID(), question: '', answer: '' });
}

const inputClass = 'w-full rounded-[6px] border border-rule bg-paper px-3 py-1.5';
</script>

<template>
  <section
    v-if="answers"
    id="standard-answers"
    class="flex flex-col gap-5"
    aria-labelledby="sa-title"
  >
    <div>
      <h2 id="sa-title" class="text-xl font-[650]">Standard answers</h2>
      <p class="text-graphite-2">
        Used when a form asks. Never guessed. Leave anything blank that you'd rather answer
        yourself.
      </p>
    </div>
    <form class="flex flex-col gap-5" @submit.prevent="save">
      <div class="grid gap-3 sm:grid-cols-2">
        <label v-for="f in STANDARD_ANSWER_FIELDS" :key="f.key" class="flex flex-col gap-1">
          <span class="text-[13px] text-graphite-2">{{ f.label }}</span>
          <input
            v-model="answers[f.key]"
            :class="inputClass"
            :placeholder="f.hint"
            :data-testid="`sa-${f.key}`"
          />
        </label>
      </div>

      <div class="flex flex-col gap-3">
        <h3 class="font-[650]">Your own questions</h3>
        <div
          v-for="(c, i) in answers.custom"
          :key="c.id"
          class="grid gap-2 border-l-2 border-rule pl-3 sm:grid-cols-[1fr_1fr_auto]"
        >
          <input
            v-model="c.question"
            :class="inputClass"
            placeholder="Question, e.g. Can you start within two weeks?"
            :aria-label="`Question ${i + 1}`"
          />
          <input
            v-model="c.answer"
            :class="inputClass"
            placeholder="Answer"
            :aria-label="`Answer ${i + 1}`"
          />
          <button class="btn btn-quiet" type="button" @click="answers.custom.splice(i, 1)">
            Remove
          </button>
        </div>
        <div><button class="btn" type="button" @click="addCustom">Add question</button></div>
      </div>

      <div class="flex items-center gap-3">
        <button class="btn btn-primary" type="submit">Save</button>
        <span v-if="saved" role="status" class="text-graphite-2">Saved</span>
      </div>
    </form>
  </section>
</template>
