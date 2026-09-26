<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import {
  API_KEY_LINKS,
  FALLBACK_CHAINS,
  FALLBACK_MODELS,
  PROVIDER_NAMES,
  defaultModel,
  shortModelName,
  type ModelInfo,
} from '@/config/models';
import { LlmError } from '@/llm/errors';
import { storageCooldowns, watchCooldowns } from '@/llm/fallback';
import { NO_KEY_NEEDED } from '@/llm/openaiCompat';
import { createProvider, providerBaseUrl } from '@/llm/provider';
import { getApiKey, getSettings, moveApiKeys, saveSettings, setApiKey } from '@/storage/items';
import type { Provider, Settings } from '@/storage/schema';

const settings = ref<Settings | null>(null);
const keyInput = ref('');
const testState = ref<'idle' | 'testing' | 'ok' | 'error'>('idle');
const testMessage = ref('');
const models = ref<ModelInfo[]>([]);
const showBaseUrl = import.meta.env.MODE !== 'production';

const provider = computed(() => settings.value?.provider ?? 'anthropic');
/** Ollama runs locally: an address instead of a key. */
const needsKey = computed(() => provider.value !== 'ollama');
const PROVIDERS: { id: Provider; note: string }[] = [
  { id: 'anthropic', note: '' },
  { id: 'gemini', note: '(free tier available)' },
  { id: 'openrouter', note: '(Claude, GPT, Llama, and more with one key)' },
  { id: 'ollama', note: '(free and private: nothing leaves your computer)' },
];
const modelOptions = computed(() =>
  models.value.length ? models.value : FALLBACK_MODELS[provider.value],
);

async function load() {
  settings.value = await getSettings();
  keyInput.value = keyFor(await getApiKey(settings.value.provider));
  models.value = [];
  testState.value = 'idle';
}

function keyFor(stored: string | null): string {
  return stored && stored !== NO_KEY_NEEDED ? stored : '';
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
  keyInput.value = keyFor(await getApiKey(next));
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
  if (!settings.value) return;
  const key = needsKey.value ? keyInput.value.trim() : NO_KEY_NEEDED;
  if (!key) return;
  testState.value = 'testing';
  testMessage.value = '';
  try {
    if (provider.value === 'ollama') {
      // Asked for inside the click: lets the extension reach the user's own Ollama server.
      const url = new URL(settings.value.ollamaUrl);
      await browser.permissions
        .request({ origins: [`${url.protocol}//${url.hostname}/*`] })
        .catch(() => false);
    }
    const list = await createProvider(
      settings.value.provider,
      key,
      providerBaseUrl(settings.value),
    ).listModels();
    if (needsKey.value) await saveKey();
    // Recommended models first, then the rest in the provider's order.
    const preferred = FALLBACK_MODELS[settings.value.provider].map((m) => m.id);
    const rank = (id: string) =>
      preferred.includes(id) ? preferred.indexOf(id) : preferred.length;
    models.value = [...list].sort((a, b) => rank(a.id) - rank(b.id));
    testState.value = 'ok';
    testMessage.value = needsKey.value
      ? `The key works. ${list.length} models available.`
      : list.length
        ? `Connected to Ollama. ${list.length} ${list.length === 1 ? 'model' : 'models'} installed.`
        : 'Connected to Ollama, but no models are installed yet. Run "ollama pull llama3.2" first.';
    const ids = list.map((m) => m.id);
    const pick = (current: string, role: 'default' | 'fast') => {
      if (!ids.length || ids.includes(current)) return current;
      const fallback = defaultModel(settings.value!.provider, role);
      return ids.includes(fallback) ? fallback : ids[0]!;
    };
    await update({
      availableModels: ids,
      model: pick(settings.value.model, 'default'),
      fastModel: pick(settings.value.fastModel, 'fast'),
    });
  } catch (err) {
    testState.value = 'error';
    testMessage.value = err instanceof LlmError ? err.message : "Couldn't test the key. Try again.";
  }
}

// Automatic fallback: which models are resting after a quota error, and until when.
const cooling = ref<Record<string, number>>({});
const chain = computed(() => {
  const s = settings.value;
  if (!s) return [];
  const answer = FALLBACK_CHAINS[s.provider].answer;
  const ordered = [s.model, ...answer.filter((m) => m !== s.model)];
  return s.availableModels.length
    ? ordered.filter((m) => m === s.model || s.availableModels.includes(m))
    : ordered;
});

async function loadCooldowns() {
  cooling.value = await storageCooldowns.get();
}

function coolingLabel(model: string): string {
  const until = cooling.value[model];
  if (!until) return 'Ready';
  const mins = Math.round((until - Date.now()) / 60_000);
  return mins < 2
    ? 'Resting for a minute'
    : `Limit reached, back in ${mins < 90 ? `${mins} min` : `${Math.round(mins / 60)} h`}`;
}

let stopWatch: (() => void) | null = null;
onMounted(() => {
  void load();
  void loadCooldowns();
  stopWatch = watchCooldowns(() => void loadCooldowns());
});
onUnmounted(() => stopWatch?.());
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
      <label v-for="p in PROVIDERS" :key="p.id" class="flex items-center gap-2">
        <input
          type="radio"
          name="provider"
          :value="p.id"
          :checked="provider === p.id"
          @change="switchProvider(p.id)"
        />
        {{ PROVIDER_NAMES[p.id] }}
        <span v-if="p.note" class="text-graphite-2">{{ p.note }}</span>
      </label>
    </fieldset>

    <p v-if="provider === 'gemini'" class="notice" data-testid="gemini-privacy">
      On Gemini's free tier, Google may use what you send (your profile and the questions you snip)
      to improve its products. Use a paid key if that isn't OK for you.
    </p>

    <p v-if="provider === 'openrouter'" class="notice" data-testid="openrouter-privacy">
      OpenRouter passes what you send (your profile and the questions you snip) to the company that
      runs the model you pick. Check that model's data policy on openrouter.ai.
    </p>

    <div v-if="!needsKey" class="flex flex-col gap-2" data-testid="ollama-setup">
      <label for="ollama-url" class="font-medium">Ollama address</label>
      <div class="flex gap-2">
        <input
          id="ollama-url"
          class="w-full max-w-md field-input px-3 py-1.5"
          :value="settings.ollamaUrl"
          spellcheck="false"
          @change="update({ ollamaUrl: ($event.target as HTMLInputElement).value.trim() })"
        />
        <button
          class="btn"
          type="button"
          :disabled="testState === 'testing'"
          data-testid="ollama-connect"
          @click="testKey"
        >
          {{ testState === 'testing' ? 'Connecting' : 'Connect' }}
        </button>
      </div>
      <p class="text-[13px] text-graphite-2">
        Install Ollama from
        <a
          class="text-ink underline"
          href="https://ollama.com/download"
          target="_blank"
          rel="noreferrer"
          >ollama.com/download</a
        >, pull a model (<code>ollama pull llama3.2</code>), and start it so extensions may use it:
        <code class="kbd">OLLAMA_ORIGINS=chrome-extension://* ollama serve</code>. Answers never
        leave your computer. Small models write weaker answers than cloud ones.
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

    <div v-if="needsKey" class="flex flex-col gap-2">
      <label for="api-key" class="font-medium">API key</label>
      <div class="flex gap-2">
        <input
          id="api-key"
          v-model="keyInput"
          type="password"
          autocomplete="off"
          spellcheck="false"
          class="w-full max-w-md field-input px-3 py-1.5"
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

    <fieldset v-if="needsKey" class="flex flex-col gap-2">
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
        class="field-input px-2 py-1.5"
        :value="settings.model"
        @change="update({ model: ($event.target as HTMLSelectElement).value })"
      >
        <option v-for="m in modelOptions" :key="m.id" :value="m.id">{{ m.displayName }}</option>
      </select>
      <label for="fast-model" class="font-medium">Fast model</label>
      <select
        id="fast-model"
        class="field-input px-2 py-1.5"
        :value="settings.fastModel"
        @change="update({ fastModel: ($event.target as HTMLSelectElement).value })"
      >
        <option v-for="m in modelOptions" :key="m.id" :value="m.id">{{ m.displayName }}</option>
      </select>
    </div>
    <p class="text-[13px] text-graphite-2">
      The fast model summarizes long job posts and reads text from images.
    </p>

    <div v-if="provider === 'gemini'" class="flex flex-col gap-2" data-testid="fallback">
      <label class="flex items-start gap-2">
        <input
          type="checkbox"
          class="mt-1"
          :checked="settings.autoFallback"
          @change="update({ autoFallback: ($event.target as HTMLInputElement).checked })"
        />
        <span>
          When a model hits its free limit, switch to the next one automatically
          <span class="block text-[13px] text-graphite-2">
            Each Gemini model has its own free quota (about 20 answers a day), so switching gives
            you several times more.
          </span>
        </span>
      </label>
      <ol
        v-if="settings.autoFallback"
        class="ml-6 flex flex-col gap-0.5 text-[13px]"
        data-testid="fallback-chain"
      >
        <li v-for="(m, i) in chain" :key="m" class="flex gap-2 tabular-nums">
          <span class="text-graphite-2">{{ i + 1 }}.</span>
          <span>{{ shortModelName(m) }}</span>
          <span :class="cooling[m] ? 'text-carbon-pink-text' : 'text-graphite-2'">{{
            coolingLabel(m)
          }}</span>
        </li>
      </ol>
    </div>

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
        class="w-full max-w-md field-input px-3 py-1.5"
        :value="settings.baseUrl ?? ''"
        placeholder="Provider default"
        @change="update({ baseUrl: ($event.target as HTMLInputElement).value.trim() || undefined })"
      />
    </div>
  </section>
</template>
