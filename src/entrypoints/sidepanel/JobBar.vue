<script setup lang="ts">
import { ref } from 'vue';
import type { useJob } from './useJob';

const props = defineProps<{ state: ReturnType<typeof useJob> }>();
const j = props.state;
const open = ref(false);

function pick(action: () => Promise<void>) {
  open.value = false;
  void action();
}
</script>

<template>
  <div class="flex flex-col gap-2 border-b border-rule px-4 py-2 text-[13px]" data-testid="job-bar">
    <div class="flex items-center gap-2">
      <template v-if="j.job.value">
        <span class="min-w-0 flex-1 truncate" data-testid="job-chip"
          >Job: {{ j.label(j.job.value) }}</span
        >
        <button class="btn btn-quiet" type="button" @click="pick(() => j.snip(true))">
          Add more
        </button>
        <button class="btn btn-quiet" type="button" aria-label="Clear job" @click="j.clear">
          Clear
        </button>
      </template>
      <template v-else>
        <span class="flex-1 text-graphite-2">No job post set for this site.</span>
        <button class="btn btn-quiet" type="button" :aria-expanded="open" @click="open = !open">
          Set job
        </button>
      </template>
    </div>
    <div v-if="open && !j.job.value" class="flex flex-wrap gap-2" role="group" aria-label="Set job">
      <button class="btn" type="button" @click="pick(() => j.snip(false))">Snip job post</button>
      <button class="btn" type="button" @click="pick(() => j.readFromPage('selection'))">
        Use selected text
      </button>
      <button class="btn" type="button" @click="pick(() => j.readFromPage('job'))">
        Read whole page
      </button>
    </div>
    <p v-if="j.busy.value" role="status">{{ j.busy.value }}</p>
    <p v-if="j.error.value" class="notice" role="alert">{{ j.error.value }}</p>
  </div>
</template>
