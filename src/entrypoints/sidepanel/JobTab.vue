<script setup lang="ts">
import { ref } from 'vue';
import Icon, { type IconName } from '@/ui/AppIcon.vue';
import EmailPanel from './EmailPanel.vue';
import FitPanel from './FitPanel.vue';
import InterviewPanel from './InterviewPanel.vue';
import LetterTab from './LetterTab.vue';
import ResumePanel from './ResumePanel.vue';
import TrackerBar from './TrackerBar.vue';
import type { useEmail } from './useEmail';
import type { useInterview } from './useInterview';
import type { useJob } from './useJob';
import type { useJobFit } from './useJobFit';
import type { useLetter } from './useLetter';
import type { useResume } from './useResume';
import type { useTracker } from './useTracker';

const props = defineProps<{
  job: ReturnType<typeof useJob>;
  letter: ReturnType<typeof useLetter>;
  fit: ReturnType<typeof useJobFit>;
  interview: ReturnType<typeof useInterview>;
  email: ReturnType<typeof useEmail>;
  tracker: ReturnType<typeof useTracker>;
  resume: ReturnType<typeof useResume>;
}>();
const emit = defineEmits<{ openSettings: [section?: string] }>();

type Sub = 'letter' | 'fit' | 'resume' | 'interview' | 'email';
const SUBS: { id: Sub; label: string; icon: IconName }[] = [
  { id: 'letter', label: 'Letter', icon: 'mail' },
  { id: 'fit', label: 'Fit', icon: 'target' },
  { id: 'resume', label: 'Resume', icon: 'file' },
  { id: 'interview', label: 'Interview', icon: 'user' },
  { id: 'email', label: 'Email', icon: 'pen' },
];
const sub = ref<Sub>('letter');
</script>

<template>
  <TrackerBar
    :state="props.tracker"
    :job="props.job"
    @open-settings="(s) => emit('openSettings', s)"
  />
  <div
    class="grid grid-cols-5 gap-1 rounded-[10px] border border-rule bg-paper p-1"
    role="group"
    aria-label="Job tools"
    data-testid="job-tools"
  >
    <button
      v-for="s in SUBS"
      :key="s.id"
      type="button"
      class="flex flex-col items-center gap-0.5 rounded-[8px] py-1.5 text-[11.5px] font-medium transition-colors"
      :class="sub === s.id ? 'bg-ink-soft text-ink' : 'text-graphite-2 hover:text-graphite'"
      :aria-pressed="sub === s.id"
      @click="sub = s.id"
    >
      <Icon :name="s.icon" :size="15" /> {{ s.label }}
    </button>
  </div>

  <LetterTab
    v-if="sub === 'letter'"
    :state="props.letter"
    :job="props.job"
    @open-settings="(s) => emit('openSettings', s)"
  />
  <FitPanel v-else-if="sub === 'fit'" :state="props.fit" :job="props.job" />
  <ResumePanel v-else-if="sub === 'resume'" :state="props.resume" :job="props.job" />
  <InterviewPanel v-else-if="sub === 'interview'" :state="props.interview" :job="props.job" />
  <EmailPanel
    v-else-if="sub === 'email'"
    :state="props.email"
    @open-settings="(s) => emit('openSettings', s)"
  />
</template>
