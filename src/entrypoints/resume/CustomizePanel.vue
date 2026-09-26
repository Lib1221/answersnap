<script setup lang="ts">
import { DOC_LANG_NAMES, DOC_LANGS, DOC_STRINGS } from '@/kb/resume/docLang';
import { computed, h, useId, type FunctionalComponent, type VNodeChild } from 'vue';
import { FONT_KEYS, newEntry, type Design, type FontKey } from '@/kb/resume/model';
import { FONTS } from '@/kb/resume/templates';
import { formatDates, formatMonth } from '@/kb/resume/format';
import Icon from '@/ui/AppIcon.vue';

// FlowCV-style design controls. Every change replaces the design object (never mutates it), so
// the parent's v-model sees one new value per change and can save or undo it.

const design = defineModel<Design>({ required: true });
const uid = useId();

type KeysOf<T> = { [K in keyof Design]: Design[K] extends T ? K : never }[keyof Design];
type ChoiceKey = KeysOf<string>;
type NumberKey = KeysOf<number>;
type BoolKey = KeysOf<boolean>;
type AccentKey = keyof Design['accentOn'];

interface Opt<V extends string = string> {
  value: V;
  label: string;
  title?: string;
  disabled?: boolean;
}

function set<K extends keyof Design>(key: K, value: Design[K]) {
  const next: Design = { ...design.value, [key]: value };
  // A header in the side column or a tinted side column needs a side column.
  if (key === 'columns' && next.columns === 'one') {
    if (next.header === 'side') next.header = 'top';
    if (next.fill === 'sidebar') next.fill = 'none';
  }
  design.value = next;
}

function setAccentOn(key: AccentKey, on: boolean) {
  design.value = { ...design.value, accentOn: { ...design.value.accentOn, [key]: on } };
}

/** Snap to the slider's step and range so the value always passes DesignSchema. */
function setNumber(key: NumberKey, raw: number, r: { min: number; max: number; step: number }) {
  if (!Number.isFinite(raw)) return;
  const decimals = (String(r.step).split('.')[1] ?? '').length;
  const snapped = Number((Math.round((raw - r.min) / r.step) * r.step + r.min).toFixed(decimals));
  set(key, Math.min(r.max, Math.max(r.min, snapped)));
}

/** "MM/YYYY" -> "MM-YYYY", so every test id is a plain token. */
/** Test id part for an option value; distinct separators stay distinct (MM/YYYY vs MM.YYYY). */
const slug = (v: string) =>
  v
    .replace(/\//g, '_')
    .replace(/\./g, 'dot')
    .replace(/[^A-Za-z0-9_-]+/g, '-');

// ---------------------------------------------------------------------------------------------
// Small building blocks, local to this panel. They read the model directly and write through
// set(), so the template stays a flat list of controls.

const Card: FunctionalComponent<
  { title: string; hint?: string },
  Record<never, never>,
  { default: Record<never, never> }
> = (p, { slots }) => {
  const id = `${uid}-card-${slug(p.title)}`;
  return h('section', { class: 'card flex flex-col gap-4 p-4', 'aria-labelledby': id }, [
    h('div', { class: 'flex flex-col gap-0.5' }, [
      h('h3', { id, class: 'font-medium' }, p.title),
      p.hint ? h('p', { class: 'text-[12.5px] text-graphite-2' }, p.hint) : null,
    ]),
    slots.default?.({}),
  ]);
};

/** Segmented control: one pressed button per option. The default slot can draw a sample. */
const Seg: FunctionalComponent<
  { field: ChoiceKey; label: string; options: readonly Opt[]; cols?: number; disabled?: boolean },
  Record<never, never>,
  { default: { option: Opt; on: boolean } }
> = (p, { slots }) => {
  const id = `${uid}-seg-${p.field}`;
  const current = design.value[p.field];
  return h('div', { class: 'flex flex-col gap-1.5' }, [
    h('span', { id, class: 'text-[13px] font-medium' }, p.label),
    h(
      'div',
      {
        role: 'group',
        'aria-labelledby': id,
        'data-testid': `cz-${p.field}`,
        class: 'grid gap-1 rounded-[10px] border border-rule bg-paper p-1',
        style: { gridTemplateColumns: `repeat(${p.cols ?? p.options.length}, minmax(0, 1fr))` },
      },
      p.options.map((o) => {
        const on = current === o.value;
        const content: VNodeChild = slots.default ? slots.default({ option: o, on }) : o.label;
        return h(
          'button',
          {
            key: o.value,
            type: 'button',
            title: o.title,
            class: [
              'flex min-h-8 flex-col items-center justify-center gap-1 rounded-[8px] px-1.5 py-1.5 text-center text-[12.5px] leading-tight font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40',
              on
                ? 'bg-ink-soft text-ink ring-1 ring-ink/30'
                : 'text-graphite-2 hover:bg-surface hover:text-graphite',
            ],
            'aria-pressed': on,
            disabled: !!(p.disabled || o.disabled),
            'data-testid': `cz-${p.field}-${slug(o.value)}`,
            onClick: () => set(p.field, o.value),
          },
          content,
        );
      }),
    ),
  ]);
};

/** Slider with a live readout. */
const Range: FunctionalComponent<{
  field: NumberKey;
  label: string;
  min: number;
  max: number;
  step: number;
  fmt?: (v: number) => string;
  disabled?: boolean;
}> = (p) => {
  const id = `${uid}-range-${p.field}`;
  const v = design.value[p.field];
  const text = p.fmt ? p.fmt(v) : String(v);
  return h('div', { class: 'flex flex-col gap-1' }, [
    h('div', { class: 'flex items-baseline justify-between gap-2 text-[13px]' }, [
      h('label', { for: id, class: 'font-medium' }, p.label),
      h(
        'output',
        { for: id, class: 'tabular-nums text-graphite-2', 'data-testid': `cz-${p.field}-value` },
        text,
      ),
    ]),
    h('input', {
      id,
      type: 'range',
      class: 'w-full accent-ink disabled:opacity-40',
      min: p.min,
      max: p.max,
      step: p.step,
      value: v,
      disabled: !!p.disabled,
      'aria-valuetext': text,
      'data-testid': `cz-${p.field}`,
      onInput: (e: Event) =>
        setNumber(p.field, Number((e.target as HTMLInputElement).value), {
          min: p.min,
          max: p.max,
          step: p.step,
        }),
    }),
  ]);
};

const Check: FunctionalComponent<{
  field: BoolKey;
  label: string;
  hint?: string;
  disabled?: boolean;
}> = (p) =>
  h('label', { class: 'flex items-start gap-2 text-[13px]' }, [
    h('input', {
      type: 'checkbox',
      class: 'mt-[3px] accent-ink',
      checked: design.value[p.field],
      disabled: !!p.disabled,
      'data-testid': `cz-${p.field}`,
      onChange: (e: Event) => set(p.field, (e.target as HTMLInputElement).checked),
    }),
    h('span', null, [
      p.label,
      p.hint ? h('span', { class: 'block text-[12px] text-graphite-2' }, p.hint) : null,
    ]),
  ]);

/** Tiny page diagram for the layout choices. */
const LayoutMini: FunctionalComponent<{
  two: boolean;
  side: 'left' | 'right';
  head: 'top' | 'side';
}> = (p) => {
  const block = (cls: string) => h('span', { class: ['rounded-[1px]', cls] });
  const headInSide = p.two && p.head === 'side';
  const sideCol = p.two
    ? h('span', { class: 'flex w-[36%] flex-col gap-[3px]' }, [
        headInSide ? block('h-[7px] bg-current/70') : null,
        block('flex-1 bg-current/30'),
      ])
    : null;
  return h(
    'span',
    {
      'aria-hidden': 'true',
      class:
        'flex h-11 w-9 flex-col gap-[3px] rounded-[3px] border border-current/40 bg-paper p-[3px]',
    },
    [
      headInSide ? null : block('h-[5px] bg-current/70'),
      h('span', { class: ['flex flex-1 gap-[3px]', p.side === 'right' && 'flex-row-reverse'] }, [
        sideCol,
        block('flex-1 bg-current/15'),
      ]),
    ],
  );
};

const CASE_CSS: Record<Design['headingCase'], string> = {
  upper: 'uppercase',
  capitalize: 'capitalize',
  none: 'none',
};

/** A heading drawn in the current accent, case, and line settings, on white paper. */
const HeadingSample: FunctionalComponent<{ kind: string }> = (p) => {
  const d = design.value;
  const color = d.accentOn.headings ? d.accent : d.text;
  const line = d.accentOn.headingLine ? d.accent : '#c7ccd6';
  const text = h(
    'span',
    {
      class: 'font-bold',
      style: {
        color,
        ...(p.kind === 'text-underline' ? { borderBottom: `1.5px solid ${line}` } : {}),
        textTransform: CASE_CSS[d.headingCase],
      },
    },
    'Work history',
  );
  // Mirrors doc.css so each sample looks like the resume.
  const tint = `color-mix(in srgb, ${d.accent} 12%, #fff)`;
  const styles: Record<string, Record<string, string>> = {
    underline: { borderBottom: `1.5px solid ${line}` },
    'top-line': { borderTop: `1.5px solid ${line}` },
    'top-bottom': { borderTop: `1.5px solid ${line}`, borderBottom: `1.5px solid ${line}` },
    box: { background: tint, padding: '0 4px' },
    bar: { borderLeft: `3px solid ${line}`, paddingLeft: '4px' },
  };
  const children =
    p.kind === 'line-after'
      ? [text, h('span', { class: 'flex-1', style: { background: line, height: '1.5px' } })]
      : p.kind === 'short-bar'
        ? [
            h('span', { class: 'flex flex-col gap-0.5' }, [
              text,
              h('span', { style: { background: line, height: '3px', width: '20px' } }),
            ]),
          ]
        : [text];
  return h(
    'span',
    { 'aria-hidden': 'true', class: 'flex w-full rounded-[4px] bg-white px-2 py-1.5' },
    [
      h(
        'span',
        {
          class: 'flex w-full items-center gap-1.5 text-[9.5px] leading-snug whitespace-nowrap',
          style: styles[p.kind],
        },
        children,
      ),
    ],
  );
};

// ---------------------------------------------------------------------------------------------
// Option lists. Values mirror DesignSchema exactly.

const PAGES: Opt<Design['page']>[] = [
  { value: 'A4', label: 'A4', title: '210 x 297 mm, used in most countries' },
  { value: 'Letter', label: 'US Letter', title: '8.5 x 11 in, used in the US and Canada' },
];

const COLUMNS: Opt<Design['columns']>[] = [
  { value: 'one', label: 'One column' },
  { value: 'two', label: 'Two columns' },
];

const SIDES: Opt<Design['sidebar']>[] = [
  { value: 'left', label: 'Left' },
  { value: 'right', label: 'Right' },
];

const one = computed(() => design.value.columns === 'one');

const HEADERS = computed<Opt<Design['header']>[]>(() => [
  { value: 'top', label: 'Across the top' },
  {
    value: 'side',
    label: 'In the side column',
    disabled: one.value,
    title: one.value ? 'Needs two columns' : undefined,
  },
]);

const FILLS = computed<Opt<Design['fill']>[]>(() => [
  { value: 'none', label: 'None' },
  { value: 'header', label: 'Header band' },
  {
    value: 'sidebar',
    label: 'Side column',
    disabled: one.value,
    title: one.value ? 'Needs two columns' : undefined,
  },
  { value: 'border', label: 'Page border' },
]);

const ACCENTS = [
  { hex: '#111111', name: 'Black' },
  { hex: '#1f2937', name: 'Charcoal' },
  { hex: '#334155', name: 'Slate' },
  { hex: '#1f3c88', name: 'Navy' },
  { hex: '#2563eb', name: 'Blue' },
  { hex: '#0369a1', name: 'Ocean' },
  { hex: '#0f766e', name: 'Teal' },
  { hex: '#15803d', name: 'Green' },
  { hex: '#6b21a8', name: 'Plum' },
  { hex: '#be123c', name: 'Rose' },
  { hex: '#b91c1c', name: 'Red' },
  { hex: '#7c2d12', name: 'Brown' },
] as const;

const TEXT_COLORS = [
  { hex: '#1d1d1f', name: 'Near black' },
  { hex: '#000000', name: 'Black' },
  { hex: '#1f2937', name: 'Charcoal' },
  { hex: '#374151', name: 'Dark gray' },
  { hex: '#1e293b', name: 'Dark slate' },
] as const;

const ACCENT_ON: Record<AccentKey, string> = {
  name: 'Name',
  jobTitle: 'Job title',
  headings: 'Section headings',
  headingLine: 'Heading lines',
  dates: 'Dates',
  subtitle: 'Subtitles',
  links: 'Links',
  icons: 'Icons',
  levels: 'Skill levels',
};
const ACCENT_ON_LIST = (Object.keys(ACCENT_ON) as AccentKey[]).map((key) => ({
  key,
  label: ACCENT_ON[key],
}));

const FONT_OPTS: Opt<FontKey>[] = FONT_KEYS.map((k) => ({
  value: k,
  label: FONTS[k].label,
  title: FONTS[k].serif ? 'Serif' : k === 'courier' ? 'Monospace' : 'Sans serif',
}));
const fontStack = (v: string) => FONTS[v as FontKey]?.stack;

const HEADING_STYLES: Opt<Design['headingStyle']>[] = [
  { value: 'plain', label: 'Plain' },
  { value: 'underline', label: 'Underline' },
  { value: 'line-after', label: 'Line after' },
  { value: 'box', label: 'Box' },
  { value: 'bar', label: 'Bar' },
  { value: 'top-line', label: 'Line above' },
  { value: 'top-bottom', label: 'Lines around' },
  { value: 'short-bar', label: 'Short bar' },
  { value: 'text-underline', label: 'Text underline' },
];

const CASES: Opt<Design['headingCase']>[] = [
  { value: 'upper', label: 'Uppercase' },
  { value: 'capitalize', label: 'Capitalized' },
  { value: 'none', label: 'As typed' },
];

const ALIGNS: Opt<Design['headerAlign']>[] = [
  { value: 'left', label: 'Left' },
  { value: 'center', label: 'Center' },
  { value: 'right', label: 'Right' },
];

const CONTACTS: Opt<Design['contactStyle']>[] = [
  { value: 'icons', label: 'Icons', title: 'A small icon before each detail' },
  { value: 'bullets', label: 'Bullets', title: 'Details separated by dots' },
  { value: 'bars', label: 'Bars', title: 'Details separated by vertical bars' },
  { value: 'lines', label: 'Lines', title: 'One detail per line' },
];

const PHOTOS: Opt<Design['photo']>[] = [
  { value: 'none', label: 'None' },
  { value: 'circle', label: 'Circle' },
  { value: 'rounded', label: 'Rounded' },
  { value: 'square', label: 'Square' },
  { value: 'portrait', label: 'Portrait', title: 'Taller than wide (3:4), like a passport photo' },
];
const PHOTO_SHAPE: Record<string, string> = {
  circle: 'rounded-full',
  rounded: 'rounded-[6px]',
  square: 'rounded-none',
  portrait: 'rounded-[3px] !h-7 !w-5',
};

const DATE_PLACES: Opt<Design['datePlacement']>[] = [
  { value: 'right', label: 'Right' },
  { value: 'below', label: 'Below title' },
  { value: 'left', label: 'Left column' },
];

const SUB_STYLES: Opt<Design['subtitleStyle']>[] = [
  { value: 'normal', label: 'Normal' },
  { value: 'bold', label: 'Bold' },
  { value: 'italic', label: 'Italic' },
];

const SUB_PLACES: Opt<Design['subtitlePlacement']>[] = [
  { value: 'same-line', label: 'Same line as title' },
  { value: 'next-line', label: 'Next line' },
];

const ENTRY_ORDERS: Opt<Design['entryOrder']>[] = [
  { value: 'title-first', label: 'Job or degree first', title: 'Senior Engineer, then Ledgerly' },
  {
    value: 'subtitle-first',
    label: 'Employer or school first',
    title: 'Ledgerly, then Senior Engineer',
  },
];

const BULLETS: Opt<Design['bullet']>[] = [
  { value: 'disc', label: 'Disc' },
  { value: 'hyphen', label: 'Hyphen' },
  { value: 'square', label: 'Square' },
  { value: 'arrow', label: 'Arrow' },
];
const BULLET_GLYPH: Record<string, string> = { disc: '•', hyphen: '-', square: '▪', arrow: '›' };

const SKILL_LAYOUTS: Opt<Design['skillsLayout']>[] = [
  { value: 'list', label: 'List' },
  { value: 'grid', label: 'Grid' },
  { value: 'bubbles', label: 'Bubbles' },
  { value: 'inline', label: 'Inline' },
];

const LEVELS: Opt<Design['levelStyle']>[] = [
  { value: 'text', label: 'Text' },
  { value: 'dots', label: 'Dots' },
  { value: 'bar', label: 'Bar' },
  { value: 'none', label: 'Hidden' },
];

const DATE_FORMATS: Opt<Design['dateFormat']>[] = (
  ['MM/YYYY', 'MM.YYYY', 'Mon YYYY', 'Month YYYY', 'YYYY-MM', 'YYYY/MM', 'YYYY'] as const
).map((f) => ({ value: f, label: formatMonth('2024-03', f), title: f }));

const LINK_STYLES: Opt<Design['linkStyle']>[] = [
  { value: 'underline', label: 'Underlined' },
  { value: 'plain', label: 'Plain' },
  { value: 'icon', label: 'With icon' },
];

const FOOTERS: Opt<Design['footer']>[] = [
  { value: 'none', label: 'None' },
  { value: 'page-numbers', label: 'Page numbers' },
  { value: 'name-page', label: 'Name and page number' },
  { value: 'email-page', label: 'Email and page number' },
];

const LANGS: Opt<Design['docLang']>[] = DOC_LANGS.map((l) => ({
  value: l,
  label: DOC_LANG_NAMES[l],
}));

const SAMPLE_DATES = newEntry({ start: '2021-09', present: true });
const dateExample = computed(() => formatDates(SAMPLE_DATES, design.value));

const pt = (v: number) => `${v} pt`;
const mm = (v: number) => `${v} mm`;
const percent = (v: number) => `${v}%`;
const fixed2 = (v: number) => v.toFixed(2);
const relative = (v: number) => `${Math.round(v * 100)}%`;

// Contrast against white paper (WCAG relative luminance), to warn about hard-to-read colors.
function contrastOnWhite(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 1.05 / (0.2126 * r + 0.7152 * g + 0.0722 * b + 0.05);
}
const accentLight = computed(() => contrastOnWhite(design.value.accent) < 3);
const textLight = computed(() => contrastOnWhite(design.value.text) < 4.5);

const sameColor = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const inputValue = (e: Event) => (e.target as HTMLInputElement).value;
</script>

<template>
  <div class="@container flex flex-col gap-4" data-testid="customize">
    <Card title="Page">
      <Seg field="page" label="Paper size" :options="PAGES" />
      <Seg field="docLang" label="Resume language" :options="LANGS" :cols="3" />
      <p class="text-[12.5px] text-graphite-2">
        Section titles, month names, "Present", and level words follow this language. Titles you
        renamed stay as you wrote them.
      </p>
    </Card>

    <Card title="Layout">
      <Seg field="columns" label="Columns" :options="COLUMNS">
        <template #default="{ option }">
          <LayoutMini :two="option.value === 'two'" :side="design.sidebar" head="top" />
          {{ option.label }}
        </template>
      </Seg>

      <fieldset :disabled="one" class="flex flex-col gap-4">
        <legend class="sr-only">Side column</legend>
        <p v-if="one" class="text-[12.5px] text-graphite-2">
          Side column settings apply when you pick two columns.
        </p>
        <Seg field="sidebar" label="Side column position" :options="SIDES">
          <template #default="{ option }">
            <LayoutMini
              :two="true"
              :side="option.value === 'right' ? 'right' : 'left'"
              head="top"
            />
            {{ option.label }}
          </template>
        </Seg>
        <Range
          field="sideWidth"
          label="Side column width"
          :min="20"
          :max="50"
          :step="1"
          :fmt="percent"
        />
      </fieldset>

      <Seg field="header" label="Header position" :options="HEADERS">
        <template #default="{ option }">
          <LayoutMini
            :two="option.value === 'side' || !one"
            :side="design.sidebar"
            :head="option.value === 'side' ? 'side' : 'top'"
          />
          {{ option.label }}
        </template>
      </Seg>
    </Card>

    <Card title="Spacing">
      <div class="grid gap-x-5 gap-y-3 @md:grid-cols-2">
        <Range field="fontSize" label="Text size" :min="8" :max="13" :step="0.5" :fmt="pt" />
        <Range
          field="lineHeight"
          label="Line height"
          :min="1"
          :max="1.8"
          :step="0.05"
          :fmt="fixed2"
        />
        <Range field="marginX" label="Side margins" :min="6" :max="30" :step="1" :fmt="mm" />
        <Range
          field="marginY"
          label="Top and bottom margins"
          :min="6"
          :max="30"
          :step="1"
          :fmt="mm"
        />
        <Range field="entrySpacing" label="Space between entries" :min="0" :max="16" :step="1" />
        <Range field="sectionSpacing" label="Space between sections" :min="2" :max="24" :step="1" />
      </div>
    </Card>

    <Card title="Colors">
      <div class="flex flex-col gap-1.5">
        <span :id="`${uid}-accent`" class="text-[13px] font-medium">Accent color</span>
        <div
          role="group"
          :aria-labelledby="`${uid}-accent`"
          class="flex flex-wrap items-center gap-2"
        >
          <button
            v-for="c in ACCENTS"
            :key="c.hex"
            type="button"
            class="grid size-7 place-items-center rounded-full border border-black/10 text-white"
            :class="
              sameColor(design.accent, c.hex) && 'ring-2 ring-ink ring-offset-2 ring-offset-paper'
            "
            :style="{ background: c.hex }"
            :title="c.name"
            :aria-label="c.name"
            :aria-pressed="sameColor(design.accent, c.hex)"
            :data-testid="`cz-accent-${c.hex.slice(1)}`"
            @click="set('accent', c.hex)"
          >
            <Icon v-if="sameColor(design.accent, c.hex)" name="check" :size="14" />
          </button>
          <label class="flex items-center gap-1.5 text-[12.5px] text-graphite-2">
            <input
              type="color"
              class="h-7 w-10 cursor-pointer rounded-[6px] border border-rule bg-paper p-0.5"
              :value="design.accent.toLowerCase()"
              aria-label="Custom accent color"
              data-testid="cz-accent"
              @input="set('accent', inputValue($event))"
            />
            <span class="font-mono uppercase">{{ design.accent }}</span>
          </label>
        </div>
        <p v-if="accentLight" class="text-[12.5px] text-carbon-pink-text">
          This accent is light, so text in it may be hard to read on white paper.
        </p>
      </div>

      <div class="flex flex-col gap-1.5">
        <span :id="`${uid}-text`" class="text-[13px] font-medium">Text color</span>
        <div
          role="group"
          :aria-labelledby="`${uid}-text`"
          class="flex flex-wrap items-center gap-2"
        >
          <button
            v-for="c in TEXT_COLORS"
            :key="c.hex"
            type="button"
            class="grid size-7 place-items-center rounded-full border border-black/10 text-white"
            :class="
              sameColor(design.text, c.hex) && 'ring-2 ring-ink ring-offset-2 ring-offset-paper'
            "
            :style="{ background: c.hex }"
            :title="c.name"
            :aria-label="c.name"
            :aria-pressed="sameColor(design.text, c.hex)"
            :data-testid="`cz-text-${c.hex.slice(1)}`"
            @click="set('text', c.hex)"
          >
            <Icon v-if="sameColor(design.text, c.hex)" name="check" :size="14" />
          </button>
          <label class="flex items-center gap-1.5 text-[12.5px] text-graphite-2">
            <input
              type="color"
              class="h-7 w-10 cursor-pointer rounded-[6px] border border-rule bg-paper p-0.5"
              :value="design.text.toLowerCase()"
              aria-label="Custom text color"
              data-testid="cz-text"
              @input="set('text', inputValue($event))"
            />
            <span class="font-mono uppercase">{{ design.text }}</span>
          </label>
        </div>
        <p v-if="textLight" class="text-[12.5px] text-carbon-pink-text">
          This text color is light. Recruiters and screening software read dark text best.
        </p>
      </div>

      <Seg field="fill" label="Color fill" :options="FILLS" />

      <fieldset class="flex flex-col">
        <legend class="mb-1.5 text-[13px] font-medium">Apply accent to</legend>
        <div class="grid grid-cols-2 gap-x-3 gap-y-1.5 @md:grid-cols-3">
          <label
            v-for="a in ACCENT_ON_LIST"
            :key="a.key"
            class="flex items-center gap-2 text-[13px]"
          >
            <input
              type="checkbox"
              class="accent-ink"
              :checked="design.accentOn[a.key]"
              :data-testid="`cz-accentOn-${a.key}`"
              @change="setAccentOn(a.key, ($event.target as HTMLInputElement).checked)"
            />
            {{ a.label }}
          </label>
        </div>
      </fieldset>
    </Card>

    <Card title="Typography">
      <Seg field="font" label="Font" :options="FONT_OPTS" :cols="2">
        <template #default="{ option }">
          <span class="text-[14px] font-normal" :style="{ fontFamily: fontStack(option.value) }">
            {{ option.label }}
          </span>
          <span class="text-[11px] font-normal text-graphite-2">{{ option.title }}</span>
        </template>
      </Seg>

      <label class="flex flex-col gap-1 text-[13px] font-medium">
        Heading font
        <select
          class="field-input px-2.5 py-1.5 font-normal"
          :value="design.headingFont"
          data-testid="cz-headingFont"
          @change="
            set('headingFont', ($event.target as HTMLSelectElement).value as Design['headingFont'])
          "
        >
          <option value="same">Same as text</option>
          <option
            v-for="k in FONT_KEYS"
            :key="k"
            :value="k"
            :style="{ fontFamily: FONTS[k].stack }"
          >
            {{ FONTS[k].label }}
          </option>
        </select>
      </label>

      <Range field="nameSize" label="Name size" :min="16" :max="40" :step="1" :fmt="pt" />
      <Check field="nameBold" label="Bold name" />
    </Card>

    <Card title="Section headings">
      <Seg field="headingStyle" label="Style" :options="HEADING_STYLES" :cols="3">
        <template #default="{ option }">
          <HeadingSample :kind="option.value" />
          {{ option.label }}
        </template>
      </Seg>
      <Seg field="headingCase" label="Letter case" :options="CASES">
        <template #default="{ option }">
          <span
            :class="{
              uppercase: option.value === 'upper',
              capitalize: option.value === 'capitalize',
            }"
          >
            {{ option.label }}
          </span>
        </template>
      </Seg>
      <Range
        field="headingSize"
        label="Heading size (relative to text)"
        :min="0.9"
        :max="1.6"
        :step="0.05"
        :fmt="relative"
      />
      <Check field="headingIcons" label="Icons next to headings" />
    </Card>

    <Card title="Header">
      <Seg field="headerAlign" label="Alignment" :options="ALIGNS">
        <template #default="{ option }">
          <span
            aria-hidden="true"
            class="flex w-9 flex-col gap-[3px]"
            :class="{
              'items-start': option.value === 'left',
              'items-center': option.value === 'center',
              'items-end': option.value === 'right',
            }"
          >
            <span class="h-[4px] w-[80%] rounded-full bg-current/70" />
            <span class="h-[3px] w-[50%] rounded-full bg-current/40" />
            <span class="h-[3px] w-[65%] rounded-full bg-current/40" />
          </span>
          {{ option.label }}
        </template>
      </Seg>
      <Seg field="contactStyle" label="Contact details" :options="CONTACTS" />
      <Seg field="photo" label="Photo" :options="PHOTOS">
        <template #default="{ option }">
          <span
            v-if="option.value === 'none'"
            aria-hidden="true"
            class="grid size-6 place-items-center rounded-[4px] border border-dashed border-current/50"
          >
            <Icon name="x" :size="12" />
          </span>
          <span
            v-else
            aria-hidden="true"
            class="size-6 bg-current/30"
            :class="PHOTO_SHAPE[option.value]"
          />
          {{ option.label }}
        </template>
      </Seg>
      <Range
        field="photoSize"
        label="Photo size"
        :min="40"
        :max="140"
        :step="1"
        :disabled="design.photo === 'none'"
      />
      <Check
        field="photoGrayscale"
        label="Black and white photo"
        :disabled="design.photo === 'none'"
      />
    </Card>

    <Card title="Entries" hint="Jobs, degrees, projects, and the other items in each section.">
      <Seg field="datePlacement" label="Dates" :options="DATE_PLACES">
        <template #default="{ option }">
          <span
            aria-hidden="true"
            class="flex w-10 gap-[3px]"
            :class="{
              'flex-col': option.value === 'below',
              'items-center': option.value !== 'below',
              'flex-row-reverse': option.value === 'left',
            }"
          >
            <span
              class="h-[4px] rounded-full bg-current/70"
              :class="option.value === 'below' ? 'w-full' : 'flex-1'"
            />
            <span class="h-[3px] w-2.5 rounded-full bg-current/40" />
          </span>
          {{ option.label }}
        </template>
      </Seg>
      <Seg field="subtitleStyle" label="Subtitle style" :options="SUB_STYLES">
        <template #default="{ option }">
          <span
            :class="{
              'font-normal': option.value === 'normal',
              'font-bold': option.value === 'bold',
              'font-normal italic': option.value === 'italic',
            }"
          >
            {{ option.label }}
          </span>
        </template>
      </Seg>
      <Seg field="entryOrder" label="Bold line" :options="ENTRY_ORDERS" />
      <Seg field="subtitlePlacement" label="Subtitle position" :options="SUB_PLACES" />
      <Seg field="bullet" label="Bullet points" :options="BULLETS">
        <template #default="{ option }">
          <span aria-hidden="true" class="text-[15px] leading-none">
            {{ BULLET_GLYPH[option.value] }}
          </span>
          {{ option.label }}
        </template>
      </Seg>
      <div class="flex flex-col gap-2">
        <Check field="locationWithDate" label="Show the city and country next to the dates" />
        <Check field="indentDescription" label="Indent descriptions under the title" />
      </div>
    </Card>

    <Card title="Skills and languages">
      <Seg field="skillsLayout" label="Layout" :options="SKILL_LAYOUTS">
        <template #default="{ option }">
          <span aria-hidden="true" class="flex h-4 w-10 items-center justify-center">
            <span v-if="option.value === 'list'" class="flex w-full flex-col gap-[3px]">
              <span v-for="n in 3" :key="n" class="h-[3px] w-full rounded-full bg-current/50" />
            </span>
            <span v-else-if="option.value === 'grid'" class="grid w-full grid-cols-2 gap-[3px]">
              <span v-for="n in 4" :key="n" class="h-[3px] rounded-full bg-current/50" />
            </span>
            <span v-else-if="option.value === 'bubbles'" class="flex w-full flex-wrap gap-[2px]">
              <span
                v-for="n in 3"
                :key="n"
                class="h-[6px] w-[11px] rounded-full border border-current/60"
              />
            </span>
            <span v-else class="flex w-full items-center gap-[2px]">
              <template v-for="n in 3" :key="n">
                <span v-if="n > 1" class="size-[2px] rounded-full bg-current/60" />
                <span class="h-[3px] flex-1 rounded-full bg-current/50" />
              </template>
            </span>
          </span>
          {{ option.label }}
        </template>
      </Seg>
      <Seg field="levelStyle" label="Level" :options="LEVELS">
        <template #default="{ option }">
          <span aria-hidden="true" class="flex h-4 w-10 items-center justify-center">
            <span v-if="option.value === 'text'" class="text-[10px] font-normal">Expert</span>
            <span v-else-if="option.value === 'dots'" class="flex gap-[2px]">
              <span
                v-for="n in 5"
                :key="n"
                class="size-[5px] rounded-full"
                :class="n <= 3 ? 'bg-current' : 'bg-current/25'"
              />
            </span>
            <span
              v-else-if="option.value === 'bar'"
              class="h-[4px] w-full overflow-hidden rounded-full bg-current/25"
            >
              <span class="block h-full w-[60%] rounded-full bg-current" />
            </span>
            <span v-else class="h-px w-4 bg-current/40" />
          </span>
          {{ option.label }}
        </template>
      </Seg>
    </Card>

    <Card title="Dates and links">
      <Seg field="dateFormat" label="Date format" :options="DATE_FORMATS" :cols="3" />
      <label class="flex flex-col gap-1 text-[13px] font-medium">
        Word for dates that are still ongoing
        <input
          class="field-input px-2.5 py-1.5 font-normal"
          :value="design.presentLabel"
          maxlength="24"
          :placeholder="DOC_STRINGS[design.docLang].present"
          data-testid="cz-presentLabel"
          @input="set('presentLabel', inputValue($event))"
        />
      </label>
      <p class="text-[12.5px] text-graphite-2" data-testid="cz-date-example">
        Example: {{ dateExample }}
      </p>
      <Seg field="linkStyle" label="Links" :options="LINK_STYLES">
        <template #default="{ option }">
          <span :class="{ underline: option.value === 'underline' }">
            <span v-if="option.value === 'icon'" aria-hidden="true">↗ </span>{{ option.label }}
          </span>
        </template>
      </Seg>
    </Card>

    <Card title="Footer">
      <Seg field="footer" label="At the bottom of each page" :options="FOOTERS" />
    </Card>
  </div>
</template>
