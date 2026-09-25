<script setup lang="ts">
import { onMounted, ref } from 'vue';
import {
  applyImport,
  buildExport,
  deleteAllData,
  describeImport,
  parseImport,
  type ExportData,
} from '@/storage/exportImport';
import { getSettings, lastRequestItem, saveSettings } from '@/storage/items';
import type { Settings } from '@/storage/schema';

const settings = ref<Settings | null>(null);
const lastRequest = ref<Awaited<ReturnType<typeof lastRequestItem.getValue>>>(null);
const showRequest = ref(false);
const importData = ref<ExportData | null>(null);
const importError = ref('');
const status = ref('');
const confirmDelete = ref(false);

onMounted(async () => {
  settings.value = await getSettings();
  lastRequest.value = await lastRequestItem.getValue();
});

async function update(patch: Partial<Settings>) {
  settings.value = await saveSettings(patch);
}

async function exportAll() {
  const data = await buildExport();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `answersnap-export-${data.exportedAt.slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  status.value = 'Exported. The file has no API keys.';
}

async function pickImport(e: Event) {
  importError.value = '';
  importData.value = null;
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  const parsed = parseImport(await file.text());
  if (parsed.ok) importData.value = parsed.data;
  else importError.value = parsed.error;
}

async function confirmImport() {
  if (!importData.value) return;
  await applyImport(importData.value);
  importData.value = null;
  settings.value = await getSettings();
  status.value = 'Imported.';
}

async function deleteEverything() {
  await deleteAllData();
  confirmDelete.value = false;
  // Start over from the checklist with fresh state.
  location.hash = '#welcome';
  location.reload();
}
</script>

<template>
  <section v-if="settings" id="privacy" class="flex flex-col gap-6" aria-labelledby="privacy-title">
    <div>
      <h2 id="privacy-title" class="text-xl font-[650]">Privacy</h2>
      <p class="text-graphite-2">
        Everything stays in this browser. Only the AI provider you picked receives your questions
        and candidate data, and only when you snip, build your profile, or import with AI.
      </p>
    </div>

    <label class="flex items-start gap-2">
      <input
        type="checkbox"
        class="mt-1"
        :checked="settings.sendScreenshot"
        @change="update({ sendScreenshot: ($event.target as HTMLInputElement).checked })"
      />
      <span>
        Send a screenshot of the snipped area
        <span class="block text-[13px] text-graphite-2"
          >Off means text only. Answers can be worse when the question is an image or uses
          layout.</span
        >
      </span>
    </label>
    <label class="flex items-start gap-2">
      <input
        type="checkbox"
        class="mt-1"
        :checked="settings.contextPadding"
        @change="update({ contextPadding: ($event.target as HTMLInputElement).checked })"
      />
      <span>
        Include a little context around the snip
        <span class="block text-[13px] text-graphite-2"
          >48 px around your selection, with the selection outlined.</span
        >
      </span>
    </label>

    <fieldset class="flex flex-col gap-2">
      <legend class="mb-1 font-medium">Saved answers</legend>
      <label class="flex items-center gap-2">
        <input
          type="checkbox"
          :checked="settings.history.enabled"
          @change="
            update({
              history: {
                ...settings.history,
                enabled: ($event.target as HTMLInputElement).checked,
              },
            })
          "
        />
        Save answers when I insert or copy them
      </label>
      <label class="flex items-center gap-2">
        Keep them for
        <input
          type="number"
          min="1"
          class="w-20 field-input px-2 py-1"
          :value="settings.history.retentionDays"
          data-testid="retention-days"
          @change="
            update({
              history: {
                ...settings.history,
                retentionDays: Math.max(
                  1,
                  Number(($event.target as HTMLInputElement).value) || 180,
                ),
              },
            })
          "
        />
        days. Pinned answers are kept.
      </label>
    </fieldset>

    <div class="flex flex-col gap-2">
      <h3 class="font-medium">What gets sent</h3>
      <p class="text-[13px] text-graphite-2">
        Per answer: the snipped screenshot (unless turned off), the visible text in it, the field's
        label and limits, the page title and site, the job post if you set one, similar saved
        answers, and your candidate data.
      </p>
      <button
        v-if="lastRequest"
        class="btn self-start"
        type="button"
        @click="showRequest = !showRequest"
      >
        {{ showRequest ? 'Hide the last request' : 'Show the last request' }}
      </button>
      <p v-else class="text-[13px] text-graphite-2">
        Nothing has been sent in this browser session.
      </p>
      <pre
        v-if="showRequest && lastRequest"
        class="max-h-96 overflow-auto whitespace-pre-wrap bg-canary p-3 text-[12px]"
        data-testid="last-request"
        >{{ JSON.stringify(lastRequest, null, 2) }}</pre>
    </div>

    <div class="flex flex-col gap-2">
      <h3 class="font-medium">Export and import</h3>
      <div class="flex flex-wrap items-center gap-2">
        <button class="btn" type="button" @click="exportAll">Export all data</button>
        <label class="btn cursor-pointer">
          Import a file
          <input
            type="file"
            accept="application/json,.json"
            class="sr-only"
            data-testid="import-input"
            @change="pickImport"
          />
        </label>
      </div>
      <p v-if="importError" class="notice" role="alert">{{ importError }}</p>
      <div
        v-if="importData"
        class="flex flex-col gap-2 border-l-2 border-ink pl-3"
        data-testid="import-summary"
      >
        <p class="font-medium">This replaces your current data with:</p>
        <ul class="list-inside list-disc">
          <li v-for="line in describeImport(importData)" :key="line">{{ line }}</li>
        </ul>
        <div class="flex gap-2">
          <button class="btn btn-primary" type="button" @click="confirmImport">
            Replace my data
          </button>
          <button class="btn" type="button" @click="importData = null">Cancel</button>
        </div>
      </div>
    </div>

    <div class="flex flex-col gap-2">
      <h3 class="font-medium">Delete all data</h3>
      <p class="text-[13px] text-graphite-2">
        Removes your API keys, sources, profile, standard answers, saved answers, and settings, and
        gives back every site permission. Uninstalling the extension does the same.
      </p>
      <button
        v-if="!confirmDelete"
        class="btn self-start"
        type="button"
        @click="confirmDelete = true"
      >
        Delete all data
      </button>
      <div v-else class="notice flex flex-col items-start gap-2" role="alert">
        <p>This can't be undone. Export first if you might want it back.</p>
        <div class="flex gap-2">
          <button class="btn btn-primary" type="button" @click="deleteEverything">
            Delete everything
          </button>
          <button class="btn" type="button" @click="confirmDelete = false">Cancel</button>
        </div>
      </div>
    </div>
    <p v-if="status" role="status" class="text-graphite-2">{{ status }}</p>
  </section>
</template>
