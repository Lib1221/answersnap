<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { BRAND } from '@/config/brand';
import { filledStandardAnswers } from '@/kb/profileSchema';
import {
  getApiKey,
  getProfile,
  getSettings,
  getSources,
  getStandardAnswers,
  saveSettings,
} from '@/storage/items';

// First run checklist (spec 3.1). Every step but the first can be skipped.

interface Step {
  id: string;
  title: string;
  detail: string;
  done: boolean;
  optional?: boolean;
  action: { label: string; run: () => void };
}

const state = ref({
  key: false,
  resume: false,
  site: false,
  profile: false,
  answers: false,
  shortcut: '',
});
const onboardingDone = ref(false);

async function load() {
  const settings = await getSettings();
  const sources = await getSources();
  const commands = await browser.commands.getAll();
  onboardingDone.value = settings.onboardingDone;
  state.value = {
    key: !!(await getApiKey(settings.provider)),
    resume: sources.some((s) => ['resume', 'note', 'ai-transcript'].includes(s.kind)),
    site: sources.some((s) => s.kind === 'website' || s.kind === 'tab'),
    profile: !!(await getProfile()),
    answers: !!filledStandardAnswers(await getStandardAnswers()),
    shortcut: commands.find((c) => c.name === 'snip-question')?.shortcut ?? '',
  };
}

const go = (section: string) => () => (location.hash = `#${section}`);

const steps = computed<Step[]>(() => [
  {
    id: 'connect',
    title: 'Connect AI',
    detail: 'Paste an Anthropic or Google Gemini API key. Gemini has a free tier.',
    done: state.value.key,
    action: { label: 'Add a key', run: go('provider') },
  },
  {
    id: 'resume',
    title: 'Add your resume',
    detail: 'PDF, DOCX, TXT, or MD. You can fix the extracted text before saving.',
    done: state.value.resume,
    action: { label: 'Add resume', run: go('sources') },
  },
  {
    id: 'website',
    title: 'Add your website',
    detail: 'Optional. Imports your about page, projects, or a linked resume.',
    done: state.value.site,
    optional: true,
    action: { label: 'Add website', run: go('sources') },
  },
  {
    id: 'profile',
    title: 'Build your profile',
    detail: 'One click. Check it and fix anything the AI got wrong.',
    done: state.value.profile,
    action: { label: 'Build profile', run: go('profile') },
  },
  {
    id: 'answers',
    title: 'Standard answers',
    detail:
      'Optional. Work authorization, rate, notice period. Used when a form asks. Never guessed.',
    done: state.value.answers,
    optional: true,
    action: { label: 'Fill them in', run: go('standard-answers') },
  },
  {
    id: 'shortcut',
    title: 'Your shortcut',
    detail: state.value.shortcut
      ? `Press ${state.value.shortcut} on any application form to snip a question.`
      : 'No shortcut is set. Pick one, or click the AnswerSnap icon instead.',
    done: !!state.value.shortcut,
    optional: true,
    action: {
      label: 'Change shortcut',
      run: () => void browser.tabs.create({ url: 'chrome://extensions/shortcuts' }),
    },
  },
  {
    id: 'try',
    title: 'Try it',
    detail: 'A practice form with the kinds of questions applications ask.',
    done: onboardingDone.value,
    action: {
      label: 'Open the practice form',
      run: () => {
        void saveSettings({ onboardingDone: true });
        onboardingDone.value = true;
        void browser.tabs.create({ url: browser.runtime.getURL('/practice.html') });
      },
    },
  },
]);

const remaining = computed(() => steps.value.filter((s) => !s.done && !s.optional).length);

onMounted(() => {
  void load();
  window.addEventListener('focus', load);
});
onUnmounted(() => window.removeEventListener('focus', load));
</script>

<template>
  <section id="welcome" class="flex flex-col gap-5" aria-labelledby="welcome-title">
    <div>
      <h2 id="welcome-title" class="text-xl font-[650]">Getting started</h2>
      <p class="text-graphite-2">
        {{ BRAND.name }} drafts answers to application questions from your own resume and website.
        <template v-if="remaining"
          >{{ remaining }} {{ remaining === 1 ? 'step' : 'steps' }} left.</template
        >
        <template v-else>You're set.</template>
      </p>
    </div>
    <ol class="flex flex-col divide-y divide-rule border-y border-rule" data-testid="checklist">
      <li
        v-for="(s, i) in steps"
        :key="s.id"
        class="flex items-start gap-3 py-3"
        :data-step="s.id"
        :data-done="s.done"
      >
        <span
          class="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[13px] tabular-nums"
          :class="s.done ? 'border-ink bg-ink text-paper' : 'border-rule text-graphite-2'"
          aria-hidden="true"
          >{{ s.done ? '✓' : i + 1 }}</span
        >
        <div class="flex min-w-0 flex-1 flex-col gap-1">
          <p class="font-medium">
            {{ s.title
            }}<span v-if="s.optional" class="font-normal text-graphite-2"> (optional)</span>
            <span class="sr-only">{{ s.done ? ', done' : ', not done' }}</span>
          </p>
          <p class="text-[13px] text-graphite-2">{{ s.detail }}</p>
        </div>
        <button
          class="btn"
          :class="!s.done && !s.optional ? 'btn-primary' : ''"
          type="button"
          @click="s.action.run"
        >
          {{ s.action.label }}
        </button>
      </li>
    </ol>
  </section>
</template>
