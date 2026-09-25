<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { estimateTokens } from '@/kb/tokens';

// Every imported source is shown as editable text before it's saved (spec 10.1).
const props = defineProps<{ title: string; label: string; text: string; busy?: boolean }>();
const emit = defineEmits<{ save: [value: { label: string; text: string }]; cancel: [] }>();

const label = ref(props.label);
const text = ref(props.text);
watch(
  () => props.text,
  (t) => (text.value = t),
);
const chars = computed(() => text.value.length);
</script>

<template>
  <div class="flex flex-col gap-3 border-l-2 border-ink pl-4" data-testid="review">
    <h3 class="font-[650]">{{ title }}</h3>
    <label class="flex flex-col gap-1">
      <span class="text-[13px] text-graphite-2">Name</span>
      <input
        v-model="label"
        class="max-w-md rounded-[6px] border border-rule bg-paper px-3 py-1.5"
        data-testid="review-label"
      />
    </label>
    <label class="flex flex-col gap-1">
      <span class="text-[13px] text-graphite-2">Text (fix anything the import got wrong)</span>
      <textarea
        v-model="text"
        rows="14"
        class="w-full rounded-[6px] border border-rule bg-paper p-3"
        data-testid="review-text"
      />
    </label>
    <p class="text-[13px] text-graphite-2 tabular-nums" data-testid="review-count">
      {{ chars.toLocaleString() }} characters, about
      {{ estimateTokens(chars).toLocaleString() }} tokens
    </p>
    <slot />
    <div class="flex gap-2">
      <button
        class="btn btn-primary"
        type="button"
        :disabled="busy || !text.trim()"
        @click="emit('save', { label: label.trim() || title, text })"
      >
        Save source
      </button>
      <button class="btn" type="button" @click="emit('cancel')">Cancel</button>
    </div>
  </div>
</template>
