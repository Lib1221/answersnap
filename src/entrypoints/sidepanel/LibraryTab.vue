<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
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
    toast.value = 'Copied';
  } catch {
    toast.value = "Couldn't copy. Select the text and copy it.";
  }
  setTimeout(() => (toast.value = ''), 2000);
}

function date(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
</script>

<template>
  <section class="flex flex-col gap-3" data-testid="library">
    <label class="sr-only" for="library-search">Search saved answers</label>
    <input
      id="library-search"
      v-model="query"
      type="search"
      placeholder="Search saved answers"
      class="rounded-[6px] border border-rule bg-paper px-3 py-1.5"
    />
    <p v-if="toast" role="status" class="text-[13px] text-graphite-2">{{ toast }}</p>
    <p v-if="!entries.length" class="text-graphite-2">
      Answers you insert, copy, or save show up here, so you can reuse them.
    </p>
    <p v-else-if="!shown.length" class="text-graphite-2">No saved answers match.</p>
    <ul class="flex flex-col divide-y divide-rule border-y border-rule">
      <li
        v-for="e in shown"
        :key="e.id"
        class="flex flex-col gap-2 py-3"
        data-testid="library-entry"
      >
        <p class="font-medium">{{ e.question }}</p>
        <p class="text-[12px] text-graphite-2">
          {{ e.hostname }}, {{ date(e.updatedAt)
          }}<template v-if="e.uses > 1">, used {{ e.uses }} times</template
          ><template v-if="e.pinned">, pinned</template>
        </p>
        <textarea
          v-if="editing === e.id"
          v-model="draft"
          rows="5"
          class="rounded-[6px] border border-rule bg-paper p-2"
          aria-label="Edit saved answer"
        />
        <p v-else class="line-clamp-4 whitespace-pre-wrap text-[13px]">{{ e.answer }}</p>
        <div class="flex flex-wrap gap-1">
          <template v-if="editing === e.id">
            <button class="btn btn-primary" type="button" @click="saveEdit(e)">Save</button>
            <button class="btn btn-quiet" type="button" @click="editing = null">Cancel</button>
          </template>
          <template v-else>
            <button v-if="props.canUse" class="btn" type="button" @click="emit('use', e)">
              Use for this question
            </button>
            <button class="btn btn-quiet" type="button" @click="copy(e)">Copy</button>
            <button
              class="btn btn-quiet"
              type="button"
              @click="updateEntry(e.id, { pinned: !e.pinned })"
            >
              {{ e.pinned ? 'Unpin' : 'Pin' }}
            </button>
            <button class="btn btn-quiet" type="button" @click="startEdit(e)">Edit</button>
            <button class="btn btn-quiet" type="button" @click="deleteEntry(e.id)">Delete</button>
          </template>
        </div>
      </li>
    </ul>
  </section>
</template>
