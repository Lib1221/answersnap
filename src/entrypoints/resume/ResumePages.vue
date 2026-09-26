<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import { PAGE_MM } from '@/kb/resume/format';
import type { Resume } from '@/kb/resume/model';
import { FONTS } from '@/kb/resume/templates';
import { buildBlocks, paginate, type Block, type Page } from './doc/blocks';
import DocBlock from './doc/DocBlock.vue';
import './doc/doc.css';

// Renders a resume as real pages. Every block is measured at true size, then packed onto pages
// so that the preview and the printed PDF break in exactly the same places.

const props = defineProps<{ resume: Resume; firstPageOnly?: boolean }>();
const emit = defineEmits<{
  pages: [count: number];
  /** True when a single piece (one paragraph, one bullet) is taller than a page and gets cut. */
  overflow: [tooTall: boolean];
}>();

const MM = 96 / 25.4;
const d = computed(() => props.resume.design);
const two = computed(() => d.value.columns === 'two');
const blocks = computed(() => buildBlocks(props.resume));
const header = computed(() => blocks.value.find((b) => b.kind === 'header')!);
const headerInSide = computed(() => header.value.column === 'side');

/** Bottom margin in mm: at least 12 mm when the footer is on, so it never covers text. */
const bottomMm = computed(() =>
  d.value.footer === 'none' ? d.value.marginY : Math.max(d.value.marginY, 12),
);

const vars = computed(() => {
  const x = d.value;
  const page = PAGE_MM[x.page];
  const font = FONTS[x.font].stack;
  const headingFont = x.headingFont === 'same' ? font : FONTS[x.headingFont].stack;
  const muted = `color-mix(in srgb, ${x.text} 55%, #fff)`;
  return {
    '--rd-page-w': `${page.w}mm`,
    '--rd-page-h': `${page.h}mm`,
    '--rd-mx': `${x.marginX}mm`,
    '--rd-my': `${x.marginY}mm`,
    '--rd-mb': `${bottomMm.value}mm`,
    '--rd-side-w': `calc((${page.w}mm - ${2 * x.marginX}mm - 7mm) * ${x.sideWidth / 100})`,
    '--rd-font': font,
    '--rd-heading-font': headingFont,
    '--rd-size': `${x.fontSize}pt`,
    '--rd-lh': String(x.lineHeight),
    '--rd-name-size': `${x.nameSize}pt`,
    '--rd-name-weight': x.nameBold ? '700' : '400',
    '--rd-heading-size': `${x.headingSize}em`,
    '--rd-heading-case':
      x.headingCase === 'upper'
        ? 'uppercase'
        : x.headingCase === 'capitalize'
          ? 'capitalize'
          : 'none',
    '--rd-heading-spacing': x.headingCase === 'upper' ? '0.06em' : '0',
    '--rd-heading-color': x.accentOn.headings ? x.accent : x.text,
    '--rd-line-color': x.accentOn.headingLine ? x.accent : muted,
    '--rd-level-color': x.accentOn.levels ? x.accent : x.text,
    '--rd-accent': x.accent,
    '--rd-text': x.text,
    '--rd-tint': `color-mix(in srgb, ${x.accent} 12%, #fff)`,
    '--rd-entry-gap': `${x.entrySpacing}pt`,
    '--rd-section-gap': `${x.sectionSpacing}pt`,
    '--rd-photo-size': `${x.photoSize}px`,
  } as Record<string, string>;
});

const pageClass = computed(() => [
  `rd-sidebar-${d.value.sidebar}`,
  `rd-bullet-${d.value.bullet}`,
  `rd-links-${d.value.linkStyle}`,
  {
    'rd-fill-sidebar': two.value && d.value.fill === 'sidebar',
    'rd-fill-border': d.value.fill === 'border',
  },
]);

// Measuring: one tall page with every block in its column, off screen.
const measureRoot = ref<HTMLElement | null>(null);
const pages = shallowRef<Page[]>([]);

function measure() {
  const root = measureRoot.value;
  if (!root) return;
  const sheet = root.firstElementChild as HTMLElement | null;
  if (!sheet?.offsetWidth) return;
  // The preview and the gallery thumbnails scale the pages with a CSS transform, and
  // getBoundingClientRect reports scaled sizes. Divide the scale out: pages are packed in true px.
  const k = sheet.getBoundingClientRect().width / sheet.offsetWidth || 1;
  const heights = new Map<string, number>();
  const spacing = new Map<string, number>();
  let headerHeight = 0;
  for (const el of root.querySelectorAll<HTMLElement>('[data-block]')) {
    const id = el.dataset.block!;
    const block = el.firstElementChild as HTMLElement;
    const style = getComputedStyle(block);
    const mt = parseFloat(style.marginTop) || 0;
    const mb = parseFloat(style.marginBottom) || 0;
    const h = block.getBoundingClientRect().height / k;
    if (id === 'header') {
      // A filled header bleeds into the top margin; count only what it takes from the content.
      // In the side column its bottom margin merges with the next section's top margin, which
      // that section already counts.
      headerHeight = Math.max(0, h + mt + (headerInSide.value ? 0 : mb));
      heights.set(id, headerHeight);
      spacing.set(id, 0);
    } else {
      heights.set(id, h + mt);
      spacing.set(id, mt);
    }
  }
  const page = PAGE_MM[d.value.page];
  const capacity = (page.h - d.value.marginY - bottomMm.value) * MM - 1;
  emit(
    'overflow',
    [...heights].some(([id, h]) => h - (spacing.get(id) ?? 0) > capacity),
  );
  pages.value = paginate(
    blocks.value,
    heights,
    spacing,
    capacity,
    headerHeight,
    headerInSide.value,
  );
  emit('pages', pages.value.length);
}

let timer = 0;
function schedule() {
  clearTimeout(timer);
  timer = window.setTimeout(async () => {
    await nextTick();
    await document.fonts?.ready;
    measure();
  }, 30);
}
watch(() => props.resume, schedule, { deep: true });
onMounted(schedule);
onBeforeUnmount(() => clearTimeout(timer));

const shown = computed(() => (props.firstPageOnly ? pages.value.slice(0, 1) : pages.value));

function firstIn(list: Block[], b: Block) {
  return list[0] === b;
}
defineExpose({ pages });
</script>

<template>
  <div class="rd-root">
    <!-- Off-screen measuring copy -->
    <div ref="measureRoot" class="rd-measure" aria-hidden="true">
      <div class="rd-page" :class="pageClass" :style="{ ...vars, height: 'auto' }">
        <div v-if="!headerInSide" data-block="header">
          <DocBlock :block="header" :resume="resume" />
        </div>
        <div v-if="two" class="rd-columns">
          <div class="rd-col-main">
            <div
              v-for="b in blocks.filter((x) => x.column === 'main')"
              :key="b.id"
              :data-block="b.id"
            >
              <DocBlock :block="b" :resume="resume" />
            </div>
          </div>
          <div class="rd-col-side">
            <div v-if="headerInSide" data-block="header">
              <DocBlock :block="header" :resume="resume" />
            </div>
            <div
              v-for="b in blocks.filter((x) => x.column === 'side')"
              :key="b.id"
              :data-block="b.id"
            >
              <DocBlock :block="b" :resume="resume" />
            </div>
          </div>
        </div>
        <div v-else>
          <div
            v-for="b in blocks.filter((x) => x.column !== 'full')"
            :key="b.id"
            :data-block="b.id"
          >
            <DocBlock :block="b" :resume="resume" />
          </div>
        </div>
      </div>
    </div>

    <!-- The pages -->
    <div
      v-for="(pg, i) in shown"
      :key="i"
      class="rd-page"
      :class="pageClass"
      :style="vars"
      data-testid="resume-page"
    >
      <DocBlock v-if="pg.header && !headerInSide" :block="header" :resume="resume" />
      <div v-if="two" class="rd-columns">
        <div class="rd-col-main">
          <DocBlock
            v-for="b in pg.main"
            :key="b.id"
            :block="b"
            :resume="resume"
            :class="{ 'rd-first': firstIn(pg.main, b) }"
          />
        </div>
        <div class="rd-col-side">
          <DocBlock
            v-for="b in pg.side"
            :key="b.id"
            :block="b"
            :resume="resume"
            :class="{ 'rd-first': firstIn(pg.side, b) && b.kind !== 'header' }"
          />
        </div>
      </div>
      <div v-else>
        <DocBlock
          v-for="b in pg.main"
          :key="b.id"
          :block="b"
          :resume="resume"
          :class="{ 'rd-first': firstIn(pg.main, b) }"
        />
      </div>
      <footer v-if="d.footer !== 'none' && !firstPageOnly" class="rd-footer">
        <span>{{
          d.footer === 'name-page'
            ? resume.personal.fullName
            : d.footer === 'email-page'
              ? resume.personal.email
              : ''
        }}</span>
        <span>{{ i + 1 }} / {{ pages.length }}</span>
      </footer>
    </div>
  </div>
</template>

<style>
@media print {
  .rd-measure {
    display: none !important;
  }
}
.rd-measure {
  position: absolute;
  left: -10000px;
  top: 0;
  visibility: hidden;
  pointer-events: none;
}
</style>
