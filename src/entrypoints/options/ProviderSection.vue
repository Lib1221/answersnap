<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import {
  API_KEY_LINKS,
  FALLBACK_MODELS,
  PROVIDER_NAMES,
  defaultModel,
  type ModelInfo,
} from '@/config/models';
import { LlmError } from '@/llm/errors';
import { createProvider } from '@/llm/provider';
import { getApiKey, getSettings, moveApiKeys, saveSettings, setApiKey } from '@/storage/items';
import type { Provider, Settings } from '@/storage/schema';

const settings = ref<Settings | null>(null);
const keyInput = ref('');
const testState = ref<'idle' | 'testing' | 'ok' | 'error'>('idle');
const testMessage = ref('');
const models = ref<ModelInfo[]>([]);
const showBaseUrl = import.meta.env.MODE !== 'production';

const provider = computed(() => settings.value?.provider ?? 'anthropic');
const modelOptions = computed(() =>
  models.value.length ? models.value : FALLBACK_MODELS[provider.value],
);

async function load() {
  settings.value = await getSettings();
  keyInput.value = (await getApiKey(settings.value.provider)) ?? '';
  models.value = [];
  testState.value = 'idle';
}

async function update(patch: Partial<Settings>) {
  settings.value = await saveSettings(patch);
}

async function switchProvider(next: Provider) {
  await update({
    provider: next,
    model: defaultModel(next, 'default'),
    fastModel: defaultModel(next, 'fast'),
  });
  keyInput.value = (await getApiKey(next)) ?? '';
  models.value = [];
  testState.value = 'idle';
}

async function saveKey() {
  if (!settings.value) return;
  await setApiKey(settings.value.provider, keyInput.value, settings.value.apiKeyStorage);
}

async function changeStorage(area: 'local' | 'session') {
  await update({ apiKeyStorage: area });
  await moveApiKeys(area);
}

/** Lists models: proves the key works and fills the dropdown without spending tokens. */
async function testKey() {
  if (!settings.value || !keyInput.value.trim()) return;
  testState.value = 'testing';
  testMessage.value = '';
  try {
    const list = await createProvider(
      settings.value.provider,
      keyInput.value.trim(),
      settings.value.baseUrl,
    ).listModels();
    await saveKey();
    models.value = list;
    testState.value = 'ok';
    testMessage.value = `The key works. ${list.length} models available.`;
    const ids = new Set(list.map((m) => m.id));
    if (ids.size && !ids.has(settings.value.model)) await update({ model: list[0]!.id });
  } catch (err) {
    testState.value = 'error';
    testMessage.value = err instanceof LlmError ? err.message : "Couldn't test the key. Try again.";
  }
}

onMounted(load);
</script>

<template>
  <section
    v-if="settings"
    id="provider"
    class="flex flex-col gap-5"
    aria-labelledby="provider-title"
  >
    <h2 id="provider-title" class="text-xl font-[650]">AI provider</h2>

    <fieldset class="flex flex-col gap-2">
      <legend class="mb-1 font-medium">Provider</legend>
      <label v-for="p in ['anthropic', 'gemini'] as const" :key="p" class="flex items-center gap-2">
        <input
          type="radio"
          name="provider"
          :value="p"
          :checked="provider === p"
          @change="switchProvider(p)"
        />
        {{ PROVIDER_NAMES[p]
        }}<span v-if="p === 'gemini'" class="text-graphite-2">(free tier available)</span>
      </label>
    </fieldset>

    <p v-if="provider === 'gemini'" class="notice" data-testid="gemini-privacy">
      On Gemini's free tier, Google may use what you send (your profile and the questions you snip)
      to improve its products. Use a paid key if that isn't OK for you.
    </p>

    <div class="flex flex-col gap-2">
      <label for="api-key" class="font-medium">API key</label>
      <div class="flex gap-2">
        <input
          id="api-key"
          v-model="keyInput"
          type="password"
          autocomplete="off"
          spellcheck="false"
          class="w-full max-w-md rounded-[6px] border border-rule bg-paper px-3 py-1.5"
          @change="saveKey"
        />
        <button
          class="btn"
          type="button"
          :disabled="testState === 'testing' || !keyInput"
          @click="testKey"
        >
          {{ testState === 'testing' ? 'Testing' : 'Test key' }}
        </button>
      </div>
      <p class="text-[13px] text-graphite-2">
        Get a key at
        <a
          class="text-ink underline"
          :href="API_KEY_LINKS[provider]"
          target="_blank"
          rel="noreferrer"
          >{{ API_KEY_LINKS[provider].replace('https://', '') }}</a
        >. Testing lists the available models and costs nothing.
      </p>
      <p
        v-if="testMessage"
        :class="testState === 'error' ? 'notice' : 'text-graphite-2'"
        role="status"
        data-testid="test-result"
      >
        {{ testMessage }}
      </p>
    </div>

    <fieldset class="flex flex-col gap-2">
      <legend class="mb-1 font-medium">Where to keep the key</legend>
      <label class="flex items-center gap-2">
        <input
          type="radio"
          name="key-storage"
          :checked="settings.apiKeyStorage === 'local'"
          @change="changeStorage('local')"
        />
        On this computer
      </label>
      <label class="flex items-center gap-2">
        <input
          type="radio"
          name="key-storage"
          :checked="settings.apiKeyStorage === 'session'"
          @change="changeStorage('session')"
        />
        Only until Chrome closes
      </label>
      <p class="text-[13px] text-graphite-2">
        The key is stored unencrypted in your Chrome profile, like most extension settings. It is
        never synced or exported.
      </p>
    </fieldset>

    <div class="grid max-w-md grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2">
      <label for="model" class="font-medium">Model</label>
      <select
        id="model"
        class="rounded-[6px] border border-rule bg-paper px-2 py-1.5"
        :value="settings.model"
        @change="update({ model: ($event.target as HTMLSelectElement).value })"
      >
        <option v-for="m in modelOptions" :key="m.id" :value="m.id">{{ m.displayName }}</option>
      </select>
      <label for="fast-model" class="font-medium">Fast model</label>
      <select
        id="fast-model"
        class="rounded-[6px] border border-rule bg-paper px-2 py-1.5"
        :value="settings.fastModel"
        @change="update({ fastModel: ($event.target as HTMLSelectElement).value })"
      >
        <option v-for="m in modelOptions" :key="m.id" :value="m.id">{{ m.displayName }}</option>
      </select>
    </div>
    <p class="text-[13px] text-graphite-2">
      The fast model summarizes long job posts and reads text from images.
    </p>

    <label v-if="provider === 'gemini'" class="flex items-center gap-2">
      <input
        type="checkbox"
        :checked="settings.geminiFreeTier"
        @change="update({ geminiFreeTier: ($event.target as HTMLInputElement).checked })"
      />
      I'm on the free tier (hide cost estimates)
    </label>

    <label class="flex items-start gap-2">
      <input
        type="checkbox"
        class="mt-1"
        :checked="settings.prewarmCache"
        @change="update({ prewarmCache: ($event.target as HTMLInputElement).checked })"
      />
      <span>
        Warm up the prompt cache when the side panel opens
        <span class="block text-[13px] text-graphite-2">
          Anthropic only. The first answer starts faster; costs a small cache write about once every
          few minutes of use.
        </span>
      </span>
    </label>

    <div v-if="showBaseUrl" class="flex flex-col gap-2">
      <label for="base-url" class="font-medium">API base URL (development only)</label>
      <input
        id="base-url"
        class="w-full max-w-md rounded-[6px] border border-rule bg-paper px-3 py-1.5"
        :value="settings.baseUrl ?? ''"
        placeholder="Provider default"
        @change="update({ baseUrl: ($event.target as HTMLInputElement).value.trim() || undefined })"
      />
    </div>
  </section>
</template>
