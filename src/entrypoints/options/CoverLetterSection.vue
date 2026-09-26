<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { COVER_LETTER_LABEL, findCoverLetter } from '@/kb/coverLetter';
import { normalizeText } from '@/kb/normalize';
import { countWords } from '@/llm/limits';
import Icon from '@/ui/AppIcon.vue';
import { newSource, useSources } from './useSources';

const MAX_BYTES = 5 * 1024 * 1024;
const { sources, add, update, remove } = useSources();

const saved = computed(() => findCoverLetter(sources.value));
const text = ref('');
const error = ref('');
const busy = ref('');
const toast = ref('');
let toastTimer = 0;

// Load the saved letter once it arrives; later saves don't overwrite what's being typed.
let loaded = false;
watch(saved, (s) => {
  if (loaded || !s) return;
  loaded = true;
  text.value = s.text;
});

const words = computed(() => countWords(text.value));
const dirty = computed(() => text.value.trim() !== (saved.value?.text ?? ''));

function flash(msg: string) {
  toast.value = msg;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (toast.value = ''), 2000);
}

async function save() {
  const value = text.value.trim();
  if (!value) return;
  if (saved.value) await update(saved.value.id, { text: value });
  else await add(newSource('cover-letter', COVER_LETTER_LABEL, value));
  loaded = true;
  flash('Saved');
}

async function clear() {
  if (saved.value) await remove(saved.value.id);
  text.value = '';
}

async function onPick(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  error.value = '';
  if (file.size > MAX_BYTES) return void (error.value = 'That file is over 5 MB.');
  const ext = file.name.toLowerCase().split('.').pop();
  busy.value = 'Reading the file';
  try {
    if (ext === 'pdf') {
      const { extractPdfText } = await import('@/kb/pdf');
      text.value = (await extractPdfText(await file.arrayBuffer())).text;
    } else if (ext === 'docx') {
      const { extractDocxText } = await import('@/kb/docx');
      text.value = await extractDocxText(await file.arrayBuffer());
    } else if (ext === 'txt' || ext === 'md') {
      text.value = normalizeText(await file.text());
    } else {
      error.value = 'Use a PDF, DOCX, TXT, or MD file.';
    }
  } catch {
    error.value = "Couldn't read that file. Paste the text instead.";
  } finally {
    busy.value = '';
  }
}
</script>

<template>
  <section id="cover-letter" class="flex flex-col gap-6" aria-labelledby="cover-letter-title">
    <div>
      <h2 id="cover-letter-title" class="text-xl font-[650]">Cover letter</h2>
      <p class="text-graphite-2">
        Paste a cover letter you've written before. The Letter tab in the side panel rewrites it for
        each job, keeping your voice and the stories you chose, and answers can use its facts too.
      </p>
    </div>

    <div class="flex flex-col gap-2">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <label for="cover-letter-text" class="font-medium">Your cover letter</label>
        <label class="btn btn-quiet cursor-pointer text-[13px]">
          <Icon name="file" :size="15" /> Import from a file
          <input
            type="file"
            accept=".pdf,.docx,.txt,.md"
            class="sr-only"
            data-testid="cover-letter-file"
            @change="onPick"
          />
        </label>
      </div>
      <textarea
        id="cover-letter-text"
        v-model="text"
        rows="16"
        class="field-input px-3 py-2 leading-relaxed"
        placeholder="Dear Hiring Manager,&#10;&#10;I'm a backend engineer who..."
        data-testid="cover-letter-text"
      />
      <p class="text-[13px] text-graphite-2 tabular-nums">
        {{ words.toLocaleString() }} words{{ busy ? `. ${busy}` : '' }}
      </p>
      <p v-if="error" class="notice" role="alert">{{ error }}</p>
    </div>

    <label v-if="saved" class="flex items-start gap-2">
      <input
        type="checkbox"
        class="mt-1"
        :checked="saved.enabled"
        data-testid="cover-letter-enabled"
        @change="update(saved.id, { enabled: ($event.target as HTMLInputElement).checked })"
      />
      <span>
        Use it for answers and new letters
        <span class="block text-[13px] text-graphite-2">
          Turn this off to keep it saved without sending it with requests.
        </span>
      </span>
    </label>

    <div class="flex flex-wrap items-center gap-2">
      <button
        class="btn btn-primary"
        type="button"
        :disabled="!text.trim() || !dirty"
        data-testid="cover-letter-save"
        @click="save"
      >
        <Icon name="check" /> {{ saved ? 'Save changes' : 'Save cover letter' }}
      </button>
      <button v-if="saved" class="btn btn-quiet" type="button" @click="clear">Delete</button>
      <span v-if="toast" class="success text-[13px]" role="status">{{ toast }}</span>
    </div>
  </section>
</template>
