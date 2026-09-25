<script setup lang="ts">
import { ref } from 'vue';
import { transcribeImage } from '@/kb/profileBuilder';
import { normalizeText } from '@/kb/normalize';
import { configuredProvider, describeError } from './aiProvider';
import ReviewText from './ReviewText.vue';
import { newSource, useSources } from './useSources';

const MAX_BYTES = 5 * 1024 * 1024;
const emit = defineEmits<{ done: [] }>();
const { add } = useSources();

const fileName = ref('');
const text = ref('');
const error = ref('');
const busy = ref('');
const scanned = ref(false);
const fromAi = ref(false);
const dragging = ref(false);
let pdfData: ArrayBuffer | null = null;

async function handleFile(file: File) {
  error.value = '';
  scanned.value = false;
  fromAi.value = false;
  if (file.size > MAX_BYTES) {
    error.value = 'That file is over 5 MB. Try a smaller export of your resume.';
    return;
  }
  fileName.value = file.name;
  const ext = file.name.toLowerCase().split('.').pop();
  busy.value = 'Reading the file';
  try {
    if (ext === 'pdf') {
      const { extractPdfText } = await import('@/kb/pdf');
      pdfData = await file.arrayBuffer();
      const result = await extractPdfText(pdfData.slice(0));
      text.value = result.text;
      scanned.value = result.looksScanned;
    } else if (ext === 'docx') {
      const { extractDocxText } = await import('@/kb/docx');
      text.value = await extractDocxText(await file.arrayBuffer());
    } else if (ext === 'txt' || ext === 'md') {
      text.value = normalizeText(await file.text());
    } else {
      error.value = 'Use a PDF, DOCX, TXT, or MD file.';
      fileName.value = '';
    }
  } catch (err) {
    console.warn('[AnswerSnap] resume import failed', err);
    error.value = "Couldn't read that file. Try another format, or paste the text as a note.";
    fileName.value = '';
  } finally {
    busy.value = '';
  }
}

function onPick(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (file) void handleFile(file);
}

function onDrop(e: DragEvent) {
  dragging.value = false;
  const file = e.dataTransfer?.files[0];
  if (file) void handleFile(file);
}

/** Scanned PDF: render pages and transcribe them with the fast model (spec 10.2). */
async function readWithAi() {
  if (!pdfData) return;
  error.value = '';
  try {
    const { provider, settings } = await configuredProvider();
    const { renderPdfPages } = await import('@/kb/pdf');
    busy.value = 'Rendering pages';
    const pages = await renderPdfPages(pdfData.slice(0));
    const out: string[] = [];
    for (const [i, page] of pages.entries()) {
      busy.value = `Reading page ${i + 1} of ${pages.length}`;
      out.push(await transcribeImage(provider, settings.fastModel, page));
    }
    text.value = out.join('\n\n');
    fromAi.value = true;
    scanned.value = false;
  } catch (err) {
    error.value = describeError(err);
  } finally {
    busy.value = '';
  }
}

async function save(value: { label: string; text: string }) {
  await add(
    newSource(fromAi.value ? 'ai-transcript' : 'resume', value.label, value.text, {
      fileName: fileName.value,
    }),
  );
  reset();
  emit('done');
}

function reset() {
  fileName.value = '';
  text.value = '';
  pdfData = null;
  scanned.value = false;
}
</script>

<template>
  <div class="flex flex-col gap-3">
    <ReviewText
      v-if="fileName && !busy"
      :title="`Resume: ${fileName}`"
      :label="fileName.replace(/\.[^.]+$/, '')"
      :text="text"
      @save="save"
      @cancel="reset"
    >
      <div
        v-if="scanned"
        class="notice flex flex-col items-start gap-2"
        data-testid="scanned-notice"
      >
        <p>This PDF has almost no readable text. It may be a scan or an image.</p>
        <button class="btn" type="button" @click="readWithAi">Read with AI</button>
      </div>
      <p v-if="fromAi" class="text-[13px] text-graphite-2">
        Read by AI from the page images. Check it before saving.
      </p>
    </ReviewText>

    <label
      v-else
      class="flex cursor-pointer flex-col items-start gap-2 rounded-[6px] border border-dashed p-4"
      :class="dragging ? 'border-ink bg-canary' : 'border-rule'"
      @dragover.prevent="dragging = true"
      @dragleave="dragging = false"
      @drop.prevent="onDrop"
    >
      <span class="font-medium">Add resume</span>
      <span class="text-[13px] text-graphite-2"
        >Drop a PDF, DOCX, TXT, or MD file here, or choose one. Max 5 MB.</span
      >
      <input type="file" accept=".pdf,.docx,.txt,.md" data-testid="resume-input" @change="onPick" />
    </label>
    <p v-if="busy" role="status">{{ busy }}</p>
    <p v-if="error" class="notice" role="alert">{{ error }}</p>
  </div>
</template>
