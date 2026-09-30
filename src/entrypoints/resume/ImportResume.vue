<script setup lang="ts">
import { ref, useId } from 'vue';
import { extractResumeFile, ResumeImportError } from '@/kb/resume/importPdf';
import type { Resume } from '@/kb/resume/model';
import { describeError, LlmError } from '@/llm/errors';
import { createAppProvider } from '@/llm/provider';
import { importedResume, runResumeImport } from '@/llm/resumeImport';
import { getApiKey, getSettings } from '@/storage/items';
import Icon from '@/ui/AppIcon.vue';

// "Import a resume": the candidate's own PDF (or DOCX, TXT) becomes a builder resume, word for
// word, in the design closest to the original. Usually the master resume.

const props = withDefaults(defineProps<{ variant?: 'primary' | 'quiet' }>(), {
  variant: 'primary',
});
/** `unplaced`: bullets from the file that no section took, for the builder to point out. */
const emit = defineEmits<{ imported: [resume: Resume, unplaced: string[]] }>();

const id = useId();
const busy = ref('');
const error = ref('');
const needsKey = ref(false);

async function onFile(ev: Event) {
  const input = ev.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  error.value = '';
  needsKey.value = false;
  try {
    const settings = await getSettings();
    const key = await getApiKey(settings.provider);
    if (!key) {
      needsKey.value = true;
      return;
    }
    busy.value = 'Reading your resume';
    const extracted = await extractResumeFile(file);
    busy.value = 'Copying it into the builder';
    const out = await runResumeImport({
      provider: createAppProvider(settings, key),
      model: settings.model,
      text: extracted.text,
    });
    const name = file.name.replace(/\.(pdf|docx|txt)$/i, '').slice(0, 80) || 'My resume';
    const report = { unplaced: [] as string[] };
    const resume = importedResume(out, extracted, name, report);
    emit('imported', resume, report.unplaced);
  } catch (err) {
    error.value =
      err instanceof ResumeImportError
        ? err.message
        : err instanceof LlmError
          ? describeError(err)
          : "Couldn't import that resume. Try again, or start from your profile.";
  } finally {
    busy.value = '';
  }
}
</script>

<template>
  <div class="flex flex-col items-start gap-2">
    <label
      :for="`${id}-file`"
      class="btn cursor-pointer focus-within:outline-2 focus-within:outline-ink"
      :class="[
        props.variant === 'primary' ? 'btn-primary' : 'btn-quiet min-h-0 px-2 text-[13px]',
        busy ? 'pointer-events-none opacity-70' : '',
      ]"
      :aria-busy="!!busy"
      data-testid="resume-import"
    >
      <Icon name="file" :size="props.variant === 'primary' ? 18 : 15" />
      {{ busy ? `${busy}…` : 'Import my resume (PDF)' }}
      <input
        :id="`${id}-file`"
        type="file"
        accept=".pdf,.docx,.txt,application/pdf"
        class="sr-only"
        :disabled="!!busy"
        data-testid="resume-import-input"
        @change="onFile"
      />
    </label>
    <p v-if="busy" class="sr-only" role="status">{{ busy }}</p>
    <p v-if="needsKey" class="notice text-[13px]" role="alert" data-testid="resume-import-error">
      Add your AI key in Settings first:
      <a href="/options.html#provider" target="_blank" class="text-ink underline">AI provider</a>.
    </p>
    <p v-else-if="error" class="notice text-[13px]" role="alert" data-testid="resume-import-error">
      {{ error }}
    </p>
  </div>
</template>
