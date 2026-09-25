<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { DEFAULT_STYLE_RULES } from '@/config/defaults';
import { getSettings, saveSettings } from '@/storage/items';
import type { LengthPref, Settings, Tone } from '@/storage/schema';

const settings = ref<Settings | null>(null);
const rulesText = ref('');
const saved = ref(false);

const TONES: { value: Tone; label: string }[] = [
  { value: 'professional', label: 'Professional' },
  { value: 'friendly', label: 'Friendly' },
  { value: 'concise', label: 'Concise' },
];
const LENGTHS: { value: LengthPref; label: string; hint: string }[] = [
  {
    value: 'auto',
    label: 'Auto',
    hint: 'One or two sentences for short fields, about 120 words for text boxes',
  },
  { value: 'short', label: 'Short', hint: '40 to 70 words' },
  { value: 'medium', label: 'Medium', hint: '100 to 160 words' },
  { value: 'long', label: 'Long', hint: '200 to 300 words' },
];

onMounted(async () => {
  settings.value = await getSettings();
  rulesText.value = settings.value.styleRules.join('\n');
});

async function update(patch: Partial<Settings>) {
  settings.value = await saveSettings(patch);
  saved.value = true;
  setTimeout(() => (saved.value = false), 2000);
}

async function saveRules() {
  await update({
    styleRules: rulesText.value
      .split('\n')
      .map((r) => r.trim())
      .filter(Boolean),
  });
}

async function resetRules() {
  rulesText.value = DEFAULT_STYLE_RULES.join('\n');
  await saveRules();
}

const inputClass = 'field-input px-2 py-1.5';
</script>

<template>
  <section
    v-if="settings"
    id="writing-style"
    class="flex flex-col gap-6"
    aria-labelledby="style-title"
  >
    <div>
      <h2 id="style-title" class="text-xl font-[650]">Writing style</h2>
      <p class="text-graphite-2">
        How answers should sound. Limits on the page always win over these.
      </p>
    </div>

    <fieldset class="flex flex-col gap-1">
      <legend class="mb-1 font-medium">Tone</legend>
      <label v-for="t in TONES" :key="t.value" class="flex items-center gap-2">
        <input
          type="radio"
          name="tone"
          :checked="settings.tone === t.value"
          @change="update({ tone: t.value })"
        />
        {{ t.label }}
      </label>
    </fieldset>

    <fieldset class="flex flex-col gap-1">
      <legend class="mb-1 font-medium">Length</legend>
      <label v-for="l in LENGTHS" :key="l.value" class="flex items-center gap-2">
        <input
          type="radio"
          name="length"
          :checked="settings.length === l.value"
          @change="update({ length: l.value })"
        />
        {{ l.label }} <span class="text-[13px] text-graphite-2">{{ l.hint }}</span>
      </label>
    </fieldset>

    <fieldset class="flex flex-col gap-2" data-testid="fact-check-settings">
      <legend class="mb-1 font-medium">Fact check</legend>
      <label class="flex items-start gap-2">
        <input
          type="checkbox"
          class="mt-1"
          :checked="settings.factCheck"
          @change="update({ factCheck: ($event.target as HTMLInputElement).checked })"
        />
        <span>
          Check every answer against my profile
          <span class="block text-[13px] text-graphite-2">
            A second, quick request flags any sentence your resume, sources, or standard answers
            don't back up.
          </span>
        </span>
      </label>
      <label v-if="settings.factCheck" class="ml-6 flex items-center gap-2">
        Check with
        <select
          class="field-input px-2 py-1"
          :value="settings.factCheckModel"
          @change="
            update({
              factCheckModel: ($event.target as HTMLSelectElement).value as 'fast' | 'main',
            })
          "
        >
          <option value="fast">the fast model (cheaper, separate free quota)</option>
          <option value="main">the answer model (stricter)</option>
        </select>
      </label>
    </fieldset>

    <label class="flex max-w-md flex-col gap-1">
      <span class="font-medium">Answer language</span>
      <input
        :class="inputClass"
        :value="settings.answerLanguage === 'auto' ? '' : settings.answerLanguage"
        placeholder="Same as the question"
        data-testid="answer-language"
        @change="
          update({ answerLanguage: ($event.target as HTMLInputElement).value.trim() || 'auto' })
        "
      />
    </label>

    <label class="flex flex-col gap-1">
      <span class="font-medium">Style rules</span>
      <span class="text-[13px] text-graphite-2"
        >One rule per line. They go into every request.</span
      >
      <textarea v-model="rulesText" rows="11" :class="inputClass" data-testid="style-rules" />
    </label>
    <div class="flex items-center gap-2">
      <button class="btn btn-primary" type="button" @click="saveRules">Save rules</button>
      <button class="btn btn-quiet" type="button" @click="resetRules">Reset to defaults</button>
      <span v-if="saved" role="status" class="text-graphite-2">Saved</span>
    </div>
  </section>
</template>
