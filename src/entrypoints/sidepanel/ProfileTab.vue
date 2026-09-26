<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { loadCandidateData } from '@/kb/candidate';
import type { CandidateData } from '@/kb/contextBuilder';
import type { CandidateProfile } from '@/kb/profileSchema';
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
        <p class="text-base font-[650]">{{ profile()!.fullName ?? 'Unnamed candidate' }}</p>
        <p class="text-graphite-2">
          {{ [profile()!.headline, profile()!.location].filter(Boolean).join(', ') }}
        </p>
      </div>
      <p class="text-[13px] tabular-nums">
        {{ profile()!.experience.length }} jobs, {{ profile()!.projects.length }} projects,
        {{ profile()!.skills.length }} skills
      </p>
      <p v-if="profile()!.conflicts.length" class="notice">
        Your sources disagree in {{ profile()!.conflicts.length }} places. Check the profile.
      </p>
    </template>
    <p v-else class="text-graphite-2">
      No profile yet. Answers use your sources directly until you build one.
    </p>

    <div>
      <p class="mb-1 font-medium">Sources</p>
      <ul v-if="data.sources.length" class="text-[13px]">
        <li
          v-for="s in data.sources"
          :key="s.id"
          :class="s.enabled ? '' : 'text-graphite-2 line-through'"
        >
          {{ s.label }}
        </li>
      </ul>
      <p v-else class="text-[13px] text-graphite-2">None yet.</p>
    </div>
    <div class="flex flex-wrap gap-2">
      <button class="btn" type="button" @click="emit('openSettings', 'profile')">
        Edit profile
      </button>
      <button class="btn" type="button" @click="emit('openSettings', 'sources')">Sources</button>
      <button class="btn" type="button" @click="emit('openSettings', 'standard-answers')">
        Standard answers
      </button>
    </div>
  </section>
  <LinkedInCard v-if="data" />
</template>
