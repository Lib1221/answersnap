<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue';
import { BRAND } from '@/config/brand';
import { hasCandidateData } from '@/kb/contextBuilder';
import { loadCandidateData } from '@/kb/candidate';
import { getApiKey, getSettings } from '@/storage/items';
import type { CaptureErrorCode } from '@/storage/schema';
import CropThumb from '@/ui/CropThumb.vue';
import AnswerPanel from './AnswerPanel.vue';
import JobBar from './JobBar.vue';
import LibraryTab from './LibraryTab.vue';
import ProfileTab from './ProfileTab.vue';
import { profileStatus } from './profileSummary';
import { pruneLibrary } from '@/kb/library';
import { prewarmIfNeeded } from './prewarm';
import { useAnswer } from './useAnswer';
import { useCapture } from './useCapture';
import { t } from '@/ui/i18n';
import { useInsert } from './useInsert';
import { useJob } from './useJob';

const { view, capture, jobCapture, status, busy, snip, allowAllSites, cancelSelection } =
  useCapture();
const answer = useAnswer();
const job = useJob();
const insert = useInsert(capture, answer);
const tab = ref<'answer' | 'library' | 'profile'>('answer');
const profileLine = ref<string | null>(null);

function useSaved(entry: import('@/kb/library').LibraryEntry) {
  tab.value = 'answer';
  void answer.reuse(entry);
}

// A new capture starts a draft right away; a job snip becomes the site's job context.
watch(
  () => capture.value?.id,
  async () => {
    const c = capture.value;
    if (!c) return;
    tab.value = 'answer';
    await job.setHost(c.page.hostname);
    void answer.run(c);
  },
);
watch(
  () => jobCapture.value?.id,
  () => {
    if (jobCapture.value) void job.fromCapture(jobCapture.value);
  },
);
// Job snip progress shows in the job bar.
watch(status, (s) => {
  if (s?.mode !== 'job') return;
  if (s.state === 'selecting') job.busy.value = 'Drag around the job post. Esc cancels.';
  else if (s.state === 'cancelled' || s.state === 'error') job.busy.value = '';
});

async function detectHost() {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (tab?.url?.startsWith('http')) await job.setHost(new URL(tab.url).hostname);
}

/** What the idle state asks for first (spec 13.2): an API key, then candidate data. */
const readiness = ref<'ready' | 'needs-key' | 'needs-profile' | 'unknown'>('unknown');
async function checkReadiness() {
  const settings = await getSettings();
  if (!(await getApiKey(settings.provider))) readiness.value = 'needs-key';
  const data = await loadCandidateData();
  profileLine.value = profileStatus(data);
  if (readiness.value === 'needs-key') return;
  if (!hasCandidateData(data)) readiness.value = 'needs-profile';
  else readiness.value = 'ready';
}

const HIDDEN_TEXT_MIN = 20;
const shortcut = ref<string>(BRAND.shortcut);

const ERRORS: Record<CaptureErrorCode, string> = {
  RESTRICTED_PAGE:
    "Chrome doesn't let extensions read this page. Open the application form and try again.",
  NEEDS_GESTURE: `Press ${BRAND.shortcut} or click the ${BRAND.name} icon to snip on this page.`,
  CAPTURE_FAILED: "Couldn't take the screenshot. Try again.",
  INJECT_FAILED: "Couldn't start snipping on this page. Reload the page and try again.",
};

function onKey(e: KeyboardEvent) {
  // Ctrl+Enter inserts (spec 13.2).
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && insert.canInsert.value) {
    e.preventDefault();
    void insert.insert('replace');
    return;
  }
  if (e.key !== 'Escape') return;
  if (status.value?.state === 'selecting') void cancelSelection();
  else if (['drafting', 'streaming'].includes(answer.phase.value)) answer.stop();
}

onMounted(async () => {
  window.addEventListener('keydown', onKey);
  window.addEventListener('focus', checkReadiness);
  void checkReadiness();
  void prewarmIfNeeded();
  void getSettings().then((st) => pruneLibrary(st.history.retentionDays));
  void detectHost();
  const commands = await browser.commands.getAll();
  const snipCommand = commands.find((c) => c.name === 'snip-question');
  if (snipCommand?.shortcut) shortcut.value = snipCommand.shortcut;
});
onUnmounted(() => {
  window.removeEventListener('keydown', onKey);
  window.removeEventListener('focus', checkReadiness);
});

function openSettings(section?: string) {
  if (!section) return void browser.runtime.openOptionsPage();
  void browser.tabs.create({ url: browser.runtime.getURL(`/options.html#${section}`) });
}
</script>

<template>
  <div class="flex min-h-screen flex-col">
    <header class="flex items-start justify-between gap-2 border-b border-rule px-4 py-3">
      <div class="min-w-0">
        <h1 class="text-base font-[650]">{{ BRAND.name }}</h1>
        <p
          v-if="profileLine"
          class="truncate text-[13px] text-graphite-2"
          data-testid="profile-line"
        >
          {{ profileLine }}
        </p>
      </div>
      <button class="btn btn-quiet" type="button" @click="openSettings()">Settings</button>
    </header>

    <JobBar :state="job" />
    <nav class="flex gap-1 border-b border-rule px-3" role="tablist" aria-label="Panel">
      <button
        v-for="tb in [
          ['answer', 'Answer'],
          ['library', 'Library'],
          ['profile', 'Profile'],
        ] as const"
        :key="tb[0]"
        role="tab"
        type="button"
        class="border-b-2 px-2 py-1.5 text-[13px]"
        :class="
          tab === tb[0]
            ? 'border-ink font-medium text-graphite'
            : 'border-transparent text-graphite-2'
        "
        :aria-selected="tab === tb[0]"
        @click="tab = tb[0]"
      >
        {{ tb[1] }}
      </button>
    </nav>
    <main v-if="tab === 'library'" class="flex flex-1 flex-col gap-4 px-4 py-4">
      <LibraryTab :can-use="view.kind === 'captured'" @use="useSaved" />
    </main>
    <main v-else-if="tab === 'profile'" class="flex flex-1 flex-col gap-4 px-4 py-4">
      <ProfileTab @open-settings="openSettings" />
    </main>
    <main v-else class="flex flex-1 flex-col gap-4 px-4 py-4">
      <section
        v-if="view.kind === 'idle'"
        class="flex flex-col items-start gap-3"
        data-state="idle"
      >
        <template v-if="readiness === 'needs-key'">
          <p>{{ t('panelNeedsKey', 'Add your API key to start.') }}</p>
          <button class="btn btn-primary" type="button" @click="openSettings('provider')">
            Open settings
          </button>
        </template>
        <template v-else-if="readiness === 'needs-profile'">
          <p>
            {{ t('panelNeedsProfile', 'Add your resume so answers have something to draw from.') }}
          </p>
          <button class="btn btn-primary" type="button" @click="openSettings('sources')">
            Add resume
          </button>
        </template>
        <template v-else>
          <p>{{ t('panelIdle', 'Snip a question to draft an answer.') }}</p>
          <button class="btn btn-primary" type="button" :disabled="busy" @click="snip">
            Snip question
          </button>
          <p class="text-[13px] text-graphite-2">Shortcut: {{ shortcut }}</p>
        </template>
      </section>

      <section
        v-else-if="view.kind === 'selecting'"
        class="flex flex-col items-start gap-3"
        data-state="selecting"
      >
        <p role="status">
          {{ t('panelSelecting', 'Select the question on the page. Esc cancels.') }}
        </p>
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
        <AnswerPanel :state="answer" :insert="insert" @open-settings="openSettings" />
        <div class="border-t border-rule pt-3">
          <button class="btn" type="button" :disabled="busy" @click="snip">Snip question</button>
        </div>
      </section>
    </main>
  </div>
</template>
