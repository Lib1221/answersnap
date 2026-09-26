<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { BRAND } from '@/config/brand';
import AppCredit from '@/ui/AppCredit.vue';
import Icon, { type IconName } from '@/ui/AppIcon.vue';
import LogoMark from '@/ui/LogoMark.vue';
import { corruptNoticeItem } from '@/storage/items';
import ApplicantSection from './ApplicantSection.vue';
import ApplicationsSection from './ApplicationsSection.vue';
import CoverLetterSection from './CoverLetterSection.vue';
import GettingStartedSection from './GettingStartedSection.vue';
import PrivacySection from './PrivacySection.vue';
import ProfileSection from './ProfileSection.vue';
import ProviderSection from './ProviderSection.vue';
import SourcesSection from './SourcesSection.vue';
import StandardAnswersSection from './StandardAnswersSection.vue';
import StoriesSection from './StoriesSection.vue';
import WritingStyleSection from './WritingStyleSection.vue';

const SECTIONS = [
  { id: 'welcome', title: 'Getting started', icon: 'flag' },
  { id: 'applications', title: 'Applications', icon: 'briefcase' },
  { id: 'provider', title: 'AI provider', icon: 'key' },
  { id: 'sources', title: 'Sources', icon: 'file' },
  { id: 'profile', title: 'Profile', icon: 'user' },
  { id: 'standard-answers', title: 'Standard answers', icon: 'book' },
  { id: 'applicant', title: 'Applicant details', icon: 'shield' },
  { id: 'cover-letter', title: 'Cover letter', icon: 'mail' },
  { id: 'stories', title: 'Stories', icon: 'bookmark' },
  { id: 'writing-style', title: 'Writing style', icon: 'pen' },
  { id: 'privacy', title: 'Privacy', icon: 'shield' },
] as const satisfies readonly { id: string; title: string; icon: IconName }[];
const version = browser.runtime.getManifest().version;
type SectionId = (typeof SECTIONS)[number]['id'];

const current = ref<SectionId>('welcome');
const corrupt = ref<string[]>([]);

function fromHash() {
  const id = location.hash.slice(1).split('?')[0]!;
  if (SECTIONS.some((s) => s.id === id)) current.value = id as SectionId;
}

onMounted(async () => {
  fromHash();
  window.addEventListener('hashchange', fromHash);
  corrupt.value = await corruptNoticeItem.getValue();
});
onUnmounted(() => window.removeEventListener('hashchange', fromHash));

async function dismissCorrupt() {
  await corruptNoticeItem.setValue([]);
  corrupt.value = [];
}
</script>

<template>
  <div class="flex min-h-screen bg-surface">
    <aside
      class="sticky top-0 flex h-screen w-64 shrink-0 flex-col border-r border-rule bg-paper px-4 py-6"
    >
      <div class="mb-6 flex items-center gap-2.5 px-2">
        <LogoMark :size="34" />
        <div>
          <p class="text-[16px] leading-tight font-[650]">{{ BRAND.name }}</p>
          <p class="text-[12px] text-graphite-2">Answers from your own resume</p>
        </div>
      </div>
      <nav aria-label="Settings sections">
        <ul class="flex flex-col gap-0.5">
          <li v-for="s in SECTIONS" :key="s.id">
            <a
              :href="`#${s.id}`"
              class="flex items-center gap-2.5 rounded-[8px] px-2.5 py-2 text-[13.5px] transition-colors"
              :class="
                current === s.id
                  ? 'bg-ink-soft font-medium text-ink'
                  : 'text-graphite-2 hover:bg-surface hover:text-graphite'
              "
              :aria-current="current === s.id ? 'page' : undefined"
            >
              <Icon :name="s.icon" :size="16" />
              {{ s.title }}
            </a>
          </li>
          <li class="mt-2 border-t border-rule pt-2">
            <a
              href="/resume.html"
              target="_blank"
              class="flex items-center gap-2.5 rounded-[8px] px-2.5 py-2 text-[13.5px] text-graphite-2 transition-colors hover:bg-surface hover:text-graphite"
              data-testid="open-resume-builder"
            >
              <Icon name="file" :size="16" />
              Resume builder
            </a>
          </li>
        </ul>
      </nav>
      <div class="mt-auto flex flex-col gap-2 border-t border-rule px-2 pt-4">
        <AppCredit />
        <p class="text-[11.5px] text-graphite-2">Version {{ version }}</p>
      </div>
    </aside>
    <main class="min-w-0 flex-1 px-10 py-8">
      <div class="mx-auto max-w-3xl">
        <div
          v-if="corrupt.length"
          class="notice mb-6 flex items-start justify-between gap-4"
          role="alert"
        >
          <p>
            Some saved data couldn't be read and was reset. A copy was kept in case you need it.
          </p>
          <button class="btn" type="button" @click="dismissCorrupt">Dismiss</button>
        </div>
        <div class="card p-8">
          <GettingStartedSection v-if="current === 'welcome'" />
          <ApplicationsSection v-else-if="current === 'applications'" />
          <ProviderSection v-else-if="current === 'provider'" />
          <SourcesSection v-else-if="current === 'sources'" />
          <ProfileSection v-else-if="current === 'profile'" />
          <StandardAnswersSection v-else-if="current === 'standard-answers'" />
          <ApplicantSection v-else-if="current === 'applicant'" />
          <CoverLetterSection v-else-if="current === 'cover-letter'" />
          <StoriesSection v-else-if="current === 'stories'" />
          <WritingStyleSection v-else-if="current === 'writing-style'" />
          <PrivacySection v-else-if="current === 'privacy'" />
        </div>
      </div>
    </main>
  </div>
</template>
