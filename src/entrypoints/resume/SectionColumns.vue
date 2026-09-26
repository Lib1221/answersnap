<script setup lang="ts">
import { computed, nextTick, ref, useId } from 'vue';
import { sectionTitle, type Section } from '@/kb/resume/model';

// Two-column layouts: which column each section sits in, and its order within the column.
// Order inside a column follows the order of the sections array, so moving up or down swaps a
// section with its neighbor in the same column and leaves the other column untouched.

const props = defineProps<{ sections: Section[] }>();
const emit = defineEmits<{ update: [sections: Section[]] }>();

type Column = Section['column'];

const COLUMNS: { id: Column; title: string; other: Column; to: string }[] = [
  { id: 'main', title: 'Main column', other: 'side', to: 'To side' },
  { id: 'side', title: 'Side column', other: 'main', to: 'To main' },
];

const lists = computed<Record<Column, Section[]>>(() => ({
  main: props.sections.filter((s) => s.column === 'main'),
  side: props.sections.filter((s) => s.column === 'side'),
}));

const uid = useId();
const root = ref<HTMLElement | null>(null);
const status = ref('');

/** Keep keyboard focus on the moved section after the parent re-renders the lists. */
async function refocus(testids: string[]) {
  await nextTick();
  for (const id of testids) {
    const el = root.value?.querySelector<HTMLButtonElement>(`[data-testid="${id}"]`);
    if (el && !el.disabled) {
      el.focus();
      return;
    }
  }
}

function move(sec: Section, dir: -1 | 1) {
  const list = lists.value[sec.column];
  const i = list.findIndex((s) => s.id === sec.id);
  const neighbor = list[i + dir];
  if (i === -1 || !neighbor) return;
  const all = [...props.sections];
  const a = all.findIndex((s) => s.id === sec.id);
  const b = all.findIndex((s) => s.id === neighbor.id);
  all[a] = neighbor;
  all[b] = sec;
  emit('update', all);
  status.value = `${sectionTitle(sec)} moved ${dir < 0 ? 'up' : 'down'}.`;
  const same = dir < 0 ? 'up' : 'down';
  const opposite = dir < 0 ? 'down' : 'up';
  void refocus([`col-${same}-${sec.id}`, `col-${opposite}-${sec.id}`, `col-move-${sec.id}`]);
}

function switchColumn(sec: Section) {
  const to: Column = sec.column === 'main' ? 'side' : 'main';
  emit(
    'update',
    props.sections.map((s) => (s.id === sec.id ? { ...s, column: to } : s)),
  );
  status.value = `${sectionTitle(sec)} moved to the ${to} column.`;
  void refocus([`col-move-${sec.id}`]);
}
</script>

<template>
  <div ref="root" class="@container flex flex-col gap-3" data-testid="section-columns">
    <p class="text-[13px] text-graphite-2">
      Choose the column for each section. The order here is the order on the page.
    </p>
    <div class="grid gap-3 @md:grid-cols-2">
      <section
        v-for="col in COLUMNS"
        :key="col.id"
        class="flex flex-col gap-2 rounded-[10px] border border-rule bg-surface p-2.5"
        :aria-labelledby="`${uid}-${col.id}`"
      >
        <h4 :id="`${uid}-${col.id}`" class="eyebrow px-1">
          {{ col.title }}
          <span class="font-normal tabular-nums">({{ lists[col.id].length }})</span>
        </h4>
        <ul class="flex flex-col gap-1.5" :data-testid="`col-${col.id}`">
          <li
            v-for="(sec, i) in lists[col.id]"
            :key="sec.id"
            class="flex items-center gap-1 rounded-[8px] border border-rule bg-paper py-1 pr-1 pl-2.5"
            :data-testid="`col-item-${sec.id}`"
          >
            <span
              class="min-w-0 flex-1 truncate text-[13px]"
              :class="sec.hidden ? 'text-graphite-2' : 'text-graphite'"
              :title="sectionTitle(sec)"
            >
              {{ sectionTitle(sec) }}
            </span>
            <span v-if="sec.hidden" class="shrink-0 text-[11.5px] text-graphite-2">Hidden</span>
            <button
              type="button"
              class="btn btn-icon size-7 min-h-7 shrink-0"
              :aria-label="`Move ${sectionTitle(sec)} up`"
              title="Move up"
              :disabled="i === 0"
              :data-testid="`col-up-${sec.id}`"
              @click="move(sec, -1)"
            >
              <span aria-hidden="true">↑</span>
            </button>
            <button
              type="button"
              class="btn btn-icon size-7 min-h-7 shrink-0"
              :aria-label="`Move ${sectionTitle(sec)} down`"
              title="Move down"
              :disabled="i === lists[col.id].length - 1"
              :data-testid="`col-down-${sec.id}`"
              @click="move(sec, 1)"
            >
              <span aria-hidden="true">↓</span>
            </button>
            <button
              type="button"
              class="btn btn-quiet min-h-7 shrink-0 px-2 text-[12px]"
              :aria-label="`Move ${sectionTitle(sec)} ${col.to.toLowerCase()} column`"
              :data-testid="`col-move-${sec.id}`"
              @click="switchColumn(sec)"
            >
              {{ col.to }}
            </button>
          </li>
          <li
            v-if="!lists[col.id].length"
            class="rounded-[8px] border border-dashed border-rule px-2.5 py-2 text-[12.5px] text-graphite-2"
          >
            {{
              col.id === 'side'
                ? 'Empty. Move skills, languages, or interests here.'
                : 'Empty. Move a section here.'
            }}
          </li>
        </ul>
      </section>
    </div>
    <p class="sr-only" role="status" aria-live="polite">{{ status }}</p>
  </div>
</template>
