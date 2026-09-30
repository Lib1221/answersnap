<script setup lang="ts">
import { computed } from 'vue';
import type { Resume } from '@/kb/resume/model';
import type { Block } from './doc/blocks';
import DocBlock from './doc/DocBlock.vue';
import { pageClasses, pageVars } from './doc/pageStyle';
import './doc/doc.css';
import './doc/fonts.css';

// The cover letter written with a tailored resume, on a page in the resume's own design: the
// same header, fonts, colors, and margins, so the two print as a matching set.

const props = defineProps<{ resume: Resume }>();

const header: Block = { id: 'header', kind: 'header', column: 'full' };
const letter = computed(() => props.resume.coverLetter);
const paragraphs = computed(() =>
  (letter.value?.text ?? '')
    .replace(/\r\n?/g, '\n')
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean),
);
</script>

<template>
  <div class="rd-root">
    <article
      class="rd-page rd-letter"
      :class="pageClasses({ ...resume.design, columns: 'one' })"
      :style="pageVars(resume.design)"
      data-testid="letter-page"
    >
      <DocBlock :block="header" :resume="resume" />
      <div class="rd-letter-body">
        <p v-if="letter?.date" class="rd-letter-meta">{{ letter.date }}</p>
        <p v-if="letter?.recipient" class="rd-letter-meta">{{ letter.recipient }}</p>
        <p v-for="(p, i) in paragraphs" :key="i" class="rd-letter-p">{{ p }}</p>
      </div>
    </article>
  </div>
</template>

<style>
/* A letter can run past one page: the page grows instead of cutting text, and print splits it. */
.rd-page.rd-letter {
  height: auto;
  min-height: var(--rd-page-h);
}
/* Qualified with .rd-letter so they win over the page's reset (.rd-page * { margin: 0 }). */
.rd-letter .rd-letter-body {
  margin-top: 2pt;
}
.rd-letter .rd-letter-meta {
  margin-bottom: 2pt;
}
.rd-letter .rd-letter-meta + .rd-letter-p {
  margin-top: 12pt;
}
.rd-letter .rd-letter-p {
  white-space: pre-line;
}
.rd-letter .rd-letter-p + .rd-letter-p {
  margin-top: 8pt;
}
</style>
