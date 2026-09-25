<script setup lang="ts">
import { ref } from 'vue';
import { estimateTokens } from '@/kb/tokens';
import type { KnowledgeSource } from '@/storage/schema';
import ResumeImport from './ResumeImport.vue';
import ReviewText from './ReviewText.vue';
import TabImport from './TabImport.vue';
import WebsiteImport from './WebsiteImport.vue';
import { CANDIDATE_TOKEN_BUDGET, newSource, useSources } from './useSources';

const { sources, enabledTokens, add, update, remove } = useSources();
const editing = ref<string | null>(null);
const addingNote = ref(false);

const KIND_NAMES: Record<KnowledgeSource['kind'], string> = {
  resume: 'Resume',
  website: 'Website',
  tab: 'Page',
  note: 'Note',
  'ai-transcript': 'Read by AI',
};

async function saveEdit(id: string, value: { label: string; text: string }) {
  await update(id, { label: value.label, text: value.text.trim() });
  editing.value = null;
}

async function saveNote(value: { label: string; text: string }) {
  await add(newSource('note', value.label, value.text));
  addingNote.value = false;
}
</script>

<template>
  <section id="sources" class="flex flex-col gap-6" aria-labelledby="sources-title">
    <div>
      <h2 id="sources-title" class="text-xl font-[650]">Sources</h2>
      <p class="text-graphite-2">
        Answers are written only from these, your profile, and your standard answers.
      </p>
    </div>

    <TabImport />

    <p v-if="enabledTokens > CANDIDATE_TOKEN_BUDGET" class="notice" data-testid="budget-warning">
      Your enabled sources are about {{ enabledTokens.toLocaleString() }} tokens. Over
      {{ CANDIDATE_TOKEN_BUDGET.toLocaleString() }}
      makes every answer slower and more expensive. Turn off sources you don't need.
    </p>

    <ul
      v-if="sources.length"
      class="flex flex-col divide-y divide-rule border-y border-rule"
      data-testid="source-list"
    >
      <li v-for="s in sources" :key="s.id" class="flex flex-col gap-2 py-3">
        <div class="flex flex-wrap items-center gap-3">
          <input
            type="checkbox"
            :checked="s.enabled"
            :aria-label="`Use ${s.label}`"
            @change="update(s.id, { enabled: ($event.target as HTMLInputElement).checked })"
          />
          <span class="font-medium">{{ s.label }}</span>
          <span class="text-[13px] text-graphite-2 tabular-nums">
            {{ KIND_NAMES[s.kind] }}, {{ s.chars.toLocaleString() }} characters, about
            {{ estimateTokens(s.chars).toLocaleString() }} tokens
          </span>
          <span class="ml-auto flex gap-1">
            <button
              class="btn btn-quiet"
              type="button"
              @click="editing = editing === s.id ? null : s.id"
            >
              Edit
            </button>
            <button class="btn btn-quiet" type="button" @click="remove(s.id)">Delete</button>
          </span>
        </div>
        <ReviewText
          v-if="editing === s.id"
          :title="`Edit ${s.label}`"
          :label="s.label"
          :text="s.text"
          @save="saveEdit(s.id, $event)"
          @cancel="editing = null"
        />
      </li>
    </ul>
    <p v-else class="text-graphite-2">No sources yet. Add your resume to start.</p>

    <ResumeImport />
    <WebsiteImport />

    <div>
      <ReviewText
        v-if="addingNote"
        title="New note"
        label="Note"
        text=""
        @save="saveNote"
        @cancel="addingNote = false"
      />
      <button v-else class="btn" type="button" @click="addingNote = true">Add note</button>
    </div>
  </section>
</template>
