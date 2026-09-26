<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { loadCandidateData } from '@/kb/candidate';
import type { CandidateData } from '@/kb/contextBuilder';
import type { CandidateProfile } from '@/kb/profileSchema';
import { t } from '@/ui/i18n';
import LinkedInCard from './LinkedInCard.vue';

const emit = defineEmits<{ openSettings: [section: string] }>();
const data = ref<CandidateData | null>(null);

onMounted(async () => {
  data.value = await loadCandidateData();
});

const profile = () => data.value?.profile as CandidateProfile | null | undefined;
</script>

<template>
  <section v-if="data" class="card flex flex-col gap-4 p-4" data-testid="profile-tab">
    <template v-if="profile()">
      <div>
        <p class="text-base font-[650]">
          {{ profile()!.fullName ?? t('profile_unnamed', 'Unnamed candidate') }}
        </p>
        <p class="text-graphite-2">
          {{ [profile()!.headline, profile()!.location].filter(Boolean).join(', ') }}
        </p>
      </div>
      <p class="text-[13px] tabular-nums">
        {{
          t(
            'profile_counts',
            '$1 jobs, $2 projects, $3 skills',
            String(profile()!.experience.length),
            String(profile()!.projects.length),
            String(profile()!.skills.length),
          )
        }}
      </p>
      <p v-if="profile()!.conflicts.length" class="notice">
        {{
          t(
            'profile_conflicts',
            'Your sources disagree in $1 places. Check the profile.',
            String(profile()!.conflicts.length),
          )
        }}
      </p>
    </template>
    <p v-else class="text-graphite-2">
      {{
        t('profile_none', 'No profile yet. Answers use your sources directly until you build one.')
      }}
    </p>

    <div>
      <p class="mb-1 font-medium">{{ t('profile_sources', 'Sources') }}</p>
      <ul v-if="data.sources.length" class="text-[13px]">
        <li
          v-for="s in data.sources"
          :key="s.id"
          :class="s.enabled ? '' : 'text-graphite-2 line-through'"
        >
          {{ s.label }}
        </li>
      </ul>
      <p v-else class="text-[13px] text-graphite-2">{{ t('profile_no_sources', 'None yet.') }}</p>
    </div>
    <div class="flex flex-wrap gap-2">
      <button class="btn" type="button" @click="emit('openSettings', 'profile')">
        {{ t('profile_edit', 'Edit profile') }}
      </button>
      <button class="btn" type="button" @click="emit('openSettings', 'sources')">
        {{ t('profile_sources', 'Sources') }}
      </button>
      <button class="btn" type="button" @click="emit('openSettings', 'standard-answers')">
        {{ t('profile_standard_answers', 'Standard answers') }}
      </button>
    </div>
  </section>
  <LinkedInCard v-if="data" />
</template>
