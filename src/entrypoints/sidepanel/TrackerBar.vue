<script setup lang="ts">
import { APPLICATION_STATUSES, STATUS_LABELS, type ApplicationStatus } from '@/kb/applications';
import Icon from '@/ui/AppIcon.vue';
import { t } from '@/ui/i18n';
import type { useJob } from './useJob';
import type { useTracker } from './useTracker';

const props = defineProps<{
  state: ReturnType<typeof useTracker>;
  job: ReturnType<typeof useJob>;
}>();
const emit = defineEmits<{ openSettings: [section?: string]; followUp: [] }>();
const tr = props.state;
</script>

<template>
  <div
    v-if="props.job.job.value"
    class="card flex items-center gap-2 px-3 py-2 text-[13px]"
    data-testid="tracker-bar"
  >
    <Icon name="flag" :size="15" class="shrink-0 text-graphite-2" />
    <template v-if="tr.current.value">
      <label for="application-status" class="text-graphite-2">{{
        t('tracker_application', 'Application')
      }}</label>
      <select
        id="application-status"
        class="field-input px-2 py-1"
        :value="tr.current.value.status"
        data-testid="application-status"
        @change="tr.setStatus(($event.target as HTMLSelectElement).value as ApplicationStatus)"
      >
        <option v-for="s in APPLICATION_STATUSES" :key="s" :value="s">
          {{ STATUS_LABELS[s] }}
        </option>
      </select>
    </template>
    <button v-else class="btn btn-quiet min-h-0" type="button" @click="tr.track">
      {{ t('tracker_track', 'Track this application') }}
    </button>
    <button
      class="btn btn-quiet ml-auto min-h-0 text-[12.5px] whitespace-nowrap"
      type="button"
      @click="emit('openSettings', 'applications')"
    >
      {{ t('tracker_see_all', 'See all') }}
    </button>
  </div>
  <p
    v-if="props.job.job.value && tr.followUpDays.value !== null"
    class="flex flex-wrap items-center gap-2 rounded-control border border-canary-edge bg-canary px-3 py-2 text-[13px] text-ink-strong"
    data-testid="follow-up-nudge"
  >
    {{ t('tracker_no_news', 'No news in $1 days.', String(tr.followUpDays.value)) }}
    <button class="btn btn-quiet min-h-0 p-0" type="button" @click="emit('followUp')">
      {{ t('tracker_write_follow_up', 'Write a follow-up') }}
    </button>
  </p>
</template>
