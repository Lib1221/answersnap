<script setup lang="ts">
import { ref } from 'vue';
import Icon, { type IconName } from '@/ui/AppIcon.vue';
import FitPanel from './FitPanel.vue';
import InterviewPanel from './InterviewPanel.vue';
import LetterTab from './LetterTab.vue';
import type { useInterview } from './useInterview';
import type { useJob } from './useJob';
import type { useJobFit } from './useJobFit';
import type { useLetter } from './useLetter';

const props = defineProps<{
  job: ReturnType<typeof useJob>;
  letter: ReturnType<typeof useLetter>;
  fit: ReturnType<typeof useJobFit>;
  interview: ReturnType<typeof useInterview>;
}>();
const emit = defineEmits<{ openSettings: [section?: string] }>();

type Sub = 'letter' | 'fit' | 'interview';
const SUBS: { id: Sub; label: string; icon: IconName }[] = [
  { id: 'letter', label: 'Letter', icon: 'mail' },
  { id: 'fit', label: 'Fit', icon: 'target' },
  { id: 'interview', label: 'Interview', icon: 'user' },
];
const sub = ref<Sub>('letter');
</script>

<template>
  <div class="flex gap-1.5" role="group" aria-label="Job tools" data-testid="job-tools">
    <button
      v-for="s in SUBS"
      :key="s.id"
      type="button"
      class="chip gap-1.5"
      :class="sub === s.id ? 'border-ink bg-ink-soft text-ink' : ''"
      :aria-pressed="sub === s.id"
      @click="sub = s.id"
    >
      <Icon :name="s.icon" :size="14" /> {{ s.label }}
    </button>
  </div>

  <LetterTab
    v-if="sub === 'letter'"
    :state="props.letter"
    :job="props.job"
    @open-settings="(s) => emit('openSettings', s)"
  />
  <FitPanel v-else-if="sub === 'fit'" :state="props.fit" :job="props.job" />
  <InterviewPanel v-else-if="sub === 'interview'" :state="props.interview" :job="props.job" />
</template>
