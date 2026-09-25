<script setup lang="ts">
// Screenshot thumbnail framed by the overlay's crop marks (spec 13.1). Square corners.
defineProps<{ src: string; alt: string; width: number; height: number }>();
</script>

<template>
  <figure class="crop-thumb">
    <img :src="src" :alt="alt" :width="width" :height="height" />
    <span class="mark tl" aria-hidden="true" />
    <span class="mark tr" aria-hidden="true" />
    <span class="mark bl" aria-hidden="true" />
    <span class="mark br" aria-hidden="true" />
  </figure>
</template>

<style scoped>
.crop-thumb {
  position: relative;
  margin: 6px;
}
img {
  display: block;
  width: 100%;
  height: auto;
  max-height: 240px;
  object-fit: contain;
  object-position: left top;
  border: 1px solid var(--rule);
}
.mark {
  position: absolute;
  width: 12px;
  height: 12px;
  border: 0 solid var(--ink);
}
.tl {
  left: -6px;
  top: -6px;
  border-top-width: 2px;
  border-left-width: 2px;
}
.tr {
  right: -6px;
  top: -6px;
  border-top-width: 2px;
  border-right-width: 2px;
}
.bl {
  left: -6px;
  bottom: -6px;
  border-bottom-width: 2px;
  border-left-width: 2px;
}
.br {
  right: -6px;
  bottom: -6px;
  border-bottom-width: 2px;
  border-right-width: 2px;
}
</style>
