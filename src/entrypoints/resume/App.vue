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
import CustomizePanel from './CustomizePanel.vue';
import ResumePages from './ResumePages.vue';
import SectionColumns from './SectionColumns.vue';
import TemplateGallery from './TemplateGallery.vue';
import ThumbFit from './ThumbFit.vue';

type Tab = 'content' | 'customize' | 'templates';
const tab = ref<Tab>('content');
const resumes = ref<Resume[]>([]);
const current = ref<Resume | null>(null);
const saveState = ref<'saved' | 'saving' | ''>('');
const pageCount = ref(1);
const renaming = ref(false);
const confirmDelete = ref(false);
const loading = ref(true);
/** A piece of text taller than a page, which the page cuts off. */
const tooTall = ref(false);

async function load() {
  resumes.value = await getResumes();
  for (const r of resumes.value) savedAt.set(r.id, r.updatedAt);
  const wanted = new URLSearchParams(location.search).get('id');
  await setQuietly(resumes.value.find((r) => r.id === wanted) ?? resumes.value[0] ?? null);
  loading.value = false;
}
onMounted(load);

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
    savedAt.set(r.id, at);
    // Never re-create a resume deleted elsewhere (another tab, Delete all data, an import).
    const saved = await saveResume(r, { create: false, updatedAt: at });
    const i = resumes.value.findIndex((x) => x.id === r.id);
    if (saved && i !== -1) resumes.value[i] = { ...r, updatedAt: at };
  }
  if (!pending.size && saveState.value === 'saving') saveState.value = 'saved';
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
  document.title = pdfTitle(current.value.personal.fullName, current.value.name);
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
        <span class="text-[12.5px] text-graphite-2" role="status" data-testid="save-state">
          {{ saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved' : '' }}
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
      </div>
    </div>

    <div v-else class="flex min-h-0 flex-1">
      <aside class="app-chrome flex w-[470px] shrink-0 flex-col border-r border-rule bg-paper">
        <nav class="grid grid-cols-3 gap-1 border-b border-rule p-2" aria-label="Editor">
          <button
            v-for="t in ['content', 'customize', 'templates'] as const"
            :key="t"
            type="button"
            class="rounded-[8px] py-1.5 text-[13px] font-medium capitalize transition-colors"
            :class="tab === t ? 'bg-ink-soft text-ink' : 'text-graphite-2 hover:text-graphite'"
            :aria-pressed="tab === t"
            :data-testid="`tab-${t}`"
            @click="tab = t"
          >
            {{ t }}
          </button>
        </nav>
        <div class="min-h-0 flex-1 overflow-y-auto p-4">
          <ContentEditor v-if="tab === 'content'" v-model="current" />
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
        </div>
        <div
          class="preview-scale mx-auto my-4"
          :style="{ width: `${pageWidthPx * scale}px`, '--k': String(scale) }"
        >
          <ResumePages
            :resume="current"
            class="preview-pages"
            @pages="(n) => (pageCount = n)"
            @overflow="(v) => (tooTall = v)"
          />
        </div>
      </main>
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
