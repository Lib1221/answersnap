<script setup lang="ts">
import { nextTick, ref, useId, type CSSProperties } from 'vue';
import type { Design } from '@/kb/resume/model';
import { MY_TEMPLATE_PREFIX, type MyTemplate } from '@/kb/resume/store';
import { FONTS } from '@/kb/resume/fonts';
import { TEMPLATES, applyTemplate } from '@/kb/resume/templates';
import Icon from '@/ui/AppIcon.vue';

// Template picker. A template is a preset over the design controls: picking one replaces the
// design and never touches the content. The parent can draw a live mini preview in the "thumb"
// slot; without it each card shows a schematic of the template's layout and colors.

const props = defineProps<{ current: string; mine: MyTemplate[] }>();
const emit = defineEmits<{
  pick: [id: string];
  pickMine: [template: MyTemplate];
  saveMine: [name: string];
  deleteMine: [id: string];
}>();
defineSlots<{ thumb?: (scope: { design: Design }) => unknown }>();

const items = TEMPLATES.map((t) => ({ t, d: applyTemplate(t.id) }));
const uid = useId();
const root = ref<HTMLElement | null>(null);

/** Name of the design just applied or saved, for the status line. */
const note = ref('');

function pick(id: string) {
  note.value = `${TEMPLATES.find((t) => t.id === id)?.name ?? ''} applied. Your content stays; only the design changes.`;
  emit('pick', id);
}

// ---- My templates
const newName = ref('');
const confirming = ref<string | null>(null);
const isMine = (t: MyTemplate) => props.current === `${MY_TEMPLATE_PREFIX}${t.id}`;

function pickMine(t: MyTemplate) {
  note.value = `${t.name} applied. Your content stays; only the design changes.`;
  emit('pickMine', t);
}
function saveMine() {
  const name = newName.value.trim();
  if (!name) return;
  const replacing = props.mine.some((t) => t.name.toLowerCase() === name.toLowerCase());
  emit('saveMine', name);
  note.value = replacing
    ? `${name} updated with the current design.`
    : `Saved as ${name}. Apply it to any of your resumes from here.`;
  newName.value = '';
}
async function askDelete(id: string) {
  confirming.value = id;
  await nextTick();
  root.value?.querySelector<HTMLElement>('[data-testid="my-template-delete-confirm"]')?.focus();
}
async function cancelDelete(id: string) {
  confirming.value = null;
  await nextTick();
  root.value?.querySelector<HTMLElement>(`[data-delete-for="${id}"]`)?.focus();
}
function confirmDelete(t: MyTemplate) {
  confirming.value = null;
  note.value = `${t.name} deleted.`;
  emit('deleteMine', t.id);
}

// Schematic colors. The page is paper white in both themes, like the real resume.
const LINE = '#d9dce3';
const MUTED_LINE = '#c7ccd6';
const tint = (hex: string, pct: number) => `color-mix(in srgb, ${hex} ${pct}%, white)`;

function nameColor(d: Design) {
  if (d.fill === 'header') return '#ffffff';
  return d.accentOn.name ? d.accent : d.text;
}
function subColor(d: Design) {
  if (d.fill === 'header') return 'rgb(255 255 255 / 0.7)';
  return d.accentOn.jobTitle ? d.accent : '#9aa0aa';
}
function contactColor(d: Design) {
  return d.fill === 'header' ? 'rgb(255 255 255 / 0.5)' : LINE;
}
function headingColor(d: Design) {
  return d.headingStyle === 'bar' ? '#ffffff' : d.accentOn.headings ? d.accent : d.text;
}
function headingWrap(d: Design): CSSProperties {
  const line = d.accentOn.headingLine ? d.accent : MUTED_LINE;
  switch (d.headingStyle) {
    case 'underline':
      return { borderBottom: `1px solid ${line}`, paddingBottom: '2px' };
    case 'top-line':
      return { borderTop: `1px solid ${line}`, paddingTop: '2px' };
    case 'box':
      return { border: `1px solid ${line}`, padding: '2px 3px' };
    case 'bar':
      return { background: d.accentOn.headings ? d.accent : d.text, padding: '2px 3px' };
    default:
      return {};
  }
}
function headingLine(d: Design) {
  return d.accentOn.headingLine ? d.accent : MUTED_LINE;
}

const ALIGN = { left: 'items-start', center: 'items-center', right: 'items-end' } as const;

/** Side column drawn full height: tinted side columns and headers placed in the side column. */
const fullSide = (d: Design) =>
  d.columns === 'two' && (d.fill === 'sidebar' || d.header === 'side');

function meta(d: Design) {
  return `${FONTS[d.font].label}, ${d.columns === 'two' ? 'two columns' : 'one column'}`;
}
</script>

<template>
  <div ref="root" class="flex flex-col gap-3" data-testid="templates">
    <p class="text-[13px] text-graphite-2">
      Pick a starting design. Every setting stays editable under Customize.
    </p>
    <div role="status" aria-live="polite">
      <p v-if="note" class="success text-[13px]" data-testid="template-note">{{ note }}</p>
    </div>

    <section class="flex flex-col gap-2" :aria-labelledby="`${uid}-mine`">
      <h3 :id="`${uid}-mine`" class="eyebrow">My templates</h3>
      <form class="flex gap-2" @submit.prevent="saveMine">
        <label :for="`${uid}-name`" class="sr-only">Name for the current design</label>
        <input
          :id="`${uid}-name`"
          v-model="newName"
          maxlength="60"
          placeholder="Name, such as Italian CV"
          class="field-input min-w-0 flex-1 px-2.5 py-1.5 text-[13px]"
          data-testid="my-template-name"
        />
        <button
          type="submit"
          class="btn shrink-0 text-[13px]"
          :disabled="!newName.trim()"
          data-testid="my-template-save"
        >
          Save current design
        </button>
      </form>
      <p v-if="!mine.length" class="text-[12.5px] text-graphite-2">
        Customized a design you like? Save it here to reuse it on your other resumes.
      </p>
      <ul v-else class="grid grid-cols-[repeat(auto-fill,minmax(168px,1fr))] gap-3">
        <li v-for="t in mine" :key="t.id" class="flex flex-col gap-1.5" data-testid="my-template">
          <button
            type="button"
            class="card flex w-full flex-col overflow-hidden text-left transition-shadow hover:shadow-md"
            :class="isMine(t) ? 'ring-2 ring-ink ring-offset-2 ring-offset-surface' : ''"
            :aria-pressed="isMine(t)"
            data-testid="my-template-apply"
            @click="pickMine(t)"
          >
            <span
              class="relative block aspect-[210/297] w-full overflow-hidden border-b border-rule bg-surface p-3"
              aria-hidden="true"
              :inert="true"
            >
              <slot name="thumb" :design="t.design" />
            </span>
            <span class="flex items-center justify-between gap-2 p-3">
              <span
                class="truncate font-medium"
                :style="{ fontFamily: FONTS[t.design.font].stack }"
              >
                {{ t.name }}
              </span>
              <span
                v-if="isMine(t)"
                class="inline-flex shrink-0 items-center gap-1 text-[12px] font-medium text-ink"
              >
                <Icon name="check" :size="13" /> Current
              </span>
            </span>
          </button>
          <div v-if="confirming === t.id" class="flex items-center gap-1.5 text-[12.5px]">
            <span class="text-carbon-pink-text">Delete?</span>
            <button
              type="button"
              class="btn min-h-7 border-carbon-pink-text px-2 text-[12.5px] text-carbon-pink-text"
              data-testid="my-template-delete-confirm"
              @click="confirmDelete(t)"
            >
              Delete
            </button>
            <button
              type="button"
              class="btn btn-quiet min-h-7 px-2 text-[12.5px]"
              @click="cancelDelete(t.id)"
            >
              Cancel
            </button>
          </div>
          <button
            v-else
            type="button"
            class="btn btn-quiet min-h-7 self-start px-2 text-[12.5px] text-graphite-2"
            :aria-label="`Delete ${t.name}`"
            :data-delete-for="t.id"
            data-testid="my-template-delete"
            @click="askDelete(t.id)"
          >
            Delete
          </button>
        </li>
      </ul>
    </section>

    <h3 class="eyebrow">Templates</h3>

    <ul class="grid grid-cols-[repeat(auto-fill,minmax(168px,1fr))] gap-3">
      <li v-for="{ t, d } in items" :key="t.id" class="flex">
        <button
          type="button"
          class="card flex w-full flex-col overflow-hidden text-left transition-shadow hover:shadow-md"
          :class="props.current === t.id ? 'ring-2 ring-ink ring-offset-2 ring-offset-surface' : ''"
          :aria-pressed="props.current === t.id"
          :data-testid="`template-${t.id}`"
          @click="pick(t.id)"
        >
          <span
            class="relative block aspect-[210/297] w-full overflow-hidden border-b border-rule bg-surface p-3"
            aria-hidden="true"
            :inert="true"
          >
            <slot name="thumb" :design="d">
              <!-- Fallback schematic: layout, header alignment, fill, and accent. -->
              <span class="flex h-full w-full overflow-hidden rounded-[3px] bg-white shadow-sm">
                <span
                  class="flex h-full w-full"
                  :class="[
                    fullSide(d) ? 'flex-row' : 'flex-col',
                    fullSide(d) && d.sidebar === 'right' && 'flex-row-reverse',
                  ]"
                >
                  <!-- Full-height side column -->
                  <span
                    v-if="fullSide(d)"
                    class="flex h-full flex-col gap-[8px] px-[5%] pt-[14px]"
                    :style="{
                      width: `${d.sideWidth}%`,
                      background: d.fill === 'sidebar' ? tint(d.accent, 14) : undefined,
                    }"
                  >
                    <span v-if="d.header === 'side'" class="flex flex-col gap-[3px]">
                      <span
                        class="h-[6px] w-[80%] rounded-full"
                        :style="{ background: nameColor(d) }"
                      />
                      <span
                        class="h-[3px] w-[55%] rounded-full"
                        :style="{ background: subColor(d) }"
                      />
                    </span>
                    <span v-for="n in 2" :key="n" class="flex flex-col gap-[3px]">
                      <span class="flex items-center gap-[3px]" :style="headingWrap(d)">
                        <span
                          class="h-[3px] w-[55%] rounded-full"
                          :style="{ background: headingColor(d) }"
                        />
                        <span
                          v-if="d.headingStyle === 'line-after'"
                          class="h-px flex-1"
                          :style="{ background: headingLine(d) }"
                        />
                      </span>
                      <span
                        v-for="w in ['85%', '70%', '78%']"
                        :key="w"
                        class="h-[2px] rounded-full"
                        :style="{ width: w, background: LINE }"
                      />
                    </span>
                  </span>

                  <span class="flex min-w-0 flex-1 flex-col">
                    <!-- Header across the top -->
                    <span
                      v-if="!(d.columns === 'two' && d.header === 'side')"
                      class="flex flex-col gap-[3px] px-[9%] pt-[10%] pb-[6%]"
                      :class="ALIGN[d.headerAlign]"
                      :style="{ background: d.fill === 'header' ? d.accent : undefined }"
                    >
                      <span
                        class="h-[7px] w-[55%] rounded-full"
                        :style="{ background: nameColor(d) }"
                      />
                      <span
                        class="h-[3px] w-[35%] rounded-full"
                        :style="{ background: subColor(d) }"
                      />
                      <span class="mt-[2px] flex w-[70%] gap-[4px]" :class="ALIGN[d.headerAlign]">
                        <span
                          v-for="n in 3"
                          :key="n"
                          class="h-[2px] flex-1 rounded-full"
                          :style="{ background: contactColor(d) }"
                        />
                      </span>
                    </span>

                    <span
                      class="flex flex-1 gap-[7%] px-[9%] pb-[8%]"
                      :class="[
                        d.sidebar === 'right' && 'flex-row-reverse',
                        d.columns === 'two' && d.header === 'side' ? 'pt-[12%]' : 'pt-[2%]',
                      ]"
                    >
                      <!-- Side column inside the body (no tint, header on top) -->
                      <span
                        v-if="d.columns === 'two' && !fullSide(d)"
                        class="flex flex-col gap-[8px]"
                        :style="{ width: `${d.sideWidth}%` }"
                      >
                        <span v-for="n in 2" :key="n" class="flex flex-col gap-[3px]">
                          <span class="flex items-center gap-[3px]" :style="headingWrap(d)">
                            <span
                              class="h-[3px] w-[60%] rounded-full"
                              :style="{ background: headingColor(d) }"
                            />
                          </span>
                          <span
                            v-for="w in ['90%', '70%']"
                            :key="w"
                            class="h-[2px] rounded-full"
                            :style="{ width: w, background: LINE }"
                          />
                        </span>
                      </span>

                      <!-- Main column -->
                      <span class="flex min-w-0 flex-1 flex-col gap-[8px]">
                        <span v-for="n in 3" :key="n" class="flex flex-col gap-[3px]">
                          <span class="flex items-center gap-[3px]" :style="headingWrap(d)">
                            <span
                              class="h-[3px] w-[32%] rounded-full"
                              :style="{ background: headingColor(d) }"
                            />
                            <span
                              v-if="d.headingStyle === 'line-after'"
                              class="h-px flex-1"
                              :style="{ background: headingLine(d) }"
                            />
                          </span>
                          <span
                            v-for="w in ['96%', '88%', '92%', '60%']"
                            :key="w"
                            class="h-[2px] rounded-full"
                            :style="{ width: w, background: LINE }"
                          />
                        </span>
                      </span>
                    </span>
                  </span>
                </span>
              </span>
            </slot>
          </span>

          <span class="flex flex-1 flex-col gap-1 p-3">
            <span class="flex items-center justify-between gap-2">
              <span class="font-medium" :style="{ fontFamily: FONTS[d.font].stack }">
                {{ t.name }}
              </span>
              <span
                v-if="props.current === t.id"
                class="inline-flex items-center gap-1 text-[12px] font-medium text-ink"
              >
                <Icon name="check" :size="13" /> Current
              </span>
            </span>
            <span class="text-[12.5px] leading-snug text-graphite-2">{{ t.description }}</span>
            <span class="mt-auto pt-1 text-[11.5px] text-graphite-2">{{ meta(d) }}</span>
          </span>
        </button>
      </li>
    </ul>
  </div>
</template>
