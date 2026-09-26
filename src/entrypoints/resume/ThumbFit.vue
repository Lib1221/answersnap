<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';

// Scales a full-size page into whatever box it sits in (template thumbnails).

const props = defineProps<{ pageWidthPx: number }>();
const box = ref<HTMLElement | null>(null);
const scale = ref(0.2);
let ro: ResizeObserver | null = null;
onMounted(() => {
  ro = new ResizeObserver(([e]) => (scale.value = e!.contentRect.width / props.pageWidthPx));
  if (box.value) ro.observe(box.value);
});
onBeforeUnmount(() => ro?.disconnect());
</script>

<template>
  <div ref="box" class="absolute inset-0 overflow-hidden bg-white">
    <div
      :style="{
        width: `${pageWidthPx}px`,
        transform: `scale(${scale})`,
        transformOrigin: 'top left',
      }"
    >
      <slot />
    </div>
  </div>
</template>
