<script setup lang="ts">
import { computed, nextTick, ref, useId } from 'vue';
import {
  newSection,
  SECTION_SETUP,
  SECTION_TYPES,
  sectionTitle,
  type Personal,
  type Resume,
  type Section,
  type SectionType,
} from '@/kb/resume/model';
import Icon, { type IconName } from '@/ui/AppIcon.vue';
import PersonalEditor from './PersonalEditor.vue';
import SectionCard from './SectionCard.vue';

const resume = defineModel<Resume>({ required: true });

const id = useId();
const root = ref<HTMLElement | null>(null);
const list = ref<HTMLElement | null>(null);
const adding = ref(false);
const status = ref('');

/** Sections a resume holds at most once. */
const ONCE: SectionType[] = ['profile', 'declaration'];

const TYPE_ICON: Record<SectionType, IconName> = {
  profile: 'pen',
  experience: 'briefcase',
  education: 'cap',
  skills: 'target',
  languages: 'flag',
  certificates: 'shield',
  projects: 'file',
  courses: 'book',
  awards: 'star',
  organisations: 'form',
  publications: 'bookmark',
  volunteering: 'user',
  references: 'mail',
  interests: 'sparkle',
  declaration: 'check',
  custom: 'settings',
};

const TYPE_HINT: Record<SectionType, string> = {
  profile: 'A short summary at the top',
  experience: 'Jobs and internships',
  education: 'Degrees and schools',
  skills: 'Tools, methods, and levels',
  languages: 'Languages you speak',
  certificates: 'Certifications and licences',
  projects: 'Things you built or led',
  courses: 'Training and online courses',
  awards: 'Prizes and honours',
  organisations: 'Clubs and associations',
  publications: 'Papers, articles, and books',
  volunteering: 'Unpaid and community work',
  references: 'People who can vouch for you',
  interests: 'Hobbies and pursuits',
  declaration: 'A signed statement',
  custom: 'Anything else, with your own title',
};

function isAdded(type: SectionType): boolean {
  return ONCE.includes(type) && resume.value.sections.some((s) => s.type === type);
}

function setSections(sections: Section[]) {
  resume.value = { ...resume.value, sections };
}

function setPersonal(personal: Personal) {
  resume.value = { ...resume.value, personal };
}

function updateSection(s: Section) {
  setSections(resume.value.sections.map((x) => (x.id === s.id ? s : x)));
}

function focusIn(selector: string) {
  root.value?.querySelector<HTMLElement>(selector)?.focus();
}

async function removeSection(i: number) {
  const gone = resume.value.sections[i];
  if (!gone) return;
  const rest = resume.value.sections.filter((_, j) => j !== i);
  setSections(rest);
  status.value = `Deleted ${sectionTitle(gone)}.`;
  await nextTick();
  const next = rest[Math.min(i, rest.length - 1)];
  if (next) focusIn(`[data-section-id="${next.id}"] [data-testid="section-title-input"]`);
  else focusIn('[data-testid="add-content"]');
}

function moveSection(from: number, to: number) {
  const sections = resume.value.sections.slice();
  if (from === to || to < 0 || to >= sections.length) return;
  const [moved] = sections.splice(from, 1);
  if (!moved) return;
  sections.splice(to, 0, moved);
  setSections(sections);
  status.value = `Moved ${sectionTitle(moved)} to position ${to + 1} of ${sections.length}.`;
}

// In two columns, up and down move a section past its neighbor in the same column: that is the
// order the page shows (the other column is laid out on its own).
const twoColumns = computed(() => resume.value.design.columns === 'two');
function peers(s: Section): Section[] {
  const all = resume.value.sections;
  return twoColumns.value ? all.filter((x) => x.column === s.column) : all;
}
const position = (s: Section) => peers(s).findIndex((x) => x.id === s.id);

function moveBy(i: number, delta: -1 | 1) {
  const s = resume.value.sections[i];
  if (!s) return;
  if (!twoColumns.value) return moveSection(i, i + delta);
  const list = peers(s);
  const p = position(s);
  const neighbor = list[p + delta];
  if (!neighbor) return;
  const all = resume.value.sections.slice();
  const j = all.findIndex((x) => x.id === neighbor.id);
  all[i] = neighbor;
  all[j] = s;
  setSections(all);
  const column = s.column === 'side' ? 'side' : 'main';
  status.value = `Moved ${sectionTitle(s)} to position ${p + delta + 1} of ${list.length} in the ${column} column.`;
}

async function addSection(type: SectionType) {
  if (isAdded(type)) return;
  const s = newSection(type);
  setSections([...resume.value.sections, s]);
  adding.value = false;
  status.value = `Added ${sectionTitle(s)}.`;
  await nextTick();
  const el = list.value?.querySelector<HTMLElement>(`[data-section-id="${s.id}"]`);
  el?.scrollIntoView({ block: 'nearest' });
  el?.querySelector<HTMLElement>(
    SECTION_SETUP[type].textOnly ? '[data-testid="rich-editor"]' : '[data-testid="add-entry"]',
  )?.focus();
}

async function toggleAdding() {
  adding.value = !adding.value;
  if (!adding.value) return;
  await nextTick();
  // The first section type the user can still add, not the Close button above the list.
  focusIn(`#${CSS.escape(`${id}-types`)} [data-testid^="add-section-"]:not(:disabled)`);
}

async function closeAdding() {
  adding.value = false;
  await nextTick();
  focusIn('[data-testid="add-content"]');
}

// ---- Drag and drop: the handle on each card starts it; the list works out the drop point.

const dragFrom = ref<number | null>(null);
/** Insertion point, 0 to sections.length. */
const dropAt = ref<number | null>(null);

function onDragStart(i: number) {
  dragFrom.value = i;
  dropAt.value = null;
}

function onDragOver(ev: DragEvent) {
  if (dragFrom.value === null || !list.value) return;
  ev.preventDefault();
  if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'move';
  const items = [...list.value.querySelectorAll<HTMLElement>(':scope > [data-section-id]')];
  let at = items.length;
  for (let i = 0; i < items.length; i++) {
    const r = items[i]!.getBoundingClientRect();
    if (ev.clientY < r.top + r.height / 2) {
      at = i;
      break;
    }
  }
  // Dropping right before or after itself changes nothing, so show no line there.
  dropAt.value = at === dragFrom.value || at === dragFrom.value + 1 ? null : at;
}

function onDragLeave(ev: DragEvent) {
  if (!list.value?.contains(ev.relatedTarget as Node | null)) dropAt.value = null;
}

function onDrop(ev: DragEvent) {
  if (dragFrom.value === null) return;
  ev.preventDefault();
  const from = dragFrom.value;
  const at = dropAt.value;
  endDrag();
  if (at === null) return;
  moveSection(from, at > from ? at - 1 : at);
}

function endDrag() {
  dragFrom.value = null;
  dropAt.value = null;
}
</script>

<template>
  <div ref="root" class="flex flex-col gap-4" data-testid="content-editor">
    <PersonalEditor :model-value="resume.personal" @update:model-value="setPersonal" />

    <div
      ref="list"
      class="flex flex-col gap-3"
      @dragover="onDragOver"
      @dragleave="onDragLeave"
      @drop="onDrop"
    >
      <div
        v-for="(s, i) in resume.sections"
        :key="s.id"
        class="relative"
        :class="dragFrom === i ? 'opacity-50' : ''"
        :data-section-id="s.id"
        @dragend="endDrag"
      >
        <div
          v-if="dropAt === i"
          class="pointer-events-none absolute inset-x-0 -top-[8px] h-[3px] rounded-full bg-ink"
          aria-hidden="true"
          data-testid="drop-indicator"
        />
        <SectionCard
          :section="s"
          :index="position(s)"
          :count="peers(s).length"
          :doc-lang="resume.design.docLang"
          @update="updateSection"
          @remove="removeSection(i)"
          @move="(d) => moveBy(i, d as -1 | 1)"
          @dragstart="onDragStart(i)"
        />
        <div
          v-if="dropAt === resume.sections.length && i === resume.sections.length - 1"
          class="pointer-events-none absolute inset-x-0 -bottom-[8px] h-[3px] rounded-full bg-ink"
          aria-hidden="true"
          data-testid="drop-indicator"
        />
      </div>
    </div>

    <p v-if="!resume.sections.length" class="text-[13px] text-graphite-2">
      No sections yet. Add your experience, education, and skills below.
    </p>

    <button
      type="button"
      class="btn self-start"
      :class="adding ? 'border-ink text-ink' : ''"
      :aria-expanded="adding"
      :aria-controls="`${id}-types`"
      data-testid="add-content"
      @click="toggleAdding"
    >
      <span class="text-[17px] leading-none" aria-hidden="true">+</span> Add content
    </button>

    <div
      v-if="adding"
      :id="`${id}-types`"
      class="card flex flex-col gap-3 p-4"
      role="group"
      :aria-labelledby="`${id}-types-title`"
      @keydown.esc.prevent="closeAdding"
    >
      <div class="flex items-center justify-between gap-2">
        <h3 :id="`${id}-types-title`" class="font-semibold">Add content</h3>
        <button
          type="button"
          class="btn btn-icon"
          aria-label="Close"
          title="Close"
          @click="closeAdding"
        >
          <Icon name="x" />
        </button>
      </div>
      <div class="grid grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-2">
        <button
          v-for="t in SECTION_TYPES"
          :key="t"
          type="button"
          class="flex items-start gap-2.5 rounded-control border border-rule bg-paper p-2.5 text-left transition-colors hover:border-ink hover:bg-ink-soft disabled:cursor-default disabled:opacity-50 disabled:hover:border-rule disabled:hover:bg-paper"
          :disabled="isAdded(t)"
          :data-testid="`add-section-${t}`"
          @click="addSection(t)"
        >
          <span class="mt-0.5 text-ink"><Icon :name="TYPE_ICON[t]" /></span>
          <span class="flex min-w-0 flex-col">
            <span class="text-[13.5px] font-medium">{{ SECTION_SETUP[t].name }}</span>
            <span class="text-[12px] text-graphite-2">
              {{ isAdded(t) ? 'Already added' : TYPE_HINT[t] }}
            </span>
          </span>
        </button>
      </div>
    </div>

    <p class="sr-only" role="status" aria-live="polite">{{ status }}</p>
  </div>
</template>
