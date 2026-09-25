<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { estimateTokens } from '@/kb/tokens';
import { getSources, saveSources } from '@/storage/items';
import type { KnowledgeSource } from '@/storage/schema';

// Until resume import lands (M3), the profile is plain text pasted here and stored as a
// "note" source, which is what M3's source list will show it as.

const PASTED_ID = 'pasted-profile';
const text = ref('');
const saved = ref(false);
const chars = computed(() => text.value.length);

onMounted(async () => {
  text.value = (await getSources()).find((s) => s.id === PASTED_ID)?.text ?? '';
});

async function save() {
  const others = (await getSources()).filter((s) => s.id !== PASTED_ID);
  const trimmed = text.value.trim();
  const next: KnowledgeSource[] = trimmed
    ? [
        ...others,
        {
          id: PASTED_ID,
          kind: 'note',
          label: 'Pasted profile',
          text: trimmed,
          chars: trimmed.length,
          importedAt: new Date().toISOString(),
          enabled: true,
        },
      ]
    : others;
  await saveSources(next);
  saved.value = true;
  setTimeout(() => (saved.value = false), 2000);
}
</script>

<template>
  <section id="profile" class="flex flex-col gap-3" aria-labelledby="profile-title">
    <h2 id="profile-title" class="text-xl font-[650]">Profile</h2>
    <label for="profile-text"
      >Paste your resume or a short profile as plain text. Answers only use what's here.</label
    >
    <textarea
      id="profile-text"
      v-model="text"
      rows="16"
      class="w-full rounded-[6px] border border-rule bg-paper p-3 font-[inherit]"
      data-testid="profile-text"
    />
    <p class="text-[13px] text-graphite-2 tabular-nums">
      {{ chars.toLocaleString() }} characters, about
      {{ estimateTokens(chars).toLocaleString() }} tokens
    </p>
    <div class="flex items-center gap-3">
      <button class="btn btn-primary" type="button" @click="save">Save</button>
      <span v-if="saved" role="status" class="text-graphite-2">Saved</span>
    </div>
  </section>
</template>
