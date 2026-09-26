<script setup lang="ts">
import { computed, nextTick, reactive, ref, useId } from 'vue';
import { monthNames, type DocLang } from '@/kb/resume/docLang';
import { levelWords } from '@/kb/resume/format';
import {
  FIELD_LABELS,
  SECTION_SETUP,
  type Entry,
  type EntryField,
  type SectionType,
} from '@/kb/resume/model';
import RichEditor from './RichEditor.vue';

const entry = defineModel<Entry>({ required: true });
const props = withDefaults(defineProps<{ type: SectionType; docLang?: DocLang }>(), {
  docLang: 'en',
});

type TextField = 'title' | 'subtitle' | 'city' | 'country' | 'link' | 'info' | 'email' | 'phone';
const TEXT_FIELDS: readonly EntryField[] = [
  'title',
  'subtitle',
  'city',
  'country',
  'link',
  'info',
  'email',
  'phone',
];

const id = useId();
const setup = computed(() => SECTION_SETUP[props.type]);

function isText(f: EntryField): f is TextField {
  return TEXT_FIELDS.includes(f);
}

function label(f: EntryField): string {
  return setup.value.labels[f] ?? FIELD_LABELS[f];
}

const INPUT_TYPE: Partial<Record<TextField, string>> = {
  email: 'email',
  phone: 'tel',
  link: 'url',
};
const PLACEHOLDER: Partial<Record<TextField, string>> = { link: 'https://' };

function set<K extends keyof Entry>(k: K, v: Entry[K]) {
  entry.value = { ...entry.value, [k]: v };
}

function val(e: Event): string {
  return (e.target as HTMLInputElement).value;
}

// ---- Dates: a month menu plus a year box, so a bare year ("2016 – 2020") is possible.
// Saved values stay "", "YYYY", or "YYYY-MM".

type DateKey = 'start' | 'end' | 'date';
interface DateParts {
  month: string;
  year: string;
}

/** Editor chrome is English; the resume shows months in its own language. */
const MONTHS = monthNames('en', 'long').map((name, i) => ({
  value: String(i + 1).padStart(2, '0'),
  name,
}));

const RANGE = [
  { key: 'start', text: 'Start date', month: 'Start month', year: 'Start year' },
  { key: 'end', text: 'End date', month: 'End month', year: 'End year' },
] as const;

/**
 * Input the model can't hold yet: a year still being typed, or a month picked before its year.
 * It only applies while the saved value is still the one it started from.
 */
const drafts = reactive<Partial<Record<DateKey, DateParts & { base: string; bad?: boolean }>>>({});

function parts(k: DateKey): DateParts {
  const d = drafts[k];
  if (d && d.base === entry.value[k]) return d;
  const [year = '', month = ''] = entry.value[k].split('-');
  return { year, month };
}

function setDate(k: DateKey, next: DateParts) {
  const { month, year } = next;
  if (/^\d{4}$/.test(year)) {
    delete drafts[k];
    set(k, month ? `${year}-${month}` : year);
  } else if (!year) {
    // No year means no date. A picked month waits for its year.
    if (month) drafts[k] = { month, year, base: '' };
    else delete drafts[k];
    set(k, '');
  } else {
    // A partial year: keep the saved date until four digits are in.
    drafts[k] = { month, year, base: entry.value[k] };
  }
}

function onMonth(k: DateKey, e: Event) {
  setDate(k, { ...parts(k), month: (e.target as HTMLSelectElement).value });
}

function onYear(k: DateKey, e: Event) {
  const el = e.target as HTMLInputElement;
  const year = el.value.replace(/\D/g, '').slice(0, 4);
  if (el.value !== year) el.value = year;
  setDate(k, { ...parts(k), year });
}

/** Leaving a year box with fewer than four digits flags it instead of silently dropping it. */
function onYearBlur(k: DateKey) {
  const d = drafts[k];
  if (d && d.base === entry.value[k] && d.year) d.bad = true;
}

function badYear(k: DateKey): boolean {
  const d = drafts[k];
  return !!d?.bad && d.base === entry.value[k];
}

const endBeforeStart = computed(() => {
  const { start, end, present } = entry.value;
  return !present && !!start && !!end && end.slice(0, start.length) < start.slice(0, end.length);
});

// ---- Level: five dots plus "No level", as a radio group (arrow keys change the level).
// Each level has FlowCV's word in the resume language (skills and languages differ).

const words = computed(() => levelWords(props.type, props.docLang));
function levelWord(n: number): string {
  return words.value[n - 1] ?? String(n);
}

const hover = ref<number | null>(null);
const shownLevel = computed(() => hover.value ?? entry.value.level);

async function setLevel(n: number, group?: HTMLElement) {
  const level = Math.max(0, Math.min(5, n));
  set('level', level);
  if (!group) return;
  await nextTick();
  group.querySelector<HTMLElement>(`[data-level="${level}"]`)?.focus();
}

function onLevelKey(ev: KeyboardEvent) {
  const step: Record<string, number> = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 };
  const group = ev.currentTarget as HTMLElement;
  if (ev.key in step) {
    ev.preventDefault();
    void setLevel(entry.value.level + step[ev.key]!, group);
  } else if (ev.key === 'Home' || ev.key === 'End') {
    ev.preventDefault();
    void setLevel(ev.key === 'Home' ? 0 : 5, group);
  }
}
</script>

<template>
  <div class="grid grid-cols-2 gap-3" data-testid="entry-editor">
    <template v-for="f in setup.fields" :key="f">
      <label v-if="isText(f)" class="flex min-w-0 flex-col gap-1 text-[13px] font-medium">
        {{ label(f) }}
        <input
          :type="INPUT_TYPE[f] ?? 'text'"
          :value="entry[f]"
          :placeholder="PLACEHOLDER[f]"
          :inputmode="f === 'link' ? 'url' : undefined"
          class="field-input px-2.5 py-1.5 font-normal"
          :data-testid="`entry-${f}`"
          @input="set(f, val($event))"
        />
      </label>

      <fieldset v-else-if="f === 'dates'" class="col-span-2 min-w-0">
        <legend class="sr-only">{{ label('dates') }}</legend>
        <div class="grid grid-cols-2 gap-3">
          <div
            v-for="r in RANGE"
            :key="r.key"
            role="group"
            :aria-labelledby="`${id}-${r.key}`"
            class="flex min-w-0 flex-col gap-1"
            :data-testid="`entry-${r.key}`"
          >
            <span :id="`${id}-${r.key}`" class="text-[13px] font-medium">{{ r.text }}</span>
            <div class="flex min-w-0 gap-1.5">
              <select
                :value="r.key === 'end' && entry.present ? '' : parts(r.key).month"
                :disabled="r.key === 'end' && entry.present"
                :aria-label="r.month"
                class="field-input min-w-0 flex-1 px-2 py-1.5 font-normal disabled:opacity-50"
                :data-testid="`entry-${r.key}-month`"
                @change="onMonth(r.key, $event)"
              >
                <option value="">(no month)</option>
                <option v-for="m in MONTHS" :key="m.value" :value="m.value">{{ m.name }}</option>
              </select>
              <input
                type="text"
                inputmode="numeric"
                maxlength="4"
                autocomplete="off"
                placeholder="Year"
                :value="r.key === 'end' && entry.present ? '' : parts(r.key).year"
                :disabled="r.key === 'end' && entry.present"
                :aria-label="r.year"
                :aria-invalid="badYear(r.key) || undefined"
                :aria-describedby="badYear(r.key) ? `${id}-${r.key}-bad` : undefined"
                class="field-input w-[4.75rem] shrink-0 px-2 py-1.5 font-normal tabular-nums disabled:opacity-50"
                :data-testid="`entry-${r.key}-year`"
                @input="onYear(r.key, $event)"
                @blur="onYearBlur(r.key)"
              />
            </div>
            <p
              v-if="badYear(r.key)"
              :id="`${id}-${r.key}-bad`"
              class="text-[12px] text-carbon-pink-text"
            >
              Use four digits, like 2016.
            </p>
          </div>
          <p
            v-if="endBeforeStart"
            class="col-span-2 text-[12.5px] text-carbon-pink-text"
            role="status"
          >
            The end date is before the start date.
          </p>
          <label class="col-start-2 flex items-center gap-2 text-[13px]">
            <input
              type="checkbox"
              :checked="entry.present"
              data-testid="entry-present"
              @change="set('present', ($event.target as HTMLInputElement).checked)"
            />
            Present (still ongoing)
          </label>
          <label
            v-if="!entry.present"
            class="col-span-2 flex flex-col gap-1 text-[12.5px] text-graphite-2"
          >
            Or write the end yourself (shown instead of the end date)
            <input
              :value="entry.endText"
              class="field-input px-2.5 py-1.5 text-[13px] text-graphite"
              placeholder="Expected 2027"
              maxlength="40"
              data-testid="entry-end-text"
              @input="set('endText', ($event.target as HTMLInputElement).value)"
            />
          </label>
        </div>
      </fieldset>

      <div
        v-else-if="f === 'date'"
        role="group"
        :aria-labelledby="`${id}-date`"
        class="flex min-w-0 flex-col gap-1"
        data-testid="entry-date"
      >
        <span :id="`${id}-date`" class="text-[13px] font-medium">{{ label('date') }}</span>
        <div class="flex min-w-0 gap-1.5">
          <select
            :value="parts('date').month"
            aria-label="Month"
            class="field-input min-w-0 flex-1 px-2 py-1.5 font-normal"
            data-testid="entry-date-month"
            @change="onMonth('date', $event)"
          >
            <option value="">(no month)</option>
            <option v-for="m in MONTHS" :key="m.value" :value="m.value">{{ m.name }}</option>
          </select>
          <input
            type="text"
            inputmode="numeric"
            maxlength="4"
            autocomplete="off"
            placeholder="Year"
            :value="parts('date').year"
            aria-label="Year"
            :aria-invalid="badYear('date') || undefined"
            :aria-describedby="badYear('date') ? `${id}-date-bad` : undefined"
            class="field-input w-[4.75rem] shrink-0 px-2 py-1.5 font-normal tabular-nums"
            data-testid="entry-date-year"
            @input="onYear('date', $event)"
            @blur="onYearBlur('date')"
          />
        </div>
        <p v-if="badYear('date')" :id="`${id}-date-bad`" class="text-[12px] text-carbon-pink-text">
          Use four digits, like 2016.
        </p>
      </div>

      <div v-else-if="f === 'level'" class="col-span-2 flex flex-col gap-1">
        <span :id="`${id}-level`" class="text-[13px] font-medium">{{ label('level') }}</span>
        <div
          role="radiogroup"
          :aria-labelledby="`${id}-level`"
          class="flex flex-wrap items-center gap-1"
          @keydown="onLevelKey"
          @mouseleave="hover = null"
        >
          <button
            v-for="n in 5"
            :key="n"
            type="button"
            role="radio"
            :aria-checked="entry.level === n"
            :aria-label="levelWord(n)"
            :title="levelWord(n)"
            :tabindex="entry.level === n ? 0 : -1"
            :data-level="n"
            :data-testid="`entry-level-${n}`"
            class="grid size-7 place-items-center rounded-full hover:bg-ink-soft"
            @click="setLevel(n)"
            @mouseenter="hover = n"
          >
            <span
              class="size-3.5 rounded-full border-2 border-ink transition-colors"
              :class="n <= shownLevel ? 'bg-ink' : 'bg-transparent'"
            />
          </button>
          <button
            type="button"
            role="radio"
            :aria-checked="entry.level === 0"
            :tabindex="entry.level === 0 ? 0 : -1"
            data-level="0"
            data-testid="entry-level-0"
            class="chip ml-2"
            :class="entry.level === 0 ? 'border-ink bg-ink-soft text-ink' : ''"
            @click="setLevel(0)"
            @mouseenter="hover = 0"
          >
            No level
          </button>
          <span
            class="ml-2 text-[12.5px] text-graphite-2"
            aria-hidden="true"
            data-testid="entry-level-word"
          >
            {{ shownLevel ? levelWord(shownLevel) : 'Level not shown' }}
          </span>
        </div>
      </div>

      <div v-else-if="f === 'description'" class="col-span-2 flex flex-col gap-1">
        <span class="text-[13px] font-medium" aria-hidden="true">{{ label('description') }}</span>
        <RichEditor
          :model-value="entry.description"
          :label="label('description')"
          placeholder="What you did and what it achieved. One point per line."
          @update:model-value="set('description', $event)"
        />
      </div>
    </template>
  </div>
</template>
