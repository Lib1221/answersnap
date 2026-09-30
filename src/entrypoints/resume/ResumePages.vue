<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import { PAGE_MM } from '@/kb/resume/format';
import type { Resume } from '@/kb/resume/model';
import { FONTS, headingFontOf, nameFontOf } from '@/kb/resume/fonts';
import { bottomMarginMm, pageClasses, pageVars } from './doc/pageStyle';
import { buildBlocks, paginate, type Block, type Page } from './doc/blocks';
import DocBlock from './doc/DocBlock.vue';
import './doc/doc.css';
import './doc/fonts.css';

// Renders a resume as real pages. Every block is measured at true size, then packed onto pages
// so that the preview and the printed PDF break in exactly the same places.

const props = defineProps<{ resume: Resume; firstPageOnly?: boolean }>();
const emit = defineEmits<{
  /** The page count, and the updatedAt of the resume measured (so a caller can wait for its own
   * change to be measured). */
  pages: [count: number, updatedAt: string];
  /** True when a single piece (one paragraph, one bullet) is taller than a page and gets cut. */
  overflow: [tooTall: boolean];
}>();

const MM = 96 / 25.4;
const d = computed(() => props.resume.design);
const two = computed(() => d.value.columns === 'two');
const blocks = computed(() => buildBlocks(props.resume));
const header = computed(() => blocks.value.find((b) => b.kind === 'header')!);
const headerInSide = computed(() => header.value.column === 'side');

const nameFontKey = computed(() => nameFontOf(d.value));

/**
 * Bundled fonts load on first use. Load the ones this resume uses (regular, bold, italic) before
 * measuring, so pages are packed with the real font, not a fallback that is about to change.
 */
async function fontsLoaded() {
  const x = d.value;
  const keys = [x.font, headingFontOf(x), nameFontKey.value];
  const loads = [...new Set(keys)].flatMap((k) =>
    FONTS[k].bundled
      ? ['400', '700', 'italic 400'].map((style) =>
          document.fonts.load(`${style} 12px "${FONTS[k].family}"`).catch(() => []),
        )
      : [],
  );
  await Promise.all(loads);
  await document.fonts.ready;
}

const bottomMm = computed(() => bottomMarginMm(d.value));
const vars = computed(() => pageVars(d.value));
const pageClass = computed(() => pageClasses(d.value));

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
  // Blocks fill the page down to its bottom margin. A page clips only at its edge, so a sub-pixel
  // difference between this measure and the print lands in the margin, unseen.
  const capacity = (page.h - d.value.marginY - bottomMm.value) * MM;
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
  emit('pages', pages.value.length, props.resume.updatedAt);
}

let timer = 0;
function schedule() {
  clearTimeout(timer);
  timer = window.setTimeout(async () => {
    await nextTick();
    await fontsLoaded();
    measure();
  }, 30);
}
watch(() => props.resume, schedule, { deep: true });
onMounted(() => {
  schedule();
  // Any font finishing later (an Ethiopic name, a heading font) re-measures the pages.
  document.fonts.addEventListener('loadingdone', schedule);
});
onBeforeUnmount(() => {
  clearTimeout(timer);
  document.fonts.removeEventListener('loadingdone', schedule);
});

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
