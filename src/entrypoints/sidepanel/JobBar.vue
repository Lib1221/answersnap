<script setup lang="ts">
import Icon from '@/ui/AppIcon.vue';
import { ref } from 'vue';
import { t } from '@/ui/i18n';
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
  <div
    class="mx-3 mt-3 flex flex-col gap-2 rounded-[10px] border border-rule bg-paper px-3 py-2 text-[13px]"
    data-testid="job-bar"
  >
    <div class="flex items-center gap-2">
      <Icon name="briefcase" :size="15" class="text-graphite-2" />
      <template v-if="j.job.value">
        <span class="min-w-0 flex-1 truncate" data-testid="job-chip">{{
          t('jobbar_job', 'Job: $1', j.label(j.job.value))
        }}</span>
        <button class="btn btn-quiet" type="button" @click="pick(() => j.snip(true))">
          {{ t('jobbar_add_more', 'Add more') }}
        </button>
        <button
          class="btn btn-quiet"
          type="button"
          :aria-label="t('jobbar_clear_job', 'Clear job')"
          @click="j.clear"
        >
          {{ t('jobbar_clear', 'Clear') }}
        </button>
      </template>
      <template v-else>
        <span class="flex-1 text-graphite-2">{{
          t('jobbar_no_job', 'No job post set for this site.')
        }}</span>
        <button class="btn btn-quiet" type="button" :aria-expanded="open" @click="open = !open">
          {{ t('jobbar_set_job', 'Set job') }}
        </button>
      </template>
    </div>
    <div
      v-if="open && !j.job.value"
      class="flex flex-wrap gap-2"
      role="group"
      :aria-label="t('jobbar_set_job', 'Set job')"
    >
      <button class="btn" type="button" @click="pick(() => j.snip(false))">
        {{ t('jobbar_snip_job', 'Snip job post') }}
      </button>
      <button class="btn" type="button" @click="pick(() => j.readFromPage('selection'))">
        {{ t('jobbar_use_selection', 'Use selected text') }}
      </button>
      <button class="btn" type="button" @click="pick(() => j.readFromPage('job'))">
        {{ t('jobbar_read_page', 'Read whole page') }}
      </button>
    </div>
    <p v-if="j.busy.value" role="status">{{ j.busy.value }}</p>
    <p v-if="j.error.value" class="notice" role="alert">{{ j.error.value }}</p>
  </div>
</template>
