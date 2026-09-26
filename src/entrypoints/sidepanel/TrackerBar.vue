<script setup lang="ts">
import { APPLICATION_STATUSES, STATUS_LABELS, type ApplicationStatus } from '@/kb/applications';
import Icon from '@/ui/AppIcon.vue';
import type { useJob } from './useJob';
import type { useTracker } from './useTracker';

const props = defineProps<{
  state: ReturnType<typeof useTracker>;
  job: ReturnType<typeof useJob>;
}>();
const emit = defineEmits<{ openSettings: [section?: string]; followUp: [] }>();
const t = props.state;
</script>

<template>
  <div
    v-if="props.job.job.value"
    class="card flex items-center gap-2 px-3 py-2 text-[13px]"
    data-testid="tracker-bar"
  >
    <Icon name="flag" :size="15" class="shrink-0 text-graphite-2" />
    <template v-if="t.current.value">
      <label for="application-status" class="text-graphite-2">Application</label>
      <select
        id="application-status"
        class="field-input px-2 py-1"
        :value="t.current.value.status"
        data-testid="application-status"
        @change="t.setStatus(($event.target as HTMLSelectElement).value as ApplicationStatus)"
      >
        <option v-for="s in APPLICATION_STATUSES" :key="s" :value="s">
          {{ STATUS_LABELS[s] }}
        </option>
      </select>
    </template>
    <button v-else class="btn btn-quiet min-h-0" type="button" @click="t.track">
      Track this application
    </button>
    <button
      class="btn btn-quiet ml-auto min-h-0 text-[12.5px] whitespace-nowrap"
      type="button"
      @click="emit('openSettings', 'applications')"
    >
      See all
    </button>
  </div>
  <p
    v-if="props.job.job.value && t.followUpDays.value !== null"
    class="flex flex-wrap items-center gap-2 rounded-control border border-canary-edge bg-canary px-3 py-2 text-[13px] text-ink-strong"
    data-testid="follow-up-nudge"
  >
    No news in {{ t.followUpDays.value }} days.
    <button class="btn btn-quiet min-h-0 p-0" type="button" @click="emit('followUp')">
      Write a follow-up
    </button>
  </p>
</template>
