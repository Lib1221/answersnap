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
import FormFillTab from './FormFillTab.vue';
import JobTab from './JobTab.vue';
import LibraryTab from './LibraryTab.vue';
import { useFormFill } from './useFormFill';
import ProfileTab from './ProfileTab.vue';
import { profileStatus } from './profileSummary';
import { pruneLibrary } from '@/kb/library';
import { prewarmIfNeeded } from './prewarm';
import { useAnswer } from './useAnswer';
import { useCapture } from './useCapture';
import { t } from '@/ui/i18n';
import Credit from '@/ui/AppCredit.vue';
import Icon, { type IconName } from '@/ui/AppIcon.vue';
import LogoMark from '@/ui/LogoMark.vue';
import { useInsert } from './useInsert';
import { useJob } from './useJob';
import { useInterview } from './useInterview';
import { useJobFit } from './useJobFit';
import { useLetter } from './useLetter';

const { view, capture, jobCapture, status, busy, snip, allowAllSites, cancelSelection } =
  useCapture();
const answer = useAnswer();
const job = useJob();
const insert = useInsert(capture, answer);
const form = useFormFill();
const letter = useLetter(job);
const fit = useJobFit(job);
const interview = useInterview(job);
// A scan from the "Fill this form" menu opens the Form tab.
watch(
  () => form.fields.value,
  (f) => {
    if (f.length) tab.value = 'form';
  },
);
type TabId = 'answer' | 'job' | 'form' | 'library' | 'profile';
const tab = ref<TabId>('answer');
const TABS: { id: TabId; label: string; icon: IconName }[] = [
  { id: 'answer', label: 'Answer', icon: 'sparkle' },
  { id: 'job', label: 'Job', icon: 'briefcase' },
  { id: 'form', label: 'Form', icon: 'form' },
  { id: 'library', label: 'Library', icon: 'bookmark' },
  { id: 'profile', label: 'Profile', icon: 'user' },
];
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
  else if (['drafting', 'streaming'].includes(letter.answer.phase.value)) letter.answer.stop();
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
  <div class="flex min-h-screen flex-col bg-surface">
    <header
      class="sticky top-0 z-10 flex items-center gap-2.5 border-b border-rule bg-paper px-4 py-3"
    >
      <LogoMark :size="30" />
      <div class="min-w-0 flex-1">
        <h1 class="text-[15px] leading-tight font-[650]">{{ BRAND.name }}</h1>
        <p
          v-if="profileLine"
          class="flex items-center gap-1.5 truncate text-[12px] text-graphite-2"
          data-testid="profile-line"
        >
          <span class="h-1.5 w-1.5 shrink-0 rounded-full bg-success" aria-hidden="true" />
          {{ profileLine }}
        </p>
      </div>
      <button
        class="btn btn-icon"
        type="button"
        aria-label="Settings"
        title="Settings"
        @click="openSettings()"
      >
        <Icon name="settings" :size="18" />
      </button>
    </header>

    <JobBar :state="job" />

    <nav class="px-3 pt-3" aria-label="Panel">
      <div class="grid grid-cols-5 gap-1 rounded-[10px] bg-rule/60 p-1" role="tablist">
        <button
          v-for="tb in TABS"
          :key="tb.id"
          role="tab"
          type="button"
          class="flex items-center justify-center gap-1 rounded-[8px] py-1.5 text-[12px] font-medium transition-colors"
          :class="
            tab === tb.id
              ? 'bg-paper text-graphite shadow-[var(--shadow-sm)]'
              : 'text-graphite-2 hover:text-graphite'
          "
          :aria-selected="tab === tb.id"
          @click="tab = tb.id"
        >
          <Icon :name="tb.icon" :size="14" />
          {{ tb.label }}
        </button>
      </div>
    </nav>

    <main v-if="tab === 'library'" class="flex flex-1 flex-col gap-4 px-4 py-4">
      <LibraryTab :can-use="view.kind === 'captured'" @use="useSaved" />
    </main>
    <main v-else-if="tab === 'job'" class="flex flex-1 flex-col gap-3 px-4 py-4">
      <JobTab
        :job="job"
        :letter="letter"
        :fit="fit"
        :interview="interview"
        @open-settings="openSettings"
      />
    </main>
    <main v-else-if="tab === 'form'" class="flex flex-1 flex-col gap-4 px-4 py-4">
      <FormFillTab :state="form" />
    </main>
    <main v-else-if="tab === 'profile'" class="flex flex-1 flex-col gap-4 px-4 py-4">
      <ProfileTab @open-settings="openSettings" />
    </main>
    <main v-else class="flex flex-1 flex-col gap-3 px-4 py-4">
      <section
        v-if="view.kind === 'idle'"
        class="card flex flex-col items-center gap-3 px-5 py-8 text-center"
        data-state="idle"
      >
        <div class="flex h-14 w-14 items-center justify-center rounded-2xl bg-ink-soft text-ink">
          <Icon
            :name="
              readiness === 'needs-key' ? 'key' : readiness === 'needs-profile' ? 'file' : 'snip'
            "
            :size="26"
          />
        </div>
        <template v-if="readiness === 'needs-key'">
          <h2 class="text-[15px] font-[650]">Connect your AI</h2>
          <p class="text-graphite-2">{{ t('panelNeedsKey', 'Add your API key to start.') }}</p>
          <button class="btn btn-primary" type="button" @click="openSettings('provider')">
            <Icon name="key" /> Open settings
          </button>
        </template>
        <template v-else-if="readiness === 'needs-profile'">
          <h2 class="text-[15px] font-[650]">Add your resume</h2>
          <p class="text-graphite-2">
            {{ t('panelNeedsProfile', 'Add your resume so answers have something to draw from.') }}
          </p>
          <button class="btn btn-primary" type="button" @click="openSettings('sources')">
            <Icon name="file" /> Add resume
          </button>
        </template>
        <template v-else>
          <h2 class="text-[15px] font-[650]">Ready when you are</h2>
          <p class="text-graphite-2">{{ t('panelIdle', 'Snip a question to draft an answer.') }}</p>
          <button class="btn btn-primary px-4" type="button" :disabled="busy" @click="snip">
            <Icon name="snip" /> Snip question
          </button>
          <p class="text-[12.5px] text-graphite-2">
            or press <kbd class="kbd">{{ shortcut }}</kbd> on the page
          </p>
          <button class="btn btn-quiet text-[12.5px]" type="button" @click="tab = 'form'">
            <Icon name="form" :size="14" /> Or fill the whole form at once
          </button>
        </template>
      </section>

      <section
        v-else-if="view.kind === 'selecting'"
        class="card flex flex-col items-center gap-3 px-5 py-8 text-center"
        data-state="selecting"
      >
        <div class="flex h-14 w-14 items-center justify-center rounded-2xl bg-ink-soft text-ink">
          <Icon name="target" :size="26" />
        </div>
        <p role="status" class="font-medium">
          {{ t('panelSelecting', 'Select the question on the page. Esc cancels.') }}
        </p>
        <button class="btn" type="button" @click="cancelSelection">Cancel</button>
      </section>

      <section
        v-else-if="view.kind === 'reading'"
        class="card flex flex-col gap-2.5 p-4"
        data-state="reading"
      >
        <p role="status" class="eyebrow">Reading</p>
        <div class="h-3 w-4/5 animate-pulse rounded bg-rule" />
        <div class="h-3 w-3/5 animate-pulse rounded bg-rule" />
      </section>

      <section
        v-else-if="view.kind === 'error'"
        class="card flex flex-col items-start gap-3 p-4"
        :data-state="`error-${view.code}`"
      >
        <p role="alert" class="flex items-start gap-2">
          <Icon name="alert" :size="18" class="mt-0.5 text-carbon-pink-text" />
          {{ ERRORS[view.code] }}
        </p>
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
          <Icon name="refresh" /> Retry
        </button>
      </section>

      <section
        v-else-if="view.kind === 'captured'"
        class="flex flex-col gap-3"
        data-state="captured"
      >
        <div class="card overflow-hidden">
          <div v-if="view.capture.image" class="bg-surface px-3 pt-3 pb-2">
            <CropThumb
              :src="view.capture.image.dataUrl"
              alt="Snipped region"
              :width="view.capture.image.width"
              :height="view.capture.image.height"
            />
          </div>
          <div class="border-t border-canary-edge bg-canary px-3.5 py-2.5">
            <p class="eyebrow mb-0.5">Question</p>
            <p class="whitespace-pre-wrap" data-testid="page-text">
              {{ view.capture.pageText || 'No text found in the selection.' }}
            </p>
          </div>
        </div>
        <p
          v-if="view.capture.hiddenTextChars >= HIDDEN_TEXT_MIN"
          class="notice flex items-start gap-2 text-[13px]"
          data-testid="hidden-text"
        >
          <Icon name="shield" :size="16" class="mt-0.5" />
          This page has hidden text in the area you selected. It was left out.
        </p>
        <AnswerPanel :state="answer" :insert="insert" @open-settings="openSettings" />
        <button class="btn self-start" type="button" :disabled="busy" @click="snip">
          <Icon name="snip" /> Snip question
        </button>
      </section>
    </main>

    <footer class="border-t border-rule bg-paper px-4 py-2.5">
      <Credit compact />
    </footer>
  </div>
</template>
