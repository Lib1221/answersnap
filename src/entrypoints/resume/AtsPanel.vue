<script setup lang="ts">
import { computed, ref, useId, watch } from 'vue';
import { extractPdfResume, MAX_RESUME_BYTES } from '@/kb/resume/importPdf';
import type { Resume } from '@/kb/resume/model';
import { atsFindings, plainFromRichLines, resumePlainText } from './doc/ats';

// "ATS preview": the resume as an applicant tracking system reads it, and what it would miss.
// Instantly from the resume, or exactly from a PDF the user downloaded (read with pdf.js, the
// same reader the import uses). Nothing leaves the computer.

const props = defineProps<{ resume: Resume }>();
const id = useId();

/** Text read from a downloaded PDF, when the user checks one. */
const fromPdf = ref<{ name: string; text: string } | null>(null);
const reading = ref(false);
const error = ref('');
watch(
  () => props.resume.id,
  () => (fromPdf.value = null),
);

const text = computed(() => fromPdf.value?.text ?? resumePlainText(props.resume));
const findings = computed(() => atsFindings(props.resume, text.value));
const warnings = computed(() => findings.value.filter((f) => f.level === 'warn').length);

async function onFile(ev: Event) {
  const input = ev.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  error.value = '';
  if (!/\.pdf$/i.test(file.name)) return void (error.value = 'Choose the PDF you downloaded.');
  if (file.size > MAX_RESUME_BYTES) return void (error.value = 'That file is over 5 MB.');
  reading.value = true;
  try {
    const out = await extractPdfResume(await file.arrayBuffer());
    fromPdf.value = { name: file.name, text: plainFromRichLines(out.text) };
    if (out.looksScanned)
      error.value = 'This PDF has almost no readable text: a parser would see an empty resume.';
  } catch {
    error.value = "Couldn't read that PDF.";
  } finally {
    reading.value = false;
  }
}
</script>

<template>
  <div class="flex flex-col gap-4" data-testid="ats-panel">
    <section class="card flex flex-col gap-2 p-4" aria-labelledby="ats-check-h">
      <h3 id="ats-check-h" class="text-[14px] font-semibold">
        What a parser would miss
        <span class="font-normal text-graphite-2 tabular-nums">({{ warnings }})</span>
      </h3>
      <p class="text-[12.5px] text-graphite-2">
        Applicant tracking systems read your PDF's text, not its look. Checked
        {{ fromPdf ? `in ${fromPdf.name}` : 'in this resume as it prints' }}.
      </p>
      <ul class="flex flex-col gap-1.5">
        <li
          v-for="(f, i) in findings"
          :key="i"
          class="rounded-control px-2.5 py-1.5 text-[13px]"
          :class="f.level === 'warn' ? 'notice' : 'bg-surface'"
          :data-testid="f.level === 'warn' ? 'ats-warn' : 'ats-ok'"
        >
          <span aria-hidden="true">{{ f.level === 'warn' ? '!' : '✓' }}</span> {{ f.text }}
        </li>
      </ul>
    </section>

    <section class="card flex flex-col gap-2 p-4" aria-labelledby="ats-text-h">
      <h3 id="ats-text-h" class="text-[14px] font-semibold">The text it reads</h3>
      <div class="flex flex-wrap items-center gap-2">
        <label
          :for="`${id}-pdf`"
          class="btn min-h-0 cursor-pointer px-2.5 py-1 text-[13px] focus-within:outline-2 focus-within:outline-ink"
          data-testid="ats-pdf"
        >
          {{ reading ? 'Reading…' : 'Check the PDF you downloaded' }}
          <input
            :id="`${id}-pdf`"
            type="file"
            accept=".pdf,application/pdf"
            class="sr-only"
            :disabled="reading"
            data-testid="ats-pdf-input"
            @change="onFile"
          />
        </label>
        <button
          v-if="fromPdf"
          type="button"
          class="btn btn-quiet min-h-0 px-2 py-1 text-[13px]"
          @click="fromPdf = null"
        >
          Back to this resume
        </button>
      </div>
      <p v-if="error" class="notice text-[13px]" role="alert">{{ error }}</p>
      <pre
        class="max-h-[520px] overflow-auto whitespace-pre-wrap rounded-control bg-surface p-3 font-mono text-[12px] leading-relaxed"
        data-testid="ats-text"
        >{{ text }}</pre>
    </section>
  </div>
</template>
