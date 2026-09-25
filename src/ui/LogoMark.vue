<script setup lang="ts">
// The AnswerSnap mark: crop marks around a snipped question (same drawing as the toolbar icon).
defineProps<{ size?: number }>();
</script>

<template>
  <svg
    :width="size ?? 28"
    :height="size ?? 28"
    viewBox="0 0 128 128"
    aria-hidden="true"
    focusable="false"
    class="shrink-0"
  >
    <rect x="0" y="0" width="128" height="128" rx="28" fill="var(--ink)" />
    <rect x="34" y="42" width="60" height="44" rx="4" fill="var(--canary)" />
    <rect x="43" y="54" width="42" height="6" rx="3" fill="var(--ink)" />
    <rect x="43" y="68" width="28" height="6" rx="3" fill="#5b616b" />
    <g fill="none" stroke="var(--on-ink)" stroke-width="9" stroke-linecap="round">
      <path d="M22 42V22h20" />
      <path d="M86 22h20v20" />
      <path d="M106 86v20H86" />
      <path d="M42 106H22V86" />
    </g>
  </svg>
</template>
