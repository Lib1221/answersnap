<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { BRAND } from '@/config/brand';
import type { CaptureErrorCode, FieldInfo } from '@/storage/schema';
import CropThumb from '@/ui/CropThumb.vue';
import { useCapture } from './useCapture';

const { view, busy, snip, allowAllSites, cancelSelection } = useCapture();

const HIDDEN_TEXT_MIN = 20;
const shortcut = ref<string>(BRAND.shortcut);

const ERRORS: Record<CaptureErrorCode, string> = {
  RESTRICTED_PAGE:
    "Chrome doesn't let extensions read this page. Open the application form and try again.",
  NEEDS_GESTURE: `Press ${BRAND.shortcut} or click the ${BRAND.name} icon to snip on this page.`,
  CAPTURE_FAILED: "Couldn't take the screenshot. Try again.",
  INJECT_FAILED: "Couldn't start snipping on this page. Reload the page and try again.",
};

const KIND_NAMES: Record<FieldInfo['kind'], string> = {
  input: 'input',
  textarea: 'text box',
  contenteditable: 'editor',
  select: 'dropdown',
  'radio-group': 'choice',
  'checkbox-group': 'checkboxes',
};

const target = computed(() => {
  if (view.value.kind !== 'captured') return null;
  const f = view.value.capture.field;
  if (!f) return null;
  return f.label ? `"${f.label}" ${KIND_NAMES[f.kind]}` : KIND_NAMES[f.kind];
});

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape' && view.value.kind === 'selecting') void cancelSelection();
}

onMounted(async () => {
  window.addEventListener('keydown', onKey);
  const commands = await browser.commands.getAll();
  const snipCommand = commands.find((c) => c.name === 'snip-question');
  if (snipCommand?.shortcut) shortcut.value = snipCommand.shortcut;
});
onUnmounted(() => window.removeEventListener('keydown', onKey));

function openSettings() {
  void browser.runtime.openOptionsPage();
}
</script>

<template>
  <div class="flex min-h-screen flex-col">
    <header class="flex items-center justify-between border-b border-rule px-4 py-3">
      <h1 class="text-base font-[650]">{{ BRAND.name }}</h1>
      <button class="btn btn-quiet" type="button" @click="openSettings">Settings</button>
    </header>

    <main class="flex flex-1 flex-col gap-4 px-4 py-4">
      <section
        v-if="view.kind === 'idle'"
        class="flex flex-col items-start gap-3"
        data-state="idle"
      >
        <p>Snip a question to draft an answer.</p>
        <button class="btn btn-primary" type="button" :disabled="busy" @click="snip">
          Snip question
        </button>
        <p class="text-[13px] text-graphite-2">Shortcut: {{ shortcut }}</p>
      </section>

      <section
        v-else-if="view.kind === 'selecting'"
        class="flex flex-col items-start gap-3"
        data-state="selecting"
      >
        <p role="status">Select the question on the page. Esc cancels.</p>
        <button class="btn" type="button" @click="cancelSelection">Cancel</button>
      </section>

      <section v-else-if="view.kind === 'reading'" data-state="reading">
        <p role="status">Reading</p>
      </section>

      <section
        v-else-if="view.kind === 'error'"
        class="flex flex-col items-start gap-3"
        :data-state="`error-${view.code}`"
      >
        <p role="alert">{{ ERRORS[view.code] }}</p>
        <button
          v-if="view.code === 'NEEDS_GESTURE'"
          class="btn"
          type="button"
          @click="allowAllSites"
        >
          Allow snipping from the panel on all sites
        </button>
        <button
          v-else-if="view.code !== 'RESTRICTED_PAGE'"
          class="btn btn-primary"
          type="button"
          :disabled="busy"
          @click="snip"
        >
          Retry
        </button>
      </section>

      <section
        v-else-if="view.kind === 'captured'"
        class="flex flex-col gap-3"
        data-state="captured"
      >
        <CropThumb
          v-if="view.capture.image"
          :src="view.capture.image.dataUrl"
          alt="Snipped region"
          :width="view.capture.image.width"
          :height="view.capture.image.height"
        />
        <div class="rounded-none bg-canary px-3 py-2">
          <p class="whitespace-pre-wrap" data-testid="page-text">
            {{ view.capture.pageText || 'No text found in the selection.' }}
          </p>
        </div>
        <p
          v-if="view.capture.hiddenTextChars >= HIDDEN_TEXT_MIN"
          class="notice"
          data-testid="hidden-text"
        >
          This page has hidden text in the area you selected. It was left out.
        </p>
        <p class="text-[13px] text-graphite-2" data-testid="target">
          <template v-if="target">Target: {{ target }}</template>
          <template v-else
            >No text field found near the question. Copy the answer or pick a field.</template
          >
        </p>
        <div class="border-t border-rule pt-3">
          <button class="btn" type="button" :disabled="busy" @click="snip">Snip question</button>
        </div>
      </section>
    </main>
  </div>
</template>
