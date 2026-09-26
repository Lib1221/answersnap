<script setup lang="ts">
import { computed, ref, useId, watch } from 'vue';
import {
  FONT_GROUP_LABELS,
  FONT_KEYS,
  FONTS,
  NAME_ONLY_FONT_KEYS,
  type AnyFontKey,
  type FontGroup,
} from '@/kb/resume/fonts';
import '@/entrypoints/resume/doc/fonts.css';

// FlowCV-style font picker: a row of groups (sans, serif, mono, the computer's fonts, and for the
// name the creative fonts), then the fonts of that group, each shown in its own face.

const props = defineProps<{
  label: string;
  /** Test id prefix: `${testid}-${key}` on each font, `${testid}-same` on the "same" choice. */
  testid: string;
  /** Offer a "same as ..." choice with this label. */
  sameLabel?: string;
  /** Include the display and handwriting fonts (name only). */
  creative?: boolean;
  /** The font in effect when the value is 'same': its group opens first. */
  effective?: string;
}>();
const model = defineModel<string>({ required: true });

const uid = useId();
const keys = computed<readonly AnyFontKey[]>(() =>
  props.creative ? [...FONT_KEYS, ...NAME_ONLY_FONT_KEYS] : FONT_KEYS,
);
const groups = computed(() => {
  const order: FontGroup[] = ['sans', 'serif', 'mono', 'standard', 'creative'];
  return order.filter((g) => keys.value.some((k) => FONTS[k].group === g));
});
const groupOf = (v: string): FontGroup =>
  v in FONTS ? FONTS[v as AnyFontKey].group : (groups.value[0] ?? 'sans');

/** The group on show: the current font's, until the user opens another. */
const current = () => (model.value === 'same' ? (props.effective ?? '') : model.value);
const shown = ref<FontGroup>(groupOf(current()));
watch(model, () => (shown.value = groupOf(current())));
const list = computed(() => keys.value.filter((k) => FONTS[k].group === shown.value));
</script>

<template>
  <div
    role="group"
    :aria-labelledby="`${uid}-label`"
    class="flex flex-col gap-1.5"
    :data-testid="testid"
  >
    <span :id="`${uid}-label`" class="text-[13px] font-medium">{{ label }}</span>
    <button
      v-if="sameLabel"
      type="button"
      class="self-start rounded-[8px] border px-2.5 py-1 text-[12.5px] font-medium transition-colors"
      :class="
        model === 'same'
          ? 'border-ink/30 bg-ink-soft text-ink'
          : 'border-rule text-graphite-2 hover:text-graphite'
      "
      :aria-pressed="model === 'same'"
      :data-testid="`${testid}-same`"
      @click="model = 'same'"
    >
      {{ sameLabel }}
    </button>
    <div
      role="group"
      :aria-label="`${label}: font groups`"
      class="flex flex-wrap gap-1 rounded-[10px] border border-rule bg-paper p-1"
    >
      <button
        v-for="g in groups"
        :key="g"
        type="button"
        class="rounded-[8px] px-2 py-1 text-[12px] font-medium transition-colors"
        :class="shown === g ? 'bg-ink-soft text-ink' : 'text-graphite-2 hover:text-graphite'"
        :aria-pressed="shown === g"
        :data-testid="`${testid}-group-${g}`"
        @click="shown = g"
      >
        {{ FONT_GROUP_LABELS[g] }}
      </button>
    </div>
    <p v-if="shown === 'standard'" class="text-[12px] text-graphite-2">
      These use the fonts installed on this computer, so the PDF can look different elsewhere.
    </p>
    <div
      role="group"
      :aria-label="`${label}: ${FONT_GROUP_LABELS[shown]}`"
      class="grid grid-cols-2 gap-1 rounded-[10px] border border-rule bg-paper p-1"
    >
      <button
        v-for="k in list"
        :key="k"
        type="button"
        class="truncate rounded-[8px] px-2 py-1.5 text-left text-[14px] transition-colors"
        :class="
          model === k ? 'bg-ink-soft text-ink ring-1 ring-ink/30' : 'text-graphite hover:bg-surface'
        "
        :style="{ fontFamily: FONTS[k].stack }"
        :aria-pressed="model === k"
        :title="FONTS[k].label"
        :data-testid="`${testid}-${k}`"
        @click="model = k"
      >
        {{ FONTS[k].label }}
      </button>
    </div>
  </div>
</template>
