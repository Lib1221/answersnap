<script setup lang="ts">
// Small hand-drawn icon set (24 x 24, stroke 1.8). No icon dependency.
export type IconName =
  | 'snip'
  | 'settings'
  | 'copy'
  | 'check'
  | 'star'
  | 'github'
  | 'insert'
  | 'refresh'
  | 'bookmark'
  | 'user'
  | 'form'
  | 'sparkle'
  | 'briefcase'
  | 'x'
  | 'stop'
  | 'shield'
  | 'key'
  | 'file'
  | 'pen'
  | 'flag'
  | 'book'
  | 'target'
  | 'alert';

defineProps<{ name: IconName; size?: number }>();

const PATHS: Record<IconName, string[]> = {
  snip: ['M6 2v14a2 2 0 0 0 2 2h14', 'M18 22V8a2 2 0 0 0-2-2H2'],
  settings: [
    'M4 6h9',
    'M17 6h3',
    'M4 12h3',
    'M11 12h9',
    'M4 18h11',
    'M19 18h1',
    'M15 4v4',
    'M9 10v4',
    'M17 16v4',
  ],
  copy: [
    'M8 8h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2z',
    'M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2',
  ],
  check: ['M20 6 9 17l-5-5'],
  star: ['M12 2.8l2.8 5.8 6.4.9-4.6 4.5 1.1 6.3L12 17.3l-5.7 3 1.1-6.3-4.6-4.5 6.4-.9z'],
  github: [],
  insert: ['M12 3v11', 'M7.5 9.5 12 14l4.5-4.5', 'M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2'],
  refresh: [
    'M20 11a8 8 0 0 0-14.3-4.9L4 8',
    'M4 3v5h5',
    'M4 13a8 8 0 0 0 14.3 4.9L20 16',
    'M20 21v-5h-5',
  ],
  bookmark: ['M18 21l-6-4-6 4V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2z'],
  user: ['M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z', 'M4 21a8 8 0 0 1 16 0'],
  form: ['M9 6h11', 'M9 12h11', 'M9 18h11', 'M4.5 6h.01', 'M4.5 12h.01', 'M4.5 18h.01'],
  sparkle: [
    'M12 3l1.8 4.9L19 10l-5.2 2.1L12 17l-1.8-4.9L5 10l5.2-2.1z',
    'M19 17l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z',
  ],
  briefcase: [
    'M4 8h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z',
    'M9 8V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2',
    'M3 13h18',
  ],
  x: ['M18 6 6 18', 'M6 6l12 12'],
  stop: ['M7 7h10v10H7z'],
  shield: ['M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z', 'M9 12l2 2 4-4'],
  key: ['M14.5 9.5a4.5 4.5 0 1 0-4.2 4.5', 'M10.3 14L4 20.3V22h3v-2h2v-2h2l1.5-1.5'],
  file: [
    'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z',
    'M14 3v5h5',
    'M9 13h6',
    'M9 17h4',
  ],
  pen: ['M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4z'],
  flag: ['M5 21V4', 'M5 4h11l-2 4 2 4H5'],
  book: ['M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z', 'M4 19a2 2 0 0 1 2-2h13'],
  target: [
    'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z',
    'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
    'M12 12h.01',
  ],
  alert: [
    'M12 9v4',
    'M12 17h.01',
    'M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
  ],
};

// GitHub's mark (filled), used only to link to the project's repository.
const GITHUB_MARK =
  'M12 .5a11.5 11.5 0 0 0-3.64 22.41c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.52-1.33-1.28-1.69-1.28-1.69-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.84 1.19 3.1 0 4.42-2.7 5.39-5.26 5.68.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .5z';
</script>

<template>
  <svg
    :width="size ?? 16"
    :height="size ?? 16"
    viewBox="0 0 24 24"
    aria-hidden="true"
    focusable="false"
    class="shrink-0"
  >
    <path v-if="name === 'github'" :d="GITHUB_MARK" fill="currentColor" />
    <path
      v-for="d in PATHS[name]"
      v-else
      :key="d"
      :d="d"
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </svg>
</template>
