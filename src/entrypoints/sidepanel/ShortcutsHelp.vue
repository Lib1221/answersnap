<script setup lang="ts">
defineProps<{ snip: string }>();
const emit = defineEmits<{ close: [] }>();

const isMac = /mac/i.test(navigator.platform);
const alt = isMac ? 'Option' : 'Alt';
const ctrl = isMac ? 'Cmd' : 'Ctrl';
</script>

<template>
  <div
    class="fixed inset-0 z-20 flex items-start justify-center bg-black/30 p-4 pt-16"
    @click.self="emit('close')"
  >
    <div
      class="card w-full max-w-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="shortcuts-title"
      data-testid="shortcuts"
      @keydown.esc="emit('close')"
    >
      <div class="mb-3 flex items-center justify-between">
        <h2 id="shortcuts-title" class="text-[15px] font-[650]">Keyboard shortcuts</h2>
        <button class="btn btn-quiet min-h-0" type="button" autofocus @click="emit('close')">
          Close
        </button>
      </div>
      <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-[13.5px]">
        <dt>
          <kbd class="kbd">{{ snip }}</kbd>
        </dt>
        <dd>Snip a question (on the page)</dd>
        <dt>
          <kbd class="kbd">{{ ctrl }}+Enter</kbd>
        </dt>
        <dd>Insert the answer</dd>
        <dt>
          <kbd class="kbd">{{ alt }}+C</kbd>
        </dt>
        <dd>Copy the answer</dd>
        <dt>
          <kbd class="kbd">{{ alt }}+R</kbd>
        </dt>
        <dd>Regenerate</dd>
        <dt>
          <kbd class="kbd">{{ alt }}+← / →</kbd>
        </dt>
        <dd>Previous or next version</dd>
        <dt>
          <kbd class="kbd">{{ alt }}+1 to 5</kbd>
        </dt>
        <dd>Answer, Job, Form, Library, Profile</dd>
        <dt><kbd class="kbd">Esc</kbd></dt>
        <dd>Stop drafting, or cancel a snip</dd>
        <dt><kbd class="kbd">?</kbd></dt>
        <dd>This list</dd>
      </dl>
    </div>
  </div>
</template>
