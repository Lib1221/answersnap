<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { getApplicant } from '@/kb/applicant';
import { pdfTitle, PAGE_MM } from '@/kb/resume/format';
import { newResume, PersonalSchema, type Resume } from '@/kb/resume/model';
import {
  addMyTemplate,
  applyMyTemplate,
  deleteMyTemplate,
  deleteResume,
  duplicateResume,
  getMyTemplates,
  getResumes,
  MY_TEMPLATE_PREFIX,
  resumeFromProfile,
  saveResume,
  watchResumes,
  type MyTemplate,
} from '@/kb/resume/store';
import { applyTemplate } from '@/kb/resume/templates';
import { getProfile } from '@/storage/items';
import Icon from '@/ui/AppIcon.vue';
import LogoMark from '@/ui/LogoMark.vue';
import ContentEditor from './ContentEditor.vue';
import CoverLetterPages from './CoverLetterPages.vue';
import ImportResume from './ImportResume.vue';
import JobMatchPanel from './JobMatchPanel.vue';
import TailorProgress from './TailorProgress.vue';
import { messageOf, useTailor } from './useTailor';
import CustomizePanel from './CustomizePanel.vue';
import ResumePages from './ResumePages.vue';
import SectionColumns from './SectionColumns.vue';
import TemplateGallery from './TemplateGallery.vue';
import ThumbFit from './ThumbFit.vue';

type Tab = 'match' | 'content' | 'customize' | 'templates';
const tab = ref<Tab>('content');
const TAB_LABELS: Record<Tab, string> = {
  match: 'Job match',
  content: 'Content',
  customize: 'Customize',
  templates: 'Templates',
};
/** A tailored copy opens on its job match. */
const tabs = computed<Tab[]>(() =>
  current.value?.tailoring
    ? ['match', 'content', 'customize', 'templates']
    : ['content', 'customize', 'templates'],
);
/** The document in the preview (and the one Download PDF saves). */
const showing = ref<'resume' | 'letter'>('resume');
const resumes = ref<Resume[]>([]);
const current = ref<Resume | null>(null);
const saveState = ref<'saved' | 'saving' | 'error' | ''>('');
/** Why the last save failed (storage full, most likely), shown until a save succeeds. */
const saveError = ref('');
const pageCount = ref(1);
const renaming = ref(false);
const confirmDelete = ref(false);
const loading = ref(true);
/** A piece of text taller than a page, which the page cuts off. */
const tooTall = ref(false);
/** Bullets from an imported file that no section took, shown until dismissed. */
const unplaced = ref<string[]>([]);
const unplacedNote = computed(() =>
  unplaced.value.length === 1
    ? "One bullet from your file didn't find a place in the resume. Add it where it belongs:"
    : `${unplaced.value.length} bullets from your file didn't find a place in the resume. Add them where they belong:`,
);

async function load() {
  resumes.value = await getResumes();
  for (const r of resumes.value) savedAt.set(r.id, r.updatedAt);
  const params = new URLSearchParams(location.search);
  const wanted = params.get('id');
  const master = resumes.value.find((r) => r.master);
  await setQuietly(
    resumes.value.find((r) => r.id === wanted) ?? master ?? resumes.value[0] ?? null,
  );
  loading.value = false;
  // Opened by LinkedIn's Tailor button or the side panel: tailor for that job.
  const request = params.get('tailor');
  if (request) await tailor.start(request);
}
onMounted(load);

// ---- Pages measured: the fit-to-two-pages loop waits for its own change to be measured.
const pageWaiters = new Map<string, ((n: number) => void)[]>();
let lastMeasured: { at: string; count: number } | null = null;
function onPages(count: number, at: string) {
  pageCount.value = count;
  lastMeasured = { at, count };
  const waiting = pageWaiters.get(at);
  pageWaiters.delete(at);
  waiting?.forEach((resolve) => resolve(count));
}
function measured(at: string): Promise<number> {
  if (lastMeasured?.at === at) return Promise.resolve(lastMeasured.count);
  return new Promise((resolve) => {
    pageWaiters.set(at, [...(pageWaiters.get(at) ?? []), resolve]);
    // Never hang the flow if a measurement doesn't come (the preview was switched away).
    setTimeout(() => resolve(pageCount.value), 8000);
  });
}

const tailor = useTailor({
  resumes,
  current,
  add: async (r) => {
    await add(r);
    tab.value = 'match';
  },
  measured,
  flush: () => flush(),
});
const tailorBusy = computed(() =>
  ['loading', 'dealbreakers', 'need-master', 'tailoring', 'fitting', 'error'].includes(
    tailor.phase.value,
  ),
);

async function useAsMaster() {
  if (!current.value) return;
  const updated = await tailor.makeMaster(current.value);
  savedAt.set(updated.id, updated.updatedAt);
  await setQuietly(updated);
}
async function chooseMaster(r: Resume) {
  await tailor.tailorFrom(r);
}
/** An imported resume: the master when there's none yet, and the start of a waiting tailoring. */
async function onImported(r: Resume, missed: string[] = []) {
  const first = !resumes.value.some((x) => x.master);
  await add({ ...r, master: first });
  unplaced.value = missed;
  if (tailor.phase.value === 'need-master' && current.value) await tailor.tailorFrom(current.value);
}
watch(
  () => current.value?.id,
  () => {
    showing.value = 'resume';
    // A tailored copy opens on its job match; other resumes can't show that tab.
    if (current.value?.tailoring) tab.value = 'match';
    else if (tab.value === 'match') tab.value = 'content';
  },
);

/** Replace the open resume without treating it as an edit to save. */
let quiet = false;
async function setQuietly(r: Resume | null) {
  quiet = true;
  current.value = r;
  await nextTick();
  quiet = false;
}

// ---- Saving. Edits wait here per resume and are written half a second after the last change,
// and at once when the tab is hidden or closed, or before switching resumes.
const pending = new Map<string, Resume>();
/** The updatedAt this tab last wrote or loaded, per resume: anything else came from elsewhere. */
const savedAt = new Map<string, string>();
let saveTimer = 0;

async function flush() {
  clearTimeout(saveTimer);
  const edits = [...pending.values()];
  pending.clear();
  for (const r of edits) {
    const at = new Date().toISOString();
    const before = savedAt.get(r.id);
    savedAt.set(r.id, at);
    try {
      // Never re-create a resume deleted elsewhere (another tab, Delete all data, an import).
      const saved = await saveResume(r, { create: false, updatedAt: at });
      const i = resumes.value.findIndex((x) => x.id === r.id);
      if (saved && i !== -1) resumes.value[i] = { ...r, updatedAt: at };
    } catch (err) {
      // Keep the edit to try again with the next change, and say why it wasn't saved.
      if (before) savedAt.set(r.id, before);
      if (!pending.has(r.id)) pending.set(r.id, r);
      saveState.value = 'error';
      saveError.value = messageOf(err);
    }
  }
  if (!pending.size && saveState.value !== '') {
    saveState.value = 'saved';
    saveError.value = '';
  }
}

watch(
  current,
  (r, old) => {
    if (quiet || !r || !old || r.id !== old.id) return;
    pending.set(r.id, r);
    saveState.value = 'saving';
    clearTimeout(saveTimer);
    saveTimer = window.setTimeout(flush, 500);
  },
  { deep: true },
);

// Another tab, Settings (Delete all data, Import), or this tab's own save changed storage.
const stopWatching = watchResumes(async () => {
  const list = await getResumes();
  const open = current.value;
  resumes.value = list.map((r) => (open && r.id === open.id && pending.has(r.id) ? open : r));
  if (!open) return;
  const stored = list.find((r) => r.id === open.id);
  if (!stored) {
    // Deleted elsewhere: drop it, unsaved edits included, so it can't come back.
    pending.delete(open.id);
    confirmDelete.value = false;
    renaming.value = false;
    await setQuietly(list[0] ?? null);
    saveState.value = '';
  } else if (stored.updatedAt !== savedAt.get(open.id) && !pending.has(open.id)) {
    // Changed in another tab and nothing unsaved here: show that version.
    savedAt.set(open.id, stored.updatedAt);
    await setQuietly(stored);
  }
});

function onHide() {
  if (document.visibilityState === 'hidden') void flush();
}
onMounted(() => {
  document.addEventListener('visibilitychange', onHide);
  window.addEventListener('pagehide', flush);
});
onBeforeUnmount(() => {
  void flush();
  stopWatching();
  document.removeEventListener('visibilitychange', onHide);
  window.removeEventListener('pagehide', flush);
});

/** New resume: from the AnswerSnap profile when there is one, else blank. */
async function createFromProfile() {
  const record = await getProfile();
  const applicant = await getApplicant();
  const r = record
    ? resumeFromProfile(record.profile, applicant)
    : newResume({
        design: applyTemplate('modern'),
        personal: PersonalSchema.parse({
          fullName: [applicant.givenNames, applicant.familyName].filter(Boolean).join(' '),
          email: applicant.email,
        }),
      });
  await add(r);
}

async function createBlank() {
  await add(newResume({ design: applyTemplate('modern') }));
}

async function add(r: Resume) {
  await flush();
  const saved = (await saveResume(r))!;
  savedAt.set(saved.id, saved.updatedAt);
  resumes.value = await getResumes();
  await setQuietly(resumes.value.find((x) => x.id === r.id) ?? saved);
  saveState.value = 'saved';
  tab.value = 'content';
}

async function duplicate() {
  if (current.value) await add(duplicateResume(current.value));
}

async function remove() {
  if (!current.value) return;
  const id = current.value.id;
  // An edit still waiting to be saved must not bring the resume back.
  pending.delete(id);
  await flush();
  await deleteResume(id);
  confirmDelete.value = false;
  resumes.value = await getResumes();
  await setQuietly(resumes.value[0] ?? null);
  await nextTick();
  (
    document.querySelector<HTMLElement>('[data-testid="resume-pick"]') ??
    document.querySelector<HTMLElement>('[data-testid="resume-start-profile"]')
  )?.focus();
}

async function pick(id: string) {
  await flush();
  await setQuietly(resumes.value.find((r) => r.id === id) ?? current.value);
}

// ---- Header controls keep keyboard focus where the user is.
async function focusTestId(id: string, select = false) {
  await nextTick();
  const el = document.querySelector<HTMLInputElement>(`[data-testid="${id}"]`);
  el?.focus();
  if (select) el?.select();
}
function startRename() {
  renaming.value = !renaming.value;
  if (renaming.value) void focusTestId('resume-name', true);
}
function endRename(back: boolean) {
  if (!renaming.value) return;
  renaming.value = false;
  if (back) void focusTestId('resume-rename');
}
function askDelete() {
  confirmDelete.value = true;
  void focusTestId('resume-delete-confirm');
}
function keep() {
  confirmDelete.value = false;
  void focusTestId('resume-delete');
}

function pickTemplate(id: string) {
  if (!current.value) return;
  current.value = {
    ...current.value,
    design: applyTemplate(id, keepOnTemplate(current.value.design)),
  };
}

/** A new design keeps the page size and the resume's language (they belong to the content). */
function keepOnTemplate(d: Resume['design']) {
  return { page: d.page, docLang: d.docLang };
}

// Preview scaling: fit the page width into the preview column.
const previewBox = ref<HTMLElement | null>(null);
const boxWidth = ref(800);
let ro: ResizeObserver | null = null;
onMounted(() => {
  ro = new ResizeObserver(([e]) => (boxWidth.value = e!.contentRect.width));
  if (previewBox.value) ro.observe(previewBox.value);
});
watch(previewBox, (el) => el && ro?.observe(el));
onBeforeUnmount(() => ro?.disconnect());
const pageWidthPx = computed(
  () => (current.value ? PAGE_MM[current.value.design.page].w : 210) * (96 / 25.4),
);
const scale = computed(() =>
  Math.min(1.2, Math.max(0.3, (boxWidth.value - 48) / pageWidthPx.value)),
);

// Printing: the page size follows the design; margins live inside the page.
const pageStyle = document.createElement('style');
document.head.appendChild(pageStyle);
watch(
  () => current.value?.design.page,
  (size) => {
    pageStyle.textContent = `@page { size: ${size === 'Letter' ? 'letter' : 'A4'}; margin: 0; }`;
  },
  { immediate: true },
);
onBeforeUnmount(() => pageStyle.remove());

// Chrome names the PDF after the document title, from the button, Ctrl+P, or the menu alike.
let titleBefore = '';
function beforePrint() {
  if (!current.value) return;
  titleBefore = document.title;
  const base = pdfTitle(current.value.personal.fullName, current.value.name);
  document.title = showing.value === 'letter' ? base.replace(/_Resume$/, '_Cover_Letter') : base;
  void flush();
}
function afterPrint() {
  if (titleBefore) document.title = titleBefore;
  titleBefore = '';
}
onMounted(() => {
  window.addEventListener('beforeprint', beforePrint);
  window.addEventListener('afterprint', afterPrint);
});
onBeforeUnmount(() => {
  window.removeEventListener('beforeprint', beforePrint);
  window.removeEventListener('afterprint', afterPrint);
});

function downloadPdf() {
  if (current.value) window.print();
}

/** Download one document: show it, let it render (the resume's pages are measured first), then print. */
async function downloadDoc(doc: 'resume' | 'letter') {
  const switching = doc === 'resume' && showing.value !== 'resume';
  if (switching) lastMeasured = null;
  showing.value = doc;
  if (switching && current.value) await measured(current.value.updatedAt);
  await nextTick();
  await document.fonts.ready;
  downloadPdf();
}

/** The current resume in another design, for the gallery's live thumbnails. */
function withDesign(design: Resume['design']): Resume {
  const r = current.value!;
  return { ...r, design: { ...design, ...keepOnTemplate(r.design) } };
}

// ---- My templates: designs saved by name, shared by every resume.
const myTemplates = ref<MyTemplate[]>([]);
onMounted(async () => (myTemplates.value = await getMyTemplates()));

async function saveMine(name: string) {
  if (!current.value) return;
  const t = await addMyTemplate(name, current.value.design);
  myTemplates.value = await getMyTemplates();
  current.value = {
    ...current.value,
    design: { ...current.value.design, template: `${MY_TEMPLATE_PREFIX}${t.id}` },
  };
}
function pickMine(t: MyTemplate) {
  if (!current.value) return;
  current.value = {
    ...current.value,
    design: applyMyTemplate(t, keepOnTemplate(current.value.design)),
  };
}
async function deleteMine(id: string) {
  await deleteMyTemplate(id);
  myTemplates.value = await getMyTemplates();
}
</script>

<template>
  <div class="app-shell flex h-screen flex-col bg-surface text-graphite">
    <header class="app-chrome flex items-center gap-3 border-b border-rule bg-paper px-4 py-2.5">
      <LogoMark :size="28" />
      <h1 class="text-[15px] font-[650]">Resume builder</h1>
      <template v-if="current">
        <label class="sr-only" for="resume-pick">Resume</label>
        <select
          v-if="!renaming"
          id="resume-pick"
          class="field-input max-w-64 px-2 py-1 text-[13px]"
          :value="current.id"
          data-testid="resume-pick"
          @change="pick(($event.target as HTMLSelectElement).value)"
        >
          <option v-for="r in resumes" :key="r.id" :value="r.id">{{ r.name }}</option>
        </select>
        <input
          v-else
          v-model="current.name"
          class="field-input max-w-64 px-2 py-1 text-[13px]"
          aria-label="Resume name"
          data-testid="resume-name"
          @keydown.enter="endRename(true)"
          @keydown.escape="endRename(true)"
          @blur="endRename(false)"
        />
        <button
          class="btn btn-quiet min-h-0 px-2 text-[13px]"
          type="button"
          data-testid="resume-rename"
          :aria-expanded="renaming"
          @click="startRename"
        >
          Rename
        </button>
        <button
          class="btn btn-quiet min-h-0 px-2 text-[13px]"
          type="button"
          data-testid="resume-duplicate"
          @click="duplicate"
        >
          Duplicate
        </button>
        <span
          v-if="current.master"
          class="rounded-full bg-ink-soft px-2 py-0.5 text-[12px] font-medium text-ink"
          title="Every tailored copy starts from this resume"
          data-testid="master-badge"
        >
          Master
        </span>
        <span
          v-else-if="current.tailoring"
          class="rounded-full bg-surface px-2 py-0.5 text-[12px] font-medium text-graphite-2"
          data-testid="tailored-badge"
        >
          Tailored
        </span>
        <button
          v-else
          class="btn btn-quiet min-h-0 px-2 text-[13px]"
          type="button"
          title="Tailored copies for jobs will start from this resume"
          data-testid="make-master"
          @click="useAsMaster"
        >
          Use as master
        </button>
        <template v-if="!confirmDelete">
          <button
            class="btn btn-quiet min-h-0 px-2 text-[13px]"
            type="button"
            data-testid="resume-delete"
            @click="askDelete"
          >
            Delete
          </button>
        </template>
        <template v-else>
          <span class="text-[13px]">Delete this resume?</span>
          <button
            class="btn min-h-0 px-2 text-[13px]"
            type="button"
            data-testid="resume-delete-confirm"
            @click="remove"
          >
            Delete
          </button>
          <button
            class="btn btn-quiet min-h-0 px-2 text-[13px]"
            type="button"
            data-testid="resume-delete-keep"
            @click="keep"
          >
            Keep
          </button>
        </template>
      </template>
      <div class="ml-auto flex items-center gap-2">
        <span
          class="max-w-[360px] text-[12.5px]"
          :class="saveState === 'error' ? 'text-carbon-pink-text' : 'text-graphite-2'"
          role="status"
          data-testid="save-state"
        >
          {{
            saveState === 'saving'
              ? 'Saving…'
              : saveState === 'saved'
                ? 'Saved'
                : saveState === 'error'
                  ? saveError
                  : ''
          }}
        </span>
        <button
          class="btn min-h-0 px-2.5 text-[13px]"
          type="button"
          data-testid="resume-new"
          @click="createFromProfile"
        >
          <Icon name="sparkle" :size="15" /> New from my profile
        </button>
        <button
          class="btn btn-quiet min-h-0 px-2 text-[13px]"
          type="button"
          data-testid="resume-blank"
          @click="createBlank"
        >
          Blank
        </button>
        <ImportResume variant="quiet" @imported="onImported" />
        <button
          v-if="current"
          class="btn btn-primary"
          type="button"
          title="Opens Chrome's print window: choose Save as PDF as the destination"
          data-testid="download-pdf"
          @click="downloadPdf"
        >
          <Icon name="file" /> Download PDF
        </button>
      </div>
    </header>

    <div v-if="loading" class="app-chrome p-8 text-graphite-2">Loading…</div>

    <TailorProgress
      v-else-if="!current && tailorBusy"
      :phase="tailor.phase.value"
      :job="tailor.job.value"
      :error="tailor.error.value"
      :resumes="resumes"
      :hits="tailor.hits.value"
      @proceed="tailor.proceed"
      @skip="tailor.skip"
      @choose="chooseMaster"
      @retry="tailor.retry"
      @close="tailor.close"
    >
      <template #import><ImportResume @imported="onImported" /></template>
    </TailorProgress>

    <div v-else-if="!current" class="app-chrome flex flex-1 items-center justify-center p-8">
      <div
        class="card flex max-w-md flex-col items-center gap-3 p-8 text-center"
        data-testid="resume-empty"
      >
        <Icon name="file" :size="28" class="text-ink" />
        <h2 class="text-lg font-[650]">Build your resume</h2>
        <p class="text-graphite-2">
          Start from your AnswerSnap profile (built from your own resume and sources), or from a
          blank page. Pick a template, edit every section, and download a PDF.
        </p>
        <div class="flex gap-2">
          <button
            class="btn btn-primary"
            type="button"
            data-testid="resume-start-profile"
            @click="createFromProfile"
          >
            Start from my profile
          </button>
          <button class="btn" type="button" data-testid="resume-start-blank" @click="createBlank">
            Blank resume
          </button>
        </div>
        <div class="mt-2 flex flex-col items-center gap-1.5 border-t border-rule pt-4">
          <p class="text-[13px] text-graphite-2">
            Have a resume already? Import it word for word, in a matching design.
          </p>
          <ImportResume @imported="onImported" />
        </div>
      </div>
    </div>

    <div v-else class="relative flex min-h-0 flex-1">
      <aside class="app-chrome flex w-[470px] shrink-0 flex-col border-r border-rule bg-paper">
        <nav
          class="grid gap-1 border-b border-rule p-2"
          :style="{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }"
          aria-label="Editor"
        >
          <button
            v-for="t in tabs"
            :key="t"
            type="button"
            class="rounded-[8px] py-1.5 text-[13px] font-medium transition-colors"
            :class="tab === t ? 'bg-ink-soft text-ink' : 'text-graphite-2 hover:text-graphite'"
            :aria-pressed="tab === t"
            :data-testid="`tab-${t}`"
            @click="tab = t"
          >
            {{ TAB_LABELS[t] }}
          </button>
        </nav>
        <div class="min-h-0 flex-1 overflow-y-auto p-4">
          <JobMatchPanel
            v-if="tab === 'match' && current.tailoring"
            :key="current.id"
            :resume="current"
            :master="resumes.find((r) => r.id === current?.tailoring?.sourceResumeId) ?? null"
            :letter-state="tailor.letter.value"
            :letter-error="tailor.letterError.value"
            :showing="showing"
            @update="(r) => (current = r)"
            @write-letter="tailor.writeLetter"
            @show="(doc) => (showing = doc)"
            @download="downloadDoc"
          />
          <ContentEditor v-else-if="tab === 'content'" v-model="current" />
          <template v-else-if="tab === 'customize'">
            <SectionColumns
              v-if="current.design.columns === 'two'"
              class="mb-4"
              :sections="current.sections"
              @update="(sections) => current && (current = { ...current, sections })"
            />
            <CustomizePanel v-model="current.design" />
          </template>
          <TemplateGallery
            v-else
            :current="current.design.template"
            :mine="myTemplates"
            @pick="pickTemplate"
            @pick-mine="pickMine"
            @save-mine="saveMine"
            @delete-mine="deleteMine"
          >
            <template #thumb="{ design }">
              <ThumbFit :page-width-px="pageWidthPx">
                <ResumePages :resume="withDesign(design)" first-page-only />
              </ThumbFit>
            </template>
          </TemplateGallery>
        </div>
      </aside>

      <main
        ref="previewBox"
        class="preview-area min-w-0 flex-1 overflow-auto bg-rule/50"
        data-testid="preview"
      >
        <div
          class="app-chrome flex items-baseline justify-between gap-4 px-6 pt-3 text-[12px] text-graphite-2"
        >
          <p>Download PDF opens the print window. Choose Save as PDF as the destination.</p>
          <p class="shrink-0 tabular-nums" data-testid="page-count">
            {{ pageCount }} {{ pageCount === 1 ? 'page' : 'pages' }} · {{ current.design.page }}
          </p>
        </div>
        <div role="status" class="app-chrome px-6">
          <p v-if="tooTall" class="notice mt-2 text-[13px]" data-testid="too-tall">
            Some text is taller than a whole page, so the page cuts it off. Break it into shorter
            paragraphs or bullets.
          </p>
          <div v-if="unplaced.length" class="notice mt-2 text-[13px]" data-testid="import-unplaced">
            <p>{{ unplacedNote }}</p>
            <ul class="mt-1 list-disc pl-5">
              <li v-for="(line, i) in unplaced.slice(0, 5)" :key="i">{{ line }}</li>
            </ul>
            <button
              type="button"
              class="btn btn-quiet mt-1 min-h-0 px-2 text-[13px]"
              data-testid="import-unplaced-dismiss"
              @click="unplaced = []"
            >
              Got it
            </button>
          </div>
        </div>
        <div
          class="preview-scale mx-auto my-4"
          :style="{ width: `${pageWidthPx * scale}px`, '--k': String(scale) }"
        >
          <CoverLetterPages
            v-if="showing === 'letter' && current.coverLetter"
            :resume="current"
            class="preview-pages"
          />
          <ResumePages
            v-else
            :resume="current"
            class="preview-pages"
            @pages="onPages"
            @overflow="(v) => (tooTall = v)"
          />
        </div>
      </main>
      <div
        v-if="tailorBusy"
        class="absolute inset-y-0 right-0 left-[470px] z-10 overflow-auto bg-surface/90"
      >
        <TailorProgress
          :phase="tailor.phase.value"
          :job="tailor.job.value"
          :error="tailor.error.value"
          :resumes="resumes"
          :hits="tailor.hits.value"
          @proceed="tailor.proceed"
          @skip="tailor.skip"
          @choose="chooseMaster"
          @retry="tailor.retry"
          @close="tailor.close"
        >
          <template #import><ImportResume @imported="onImported" /></template>
        </TailorProgress>
      </div>
    </div>
  </div>
</template>

<style>
.preview-pages {
  transform: scale(var(--k));
  transform-origin: top left;
}
.preview-pages .rd-page {
  margin-bottom: calc(24px / var(--k));
  box-shadow: 0 2px 14px rgb(0 0 0 / 0.12);
}

@media print {
  html,
  body {
    background: #fff !important;
  }
  .app-chrome {
    display: none !important;
  }
  .app-shell {
    height: auto !important;
    display: block !important;
  }
  .app-shell > div {
    display: block !important;
  }
  .preview-area {
    overflow: visible !important;
    background: none !important;
  }
  .preview-scale {
    width: auto !important;
    margin: 0 !important;
  }
  .preview-pages {
    transform: none !important;
  }
  .preview-pages .rd-page {
    margin: 0 !important;
    box-shadow: none !important;
    break-after: page;
  }
  .preview-pages .rd-page:last-child {
    break-after: auto;
  }
}
</style>
