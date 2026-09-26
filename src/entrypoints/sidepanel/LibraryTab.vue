<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import Icon from '@/ui/AppIcon.vue';
import { t } from '@/ui/i18n';
import { deleteEntry, getLibrary, libraryItem, updateEntry, type LibraryEntry } from '@/kb/library';

const props = defineProps<{ canUse: boolean }>();
const emit = defineEmits<{ use: [entry: LibraryEntry] }>();

const entries = ref<LibraryEntry[]>([]);
const query = ref('');
const editing = ref<string | null>(null);
const draft = ref('');
const toast = ref('');

const shown = computed(() => {
  const q = query.value.trim().toLowerCase();
  return [...entries.value]
    .filter((e) => !q || `${e.question} ${e.answer} ${e.hostname}`.toLowerCase().includes(q))
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt.localeCompare(a.updatedAt));
});

async function load() {
  entries.value = await getLibrary();
}
let unwatch: (() => void) | null = null;
onMounted(() => {
  void load();
  unwatch = libraryItem.watch(() => void load());
});
onUnmounted(() => unwatch?.());

function startEdit(e: LibraryEntry) {
  editing.value = e.id;
  draft.value = e.answer;
}

async function saveEdit(e: LibraryEntry) {
  await updateEntry(e.id, { answer: draft.value.trim() });
  editing.value = null;
}

async function copy(e: LibraryEntry) {
  try {
    await navigator.clipboard.writeText(e.answer);
    toast.value = t('library_copied', 'Copied');
  } catch {
    toast.value = t('library_copy_failed', "Couldn't copy. Select the text and copy it.");
  }
  setTimeout(() => (toast.value = ''), 2000);
}

function date(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
</script>

<template>
  <section class="flex flex-col gap-3" data-testid="library">
    <label class="sr-only" for="library-search">{{
      t('library_search', 'Search saved answers')
    }}</label>
    <input
      id="library-search"
      v-model="query"
      type="search"
      :placeholder="t('library_search', 'Search saved answers')"
      class="field-input"
    />
    <p v-if="toast" role="status" class="text-[13px] text-graphite-2">{{ toast }}</p>
    <div
      v-if="!entries.length"
      class="card flex flex-col items-center gap-2 px-5 py-8 text-center text-graphite-2"
    >
      <div class="flex h-12 w-12 items-center justify-center rounded-2xl bg-ink-soft text-ink">
        <Icon name="bookmark" :size="22" />
      </div>
      <p>
        {{
          t(
            'library_empty',
            'Answers you insert, copy, or save show up here, so you can reuse them.',
          )
        }}
      </p>
    </div>
    <p v-else-if="!shown.length" class="text-graphite-2">
      {{ t('library_no_match', 'No saved answers match.') }}
    </p>
    <ul class="flex flex-col gap-2.5">
      <li
        v-for="e in shown"
        :key="e.id"
        class="card flex flex-col gap-2 p-3"
        data-testid="library-entry"
      >
        <p class="font-medium">{{ e.question }}</p>
        <p class="text-[12px] text-graphite-2">
          {{ e.hostname }}, {{ date(e.updatedAt)
          }}<template v-if="e.uses > 1"
            >, {{ t('library_used_n', 'used $1 times', String(e.uses)) }}</template
          ><template v-if="e.pinned">, {{ t('library_pinned', 'pinned') }}</template>
        </p>
        <textarea
          v-if="editing === e.id"
          v-model="draft"
          rows="5"
          class="field-input p-2"
          :aria-label="t('library_edit_label', 'Edit saved answer')"
        />
        <p v-else class="line-clamp-4 whitespace-pre-wrap text-[13px]">{{ e.answer }}</p>
        <div class="flex flex-wrap gap-1">
          <template v-if="editing === e.id">
            <button class="btn btn-primary" type="button" @click="saveEdit(e)">
              {{ t('library_save', 'Save') }}
            </button>
            <button class="btn btn-quiet" type="button" @click="editing = null">
              {{ t('library_cancel', 'Cancel') }}
            </button>
          </template>
          <template v-else>
            <button v-if="props.canUse" class="btn" type="button" @click="emit('use', e)">
              {{ t('library_use', 'Use for this question') }}
            </button>
            <button class="btn btn-quiet" type="button" @click="copy(e)">
              {{ t('library_copy', 'Copy') }}
            </button>
            <button
              class="btn btn-quiet"
              type="button"
              @click="updateEntry(e.id, { pinned: !e.pinned })"
            >
              {{ e.pinned ? t('library_unpin', 'Unpin') : t('library_pin', 'Pin') }}
            </button>
            <button class="btn btn-quiet" type="button" @click="startEdit(e)">
              {{ t('library_edit', 'Edit') }}
            </button>
            <button class="btn btn-quiet" type="button" @click="deleteEntry(e.id)">
              {{ t('library_delete', 'Delete') }}
            </button>
          </template>
        </div>
      </li>
    </ul>
  </section>
</template>
