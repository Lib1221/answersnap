<script setup lang="ts">
import { computed, h, nextTick, ref, useId, type FunctionalComponent } from 'vue';
import { formatDates, levelWords } from '@/kb/resume/format';
import { DOC_STRINGS, type DocLang } from '@/kb/resume/docLang';
import {
  LIST_TYPES,
  newEntry,
  newId,
  SECTION_SETUP,
  sectionTitle,
  type Entry,
  type Section,
} from '@/kb/resume/model';
import EntryEditor from './EntryEditor.vue';
import RichEditor from './RichEditor.vue';

const props = defineProps<{ section: Section; index: number; count: number; docLang?: DocLang }>();
const emit = defineEmits<{
  update: [section: Section];
  remove: [];
  move: [delta: number];
  dragstart: [event: DragEvent];
}>();

// A few glyphs AppIcon doesn't have, drawn the same way (24 x 24, round strokes).
type GlyphName =
  | 'grip'
  | 'eye'
  | 'eyeOff'
  | 'chevron'
  | 'up'
  | 'down'
  | 'trash'
  | 'plus'
  | 'copy'
  | 'sort'
  | 'sliders';
const GLYPHS: Record<GlyphName, string[]> = {
  sliders: [
    'M4 6h8',
    'M16 6h4',
    'M14 4v4',
    'M4 12h2',
    'M10 12h10',
    'M8 10v4',
    'M4 18h10',
    'M18 18h2',
    'M16 16v4',
  ],
  copy: ['M9 9h11v11H9z', 'M5 15H4V4h11v1'],
  sort: ['M7 4v16', 'M3 16l4 4 4-4', 'M14 6h7', 'M14 11h5', 'M14 16h3'],
  grip: ['M9 5h.01', 'M15 5h.01', 'M9 12h.01', 'M15 12h.01', 'M9 19h.01', 'M15 19h.01'],
  eye: ['M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z', 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z'],
  eyeOff: [
    'M3 3l18 18',
    'M10.6 5.1A10.4 10.4 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.1 4',
    'M6.6 6.6A17 17 0 0 0 2 12s3.6 7 10 7a10 10 0 0 0 5.4-1.6',
    'M9.9 9.9a3 3 0 0 0 4.2 4.2',
  ],
  chevron: ['m6 9 6 6 6-6'],
  up: ['M12 19V5', 'm5 12 7-7 7 7'],
  down: ['M12 5v14', 'm19 12-7 7-7-7'],
  trash: [
    'M4 7h16',
    'M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2',
    'M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12',
    'M10 11v6',
    'M14 11v6',
  ],
  plus: ['M12 5v14', 'M5 12h14'],
};

const Glyph: FunctionalComponent<{ name: GlyphName; size?: number }> = (p) =>
  h(
    'svg',
    {
      width: p.size ?? 16,
      height: p.size ?? 16,
      viewBox: '0 0 24 24',
      'aria-hidden': 'true',
      focusable: 'false',
      class: 'shrink-0',
    },
    GLYPHS[p.name].map((d) =>
      h('path', {
        d,
        fill: 'none',
        stroke: 'currentColor',
        'stroke-width': p.name === 'grip' ? 3.4 : 1.8,
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
      }),
    ),
  );
Glyph.props = ['name', 'size'];

const id = useId();
const root = ref<HTMLElement | null>(null);
const setup = computed(() => SECTION_SETUP[props.section.type]);
const name = computed(() => sectionTitle(props.section, props.docLang));
const collapsed = ref(false);
const confirmDelete = ref(false);
const settingsOpen = ref(false);
const isList = computed(() => LIST_TYPES.has(props.section.type));
const hasLevels = computed(() => setup.value.fields.includes('level'));

const LAYOUTS: { value: Section['layout']; label: string }[] = [
  { value: 'design', label: 'As in Customize' },
  { value: 'grid', label: 'Grid' },
  { value: 'list', label: 'List' },
  { value: 'bubbles', label: 'Bubbles' },
  { value: 'inline', label: 'One line' },
];
const LEVEL_STYLES: { value: Section['levelStyle']; label: string }[] = [
  { value: 'design', label: 'As in Customize' },
  { value: 'dots', label: 'Dots' },
  { value: 'bar', label: 'Bar' },
  { value: 'text', label: 'Words' },
  { value: 'none', label: 'Hidden' },
];
/** Entries shown expanded, by id. New entries open expanded. */
const open = ref(new Set<string>());
const confirmEntry = ref<string | null>(null);

const deleteQuestion = computed(() => {
  const n = props.section.entries.length;
  const what = n ? ` and its ${n} ${n === 1 ? 'entry' : 'entries'}` : '';
  return `Delete ${name.value}${what}? This can't be undone.`;
});

function patch(p: Partial<Section>) {
  emit('update', { ...props.section, ...p });
}

function setEntries(entries: Entry[]) {
  patch({ entries });
}

function updateEntry(e: Entry) {
  setEntries(props.section.entries.map((x) => (x.id === e.id ? e : x)));
}

// ---- Section header

function onDragStart(ev: DragEvent) {
  if (ev.dataTransfer) {
    ev.dataTransfer.effectAllowed = 'move';
    ev.dataTransfer.setData('application/x-resume-section', props.section.id);
    if (root.value) ev.dataTransfer.setDragImage(root.value, 24, 20);
  }
  emit('dragstart', ev);
}

/** Moving re-orders the DOM, which can drop focus; keep it on the button the user pressed. */
async function moveSection(delta: -1 | 1) {
  emit('move', delta);
  await nextTick();
  const self = root.value?.querySelector<HTMLButtonElement>(`[data-move="${delta}"]`);
  const other = root.value?.querySelector<HTMLButtonElement>(`[data-move="${-delta}"]`);
  (self && !self.disabled ? self : other)?.focus();
}

async function askDelete() {
  confirmDelete.value = true;
  await nextTick();
  root.value?.querySelector<HTMLElement>('[data-testid="section-delete-confirm"]')?.focus();
}

async function cancelDelete() {
  confirmDelete.value = false;
  await nextTick();
  root.value?.querySelector<HTMLElement>('[data-testid="section-delete"]')?.focus();
}

// ---- Entries

function entryLabel(e: Entry): string {
  return e.title.trim() || 'Untitled';
}

function entryLine(e: Entry): string {
  const dates = formatDates(e, { dateFormat: 'Mon YYYY', presentLabel: 'Present' });
  const level = e.level ? (levelWords(props.section.type, props.docLang)[e.level - 1] ?? '') : '';
  return [e.subtitle.trim() || e.info.trim(), dates, level].filter(Boolean).join(' · ');
}

function toggleEntry(entryId: string) {
  const next = new Set(open.value);
  if (next.has(entryId)) next.delete(entryId);
  else next.add(entryId);
  open.value = next;
}

async function closeEntry(entryId: string) {
  toggleEntry(entryId);
  await nextTick();
  root.value?.querySelector<HTMLElement>(`[data-entry-toggle="${entryId}"]`)?.focus();
}

async function addEntry() {
  const e = newEntry();
  open.value = new Set(open.value).add(e.id);
  if (collapsed.value) collapsed.value = false;
  setEntries([...props.section.entries, e]);
  await nextTick();
  root.value
    ?.querySelector<HTMLElement>(`[data-entry-id="${e.id}"] [data-testid="entry-title"]`)
    ?.focus();
}

async function moveEntry(i: number, delta: -1 | 1, entryId: string) {
  const j = i + delta;
  const list = props.section.entries.slice();
  if (j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j]!, list[i]!];
  setEntries(list);
  await nextTick();
  const row = root.value?.querySelector(`[data-entry-id="${entryId}"]`);
  const self = row?.querySelector<HTMLButtonElement>(`[data-move="${delta}"]`);
  const other = row?.querySelector<HTMLButtonElement>(`[data-move="${-delta}"]`);
  (self && !self.disabled ? self : other)?.focus();
}

/** Newest first: ongoing entries, then by end (or single) date, then by start date. */
function sortByDate() {
  const key = (e: Entry) => (e.present ? '9999-99' : e.date || e.end || e.start || '0000');
  setEntries(
    [...props.section.entries].sort(
      (a, b) => key(b).localeCompare(key(a)) || (b.start || '').localeCompare(a.start || ''),
    ),
  );
}
const datedSection = computed(
  () => setup.value.fields.includes('dates') || setup.value.fields.includes('date'),
);

function duplicateEntry(i: number) {
  const e = props.section.entries[i]!;
  // JSON copy: structuredClone throws on Vue's reactive proxies.
  const copy: Entry = { ...(JSON.parse(JSON.stringify(e)) as Entry), id: newId('e') };
  const next = [...props.section.entries];
  next.splice(i + 1, 0, copy);
  setEntries(next);
  open.value = new Set([...open.value, copy.id]);
}

function insertConsent() {
  const line = DOC_STRINGS[props.docLang ?? 'en'].consent;
  if (props.section.text.includes(line)) return;
  patch({ text: props.section.text.trim() ? `${props.section.text.trim()}\n\n${line}` : line });
}

function setSignature(key: 'name' | 'place' | 'date', value: string) {
  patch({ signature: { ...props.section.signature, [key]: value } });
}

function toggleEntryHidden(e: Entry) {
  updateEntry({ ...e, hidden: !e.hidden });
}

async function askDeleteEntry(entryId: string) {
  confirmEntry.value = entryId;
  await nextTick();
  root.value
    ?.querySelector<HTMLElement>(
      `[data-entry-id="${entryId}"] [data-testid="entry-delete-confirm"]`,
    )
    ?.focus();
}

async function cancelDeleteEntry(entryId: string) {
  confirmEntry.value = null;
  await nextTick();
  root.value
    ?.querySelector<HTMLElement>(`[data-entry-id="${entryId}"] [data-testid="entry-delete"]`)
    ?.focus();
}

async function deleteEntry(entryId: string) {
  confirmEntry.value = null;
  const i = props.section.entries.findIndex((x) => x.id === entryId);
  const rest = props.section.entries.filter((x) => x.id !== entryId);
  setEntries(rest);
  const next = new Set(open.value);
  next.delete(entryId);
  open.value = next;
  await nextTick();
  // Focus the entry that took its place, or the add button.
  const neighbour = rest[Math.min(i, rest.length - 1)];
  const target = neighbour
    ? root.value?.querySelector<HTMLElement>(`[data-entry-toggle="${neighbour.id}"]`)
    : root.value?.querySelector<HTMLElement>('[data-testid="add-entry"]');
  target?.focus();
}

const TEXT_PLACEHOLDER: Partial<Record<Section['type'], string>> = {
  profile: 'Two or three sentences on who you are, what you do best, and what you want next.',
  declaration:
    'I declare that the information in this resume is true and complete to the best of my knowledge.',
};
</script>

<template>
  <div
    ref="root"
    role="group"
    class="card flex flex-col"
    :aria-label="name"
    :data-section-id="section.id"
    data-testid="section-card"
  >
    <div class="flex items-center gap-1 py-2 pr-2 pl-1">
      <span
        draggable="true"
        class="grid h-8 w-6 shrink-0 cursor-grab place-items-center rounded-control text-graphite-2 hover:bg-ink-soft hover:text-ink active:cursor-grabbing"
        title="Drag to reorder"
        aria-hidden="true"
        data-testid="section-drag"
        @dragstart="onDragStart"
      >
        <Glyph name="grip" :size="14" />
      </span>
      <label :for="`${id}-title`" class="sr-only">Section title</label>
      <input
        :id="`${id}-title`"
        :value="section.title"
        :placeholder="name"
        class="field-input min-w-0 flex-1 border-transparent bg-transparent px-2 py-1 text-[15px] font-semibold placeholder:text-graphite hover:border-rule focus:border-ink"
        :class="section.hidden ? 'text-graphite-2' : ''"
        data-testid="section-title-input"
        @input="patch({ title: ($event.target as HTMLInputElement).value })"
      />
      <span
        v-if="section.hidden"
        class="shrink-0 rounded-full bg-surface px-2 py-0.5 text-[11.5px] font-medium text-graphite-2"
      >
        Hidden
      </span>
      <button
        type="button"
        class="btn btn-icon"
        :aria-label="`Move ${name} up`"
        title="Move up"
        data-move="-1"
        :disabled="index === 0"
        data-testid="section-up"
        @click="moveSection(-1)"
      >
        <Glyph name="up" />
      </button>
      <button
        type="button"
        class="btn btn-icon"
        :aria-label="`Move ${name} down`"
        title="Move down"
        data-move="1"
        :disabled="index >= count - 1"
        data-testid="section-down"
        @click="moveSection(1)"
      >
        <Glyph name="down" />
      </button>
      <button
        type="button"
        class="btn btn-icon"
        :aria-label="section.hidden ? `Show ${name} on the resume` : `Hide ${name} from the resume`"
        :aria-pressed="section.hidden"
        :title="section.hidden ? 'Show on the resume' : 'Hide from the resume'"
        data-testid="section-hide"
        @click="patch({ hidden: !section.hidden })"
      >
        <Glyph :name="section.hidden ? 'eyeOff' : 'eye'" />
      </button>
      <button
        type="button"
        class="btn btn-icon"
        :class="settingsOpen || section.breakBefore || !section.showHeading ? 'text-ink' : ''"
        :aria-label="`${name} settings`"
        :aria-expanded="settingsOpen"
        :aria-controls="`${id}-settings`"
        title="Section settings"
        data-testid="section-settings"
        @click="settingsOpen = !settingsOpen"
      >
        <Glyph name="sliders" />
      </button>
      <button
        type="button"
        class="btn btn-icon"
        :aria-label="collapsed ? `Expand ${name}` : `Collapse ${name}`"
        :aria-expanded="!collapsed"
        :aria-controls="`${id}-body`"
        :title="collapsed ? 'Expand' : 'Collapse'"
        data-testid="section-collapse"
        @click="collapsed = !collapsed"
      >
        <Glyph name="chevron" class="transition-transform" :class="collapsed ? '-rotate-90' : ''" />
      </button>
      <button
        type="button"
        class="btn btn-icon hover:text-carbon-pink-text"
        :aria-label="`Delete ${name}`"
        title="Delete section"
        data-testid="section-delete"
        @click="askDelete"
      >
        <Glyph name="trash" />
      </button>
    </div>

    <div
      v-if="settingsOpen"
      :id="`${id}-settings`"
      class="mx-3 mb-3 flex flex-col gap-2.5 rounded-control border border-rule bg-surface px-3 py-2.5 text-[13px]"
      data-testid="section-settings-panel"
    >
      <label class="flex items-center gap-2">
        <input
          type="checkbox"
          class="accent-ink"
          :checked="section.breakBefore"
          data-testid="section-break"
          @change="patch({ breakBefore: ($event.target as HTMLInputElement).checked })"
        />
        Start on a new page
      </label>
      <label class="flex items-center gap-2">
        <input
          type="checkbox"
          class="accent-ink"
          :checked="section.showHeading"
          data-testid="section-show-heading"
          @change="patch({ showHeading: ($event.target as HTMLInputElement).checked })"
        />
        Show the heading
      </label>
      <div v-if="isList" class="flex flex-wrap gap-3">
        <label class="flex flex-col gap-1 font-medium">
          Layout
          <select
            class="field-input px-2 py-1 font-normal"
            :value="section.layout"
            data-testid="section-layout"
            @change="
              patch({
                layout: ($event.target as HTMLSelectElement).value as Section['layout'],
              })
            "
          >
            <option v-for="o in LAYOUTS" :key="o.value" :value="o.value">{{ o.label }}</option>
          </select>
        </label>
        <label v-if="section.layout === 'grid'" class="flex flex-col gap-1 font-medium">
          Per row
          <select
            class="field-input px-2 py-1 font-normal"
            :value="section.gridColumns"
            data-testid="section-cols"
            @change="patch({ gridColumns: Number(($event.target as HTMLSelectElement).value) })"
          >
            <option v-for="n in 4" :key="n" :value="n">{{ n }}</option>
          </select>
        </label>
        <label v-if="hasLevels" class="flex flex-col gap-1 font-medium">
          Level
          <select
            class="field-input px-2 py-1 font-normal"
            :value="section.levelStyle"
            data-testid="section-levels"
            @change="
              patch({
                levelStyle: ($event.target as HTMLSelectElement).value as Section['levelStyle'],
              })
            "
          >
            <option v-for="o in LEVEL_STYLES" :key="o.value" :value="o.value">
              {{ o.label }}
            </option>
          </select>
        </label>
      </div>
    </div>

    <div
      v-if="confirmDelete"
      class="notice mx-3 mb-3 flex flex-wrap items-center gap-2 text-[13px]"
      role="group"
      :aria-label="`Delete ${name}?`"
    >
      <span class="flex-1">{{ deleteQuestion }}</span>
      <button
        type="button"
        class="btn min-h-8 border-carbon-pink-text text-carbon-pink-text"
        data-testid="section-delete-confirm"
        @click="emit('remove')"
      >
        Delete
      </button>
      <button type="button" class="btn btn-quiet min-h-8" @click="cancelDelete">Cancel</button>
    </div>

    <div
      v-if="!collapsed"
      :id="`${id}-body`"
      class="flex flex-col gap-2 border-t border-rule px-3 pt-3 pb-3"
      :class="section.hidden ? 'opacity-60' : ''"
    >
      <RichEditor
        v-if="setup.textOnly"
        :model-value="section.text"
        :label="name"
        :placeholder="TEXT_PLACEHOLDER[section.type]"
        @update:model-value="patch({ text: $event })"
      />
      <template v-if="section.type === 'declaration'">
        <button
          type="button"
          class="btn btn-quiet self-start text-[13px]"
          data-testid="insert-consent"
          @click="insertConsent"
        >
          <Glyph name="plus" :size="15" /> Insert the data-protection consent line
        </button>
        <p class="px-1 text-[12px] text-graphite-2">
          Italian and many EU applications ask for it at the end of the CV. It follows the resume
          language (Customize, Page).
        </p>
        <div class="grid grid-cols-3 gap-2">
          <label class="flex flex-col gap-1 text-[12.5px] font-medium">
            Name under the signature line
            <input
              class="field-input px-2 py-1 font-normal"
              :value="section.signature.name"
              data-testid="sign-name"
              @input="setSignature('name', ($event.target as HTMLInputElement).value)"
            />
          </label>
          <label class="flex flex-col gap-1 text-[12.5px] font-medium">
            Place
            <input
              class="field-input px-2 py-1 font-normal"
              :value="section.signature.place"
              data-testid="sign-place"
              @input="setSignature('place', ($event.target as HTMLInputElement).value)"
            />
          </label>
          <label class="flex flex-col gap-1 text-[12.5px] font-medium">
            Date
            <input
              class="field-input px-2 py-1 font-normal"
              :value="section.signature.date"
              placeholder="26/09/2026"
              data-testid="sign-date"
              @input="setSignature('date', ($event.target as HTMLInputElement).value)"
            />
          </label>
        </div>
      </template>

      <template v-else>
        <p v-if="!section.entries.length" class="px-1 text-[13px] text-graphite-2">
          Nothing here yet. Add your first entry.
        </p>
        <ul v-else class="flex flex-col gap-2">
          <li
            v-for="(e, i) in section.entries"
            :key="e.id"
            class="rounded-control border border-rule"
            :class="open.has(e.id) ? 'bg-paper' : 'bg-surface/60'"
            :data-entry-id="e.id"
            data-testid="entry-row"
          >
            <div class="flex items-center gap-1 py-1 pr-1 pl-1">
              <button
                type="button"
                class="flex min-w-0 flex-1 items-center gap-2 rounded-control px-2 py-1.5 text-left hover:bg-ink-soft"
                :aria-expanded="open.has(e.id)"
                :aria-controls="`${id}-entry-${e.id}`"
                :data-entry-toggle="e.id"
                data-testid="entry-toggle"
                @click="toggleEntry(e.id)"
              >
                <span class="flex min-w-0 flex-1 flex-col">
                  <span
                    class="truncate text-[13.5px] font-medium"
                    :class="[
                      e.title.trim() ? '' : 'text-graphite-2 italic',
                      e.hidden ? 'text-graphite-2 line-through' : '',
                    ]"
                  >
                    {{ entryLabel(e) }}
                  </span>
                  <span v-if="entryLine(e)" class="truncate text-[12.5px] text-graphite-2">
                    {{ entryLine(e) }}
                  </span>
                </span>
                <span v-if="e.hidden" class="sr-only">(hidden)</span>
                <Glyph
                  name="chevron"
                  :size="14"
                  class="text-graphite-2 transition-transform"
                  :class="open.has(e.id) ? 'rotate-180' : ''"
                />
              </button>
              <template v-if="confirmEntry === e.id">
                <span class="px-1 text-[12.5px] text-carbon-pink-text">Delete?</span>
                <button
                  type="button"
                  class="btn min-h-7 border-carbon-pink-text px-2 text-[12.5px] text-carbon-pink-text"
                  data-testid="entry-delete-confirm"
                  @click="deleteEntry(e.id)"
                >
                  Delete
                </button>
                <button
                  type="button"
                  class="btn btn-quiet min-h-7 text-[12.5px]"
                  @click="cancelDeleteEntry(e.id)"
                >
                  Cancel
                </button>
              </template>
              <template v-else>
                <button
                  type="button"
                  class="btn btn-icon size-7 min-h-7"
                  :aria-label="`Move ${entryLabel(e)} up`"
                  title="Move up"
                  data-move="-1"
                  :disabled="i === 0"
                  @click="moveEntry(i, -1, e.id)"
                >
                  <Glyph name="up" :size="14" />
                </button>
                <button
                  type="button"
                  class="btn btn-icon size-7 min-h-7"
                  :aria-label="`Move ${entryLabel(e)} down`"
                  title="Move down"
                  data-move="1"
                  :disabled="i === section.entries.length - 1"
                  @click="moveEntry(i, 1, e.id)"
                >
                  <Glyph name="down" :size="14" />
                </button>
                <button
                  type="button"
                  class="btn btn-icon size-7 min-h-7"
                  :aria-label="
                    e.hidden
                      ? `Show ${entryLabel(e)} on the resume`
                      : `Hide ${entryLabel(e)} from the resume`
                  "
                  :aria-pressed="e.hidden"
                  :title="e.hidden ? 'Show on the resume' : 'Hide from the resume'"
                  data-testid="entry-hide"
                  @click="toggleEntryHidden(e)"
                >
                  <Glyph :name="e.hidden ? 'eyeOff' : 'eye'" :size="14" />
                </button>
                <button
                  type="button"
                  class="btn btn-icon size-7 min-h-7"
                  :aria-label="`Duplicate ${entryLabel(e)}`"
                  title="Duplicate entry"
                  data-testid="entry-duplicate"
                  @click="duplicateEntry(i)"
                >
                  <Glyph name="copy" :size="14" />
                </button>
                <button
                  type="button"
                  class="btn btn-icon size-7 min-h-7 hover:text-carbon-pink-text"
                  :aria-label="`Delete ${entryLabel(e)}`"
                  title="Delete entry"
                  data-testid="entry-delete"
                  @click="askDeleteEntry(e.id)"
                >
                  <Glyph name="trash" :size="14" />
                </button>
              </template>
            </div>

            <div
              v-if="open.has(e.id)"
              :id="`${id}-entry-${e.id}`"
              class="flex flex-col gap-3 border-t border-rule px-3 pt-3 pb-3"
            >
              <EntryEditor
                :model-value="e"
                :type="section.type"
                :doc-lang="docLang"
                @update:model-value="updateEntry"
              />
              <button
                type="button"
                class="btn self-end text-[13px]"
                data-testid="entry-done"
                @click="closeEntry(e.id)"
              >
                Done
              </button>
            </div>
          </li>
        </ul>
        <div class="flex flex-wrap gap-2">
          <button
            type="button"
            class="btn btn-quiet self-start text-[13px]"
            data-testid="add-entry"
            @click="addEntry"
          >
            <Glyph name="plus" :size="15" /> Add entry
          </button>
          <button
            v-if="datedSection && section.entries.length > 1"
            type="button"
            class="btn btn-quiet self-start text-[13px]"
            data-testid="sort-by-date"
            @click="sortByDate"
          >
            <Glyph name="sort" :size="15" /> Sort by date
          </button>
        </div>
      </template>
    </div>
  </div>
</template>
