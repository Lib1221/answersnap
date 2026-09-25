<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { realTextLength } from '@/kb/normalize';
import { transcribeImage } from '@/kb/profileBuilder';
import { MIN_SITE_TEXT } from '@/kb/web';
import { sendToBackground } from '@/messaging/send';
import {
  captureStatusItem,
  pendingCaptureItem,
  pendingImportItem,
  readPendingImport,
  takePendingCapture,
} from '@/storage/items';
import type { PendingImport } from '@/storage/schema';
import { configuredProvider, describeError } from './aiProvider';
import ReviewText from './ReviewText.vue';
import { newSource, useSources } from './useSources';

// Review for "Import this page into AnswerSnap" (spec 3.7 steps 2 and 3).
const { add } = useSources();
const pending = ref<PendingImport | null>(null);
const text = ref('');
const busy = ref('');
const error = ref('');
const aiParts = ref(0);

const tooLittle = computed(
  () => pending.value !== null && realTextLength(text.value) < MIN_SITE_TEXT,
);

async function load() {
  const p = await readPendingImport();
  pending.value = p;
  text.value = p?.text ?? '';
  aiParts.value = 0;
}

/**
 * The menu click granted activeTab on that tab, so snipping from here works until the tab
 * navigates. The service worker brings the tab to the front for the snip.
 */
async function readWithAi() {
  if (!pending.value) return;
  error.value = '';
  const reply = await sendToBackground<'START_SNIP'>({
    type: 'START_SNIP',
    tabId: pending.value.tabId,
    mode: 'import',
  });
  if (!reply.ok) {
    error.value =
      reply.error === 'NEEDS_GESTURE'
        ? 'The page changed since you imported it. Right-click it and pick "Import this page into AnswerSnap" again.'
        : "Couldn't start snipping on that page.";
    return;
  }
  busy.value = 'Drag around the text on the page';
}

async function onImportSnip() {
  const capture = await takePendingCapture(['import']);
  if (!capture?.image) return;
  const me = await browser.tabs.getCurrent();
  if (me?.id !== undefined) void browser.tabs.update(me.id, { active: true });
  busy.value = 'Reading the snip';
  try {
    const { provider, settings } = await configuredProvider();
    const read = await transcribeImage(provider, settings.fastModel, capture.image.dataUrl);
    text.value = [aiParts.value === 0 && tooLittle.value ? '' : text.value, read]
      .filter((t) => t.trim())
      .join('\n\n');
    aiParts.value++;
  } catch (err) {
    error.value = describeError(err);
  } finally {
    busy.value = '';
  }
}

async function save(value: { label: string; text: string }) {
  if (!pending.value) return;
  await add(
    newSource(aiParts.value ? 'ai-transcript' : 'tab', value.label, value.text, {
      url: pending.value.url,
    }),
  );
  await discard();
}

async function discard() {
  await pendingImportItem.removeValue();
  pending.value = null;
}

const unwatch: (() => void)[] = [];
onMounted(() => {
  void load();
  unwatch.push(
    pendingImportItem.watch(() => void load()),
    pendingCaptureItem.watch((v) => {
      if (v) void onImportSnip();
    }),
    captureStatusItem.watch((s) => {
      if (s?.mode === 'import' && (s.state === 'cancelled' || s.state === 'error')) busy.value = '';
    }),
  );
});
onUnmounted(() => unwatch.forEach((u) => u()));

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
</script>

<template>
  <ReviewText
    v-if="pending"
    :title="`Page: ${pending.title || pending.url}`"
    :label="pending.title || hostOf(pending.url)"
    :text="text"
    :busy="!!busy"
    @save="save"
    @cancel="discard"
  >
    <p v-if="pending.failed && !aiParts" class="notice">
      Chrome doesn't let extensions read that page, or it didn't answer. Try again on the page
      itself.
    </p>
    <div
      v-else-if="tooLittle || aiParts"
      class="notice flex flex-col items-start gap-2"
      data-testid="tab-fallback"
    >
      <p v-if="!aiParts">
        This page shows almost no text to the browser. If its text is drawn inside a 3D scene or a
        canvas, AnswerSnap can read it from screenshots instead.
      </p>
      <p v-else>
        Read {{ aiParts }} {{ aiParts === 1 ? 'snip' : 'snips' }} with AI. Check the text before
        saving.
      </p>
      <button class="btn" type="button" :disabled="!!busy" @click="readWithAi">
        {{ aiParts ? 'Add more' : 'Read with AI' }}
      </button>
    </div>
    <p v-if="busy" role="status">{{ busy }}</p>
    <p v-if="error" class="notice" role="alert">{{ error }}</p>
  </ReviewText>
</template>
