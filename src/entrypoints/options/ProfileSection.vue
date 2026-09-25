<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import {
  buildProfile,
  cloneProfile,
  changedSections,
  mergeProfiles,
  PROFILE_SECTIONS,
  type SectionChoice,
  type SectionId,
} from '@/kb/profileBuilder';
import type { CandidateProfile, ProfileRecord } from '@/kb/profileSchema';
import { getProfile, getSources, saveProfile } from '@/storage/items';
import { configuredProvider, describeError } from './aiProvider';
import ProfileEditor from './ProfileEditor.vue';

const record = ref<ProfileRecord | null>(null);
const busy = ref(false);
const error = ref('');
const saved = ref(false);
const hasSources = ref(false);

// Rebuild comparison state.
const candidate = ref<CandidateProfile | null>(null);
const changed = ref<SectionId[]>([]);
const choices = ref<Partial<Record<SectionId, SectionChoice>>>({});

const changedDefs = computed(() => PROFILE_SECTIONS.filter((s) => changed.value.includes(s.id)));

async function load() {
  record.value = await getProfile();
  const sources = await getSources();
  hasSources.value = sources.some((s) => s.enabled && s.text.trim());
}

async function build() {
  error.value = '';
  busy.value = true;
  try {
    const { provider, settings } = await configuredProvider();
    const sources = (await getSources()).filter((s) => s.enabled);
    const next = await buildProfile(provider, settings.model, sources);
    const sourceIds = sources.map((s) => s.id);
    if (!record.value) {
      await saveProfile({
        profile: next,
        builtAt: new Date().toISOString(),
        editedAt: null,
        sourceIds,
        previous: null,
      });
      await load();
      return;
    }
    // Existing profile: compare section by section, never overwrite silently.
    const diff = changedSections(record.value.profile, next);
    if (!diff.length) {
      error.value = 'The rebuilt profile matches the current one.';
      return;
    }
    candidate.value = next;
    changed.value = diff;
    // Sections the user never edited default to the new version.
    choices.value = Object.fromEntries(
      diff.map((id) => [id, record.value!.editedAt ? 'mine' : 'new']),
    );
  } catch (err) {
    error.value = describeError(err);
  } finally {
    busy.value = false;
  }
}

async function applyRebuild() {
  if (!record.value || !candidate.value) return;
  const merged = mergeProfiles(record.value.profile, candidate.value, choices.value);
  const sources = (await getSources()).filter((s) => s.enabled);
  await saveProfile({
    ...record.value,
    profile: merged,
    builtAt: new Date().toISOString(),
    sourceIds: sources.map((s) => s.id),
    previous: cloneProfile(record.value.profile),
  });
  candidate.value = null;
  await load();
}

function summarize(p: CandidateProfile, id: SectionId): string {
  const section = PROFILE_SECTIONS.find((s) => s.id === id)!;
  const value = section.keys.map((k) => p[k]);
  const text = JSON.stringify(value.length === 1 ? value[0] : value, null, 1);
  return text.length > 600 ? `${text.slice(0, 600)}…` : text;
}

async function saveEdits(profile: CandidateProfile) {
  if (!record.value) return;
  await saveProfile({
    ...record.value,
    profile,
    editedAt: new Date().toISOString(),
    previous: record.value.profile,
  });
  await load();
  saved.value = true;
  setTimeout(() => (saved.value = false), 2000);
}

/** One level of undo (spec 7.2 `previous`). */
async function undo() {
  if (!record.value?.previous) return;
  await saveProfile({
    ...record.value,
    profile: record.value.previous,
    previous: record.value.profile,
    editedAt: new Date().toISOString(),
  });
  await load();
}

onMounted(load);
</script>

<template>
  <section id="profile" class="flex flex-col gap-5" aria-labelledby="profile-title">
    <div>
      <h2 id="profile-title" class="text-xl font-[650]">Profile</h2>
      <p class="text-graphite-2">
        Built by the AI from your sources. Check it and fix anything it got wrong.
      </p>
    </div>

    <div class="flex flex-wrap items-center gap-2">
      <button
        class="btn btn-primary"
        type="button"
        :disabled="busy || !hasSources"
        data-testid="build-profile"
        @click="build"
      >
        {{ busy ? 'Building' : record ? 'Rebuild from sources' : 'Build profile' }}
      </button>
      <button v-if="record?.previous" class="btn btn-quiet" type="button" @click="undo">
        Undo last change
      </button>
      <span v-if="!hasSources" class="text-graphite-2">Add a source first.</span>
      <span v-if="saved" role="status" class="text-graphite-2">Saved</span>
    </div>
    <p v-if="error" class="notice" role="alert">{{ error }}</p>

    <div
      v-if="candidate && record"
      class="flex flex-col gap-4 border-l-2 border-ink pl-4"
      data-testid="rebuild-compare"
    >
      <h3 class="font-[650]">Rebuilt profile: choose what to keep</h3>
      <fieldset v-for="s in changedDefs" :key="s.id" class="flex flex-col gap-2">
        <legend class="font-medium">{{ s.title }}</legend>
        <div class="grid gap-3 sm:grid-cols-2">
          <label class="flex flex-col gap-1">
            <span class="flex items-center gap-2"
              ><input v-model="choices[s.id]" type="radio" value="mine" /> Keep mine</span
            >
            <pre class="max-h-48 overflow-auto whitespace-pre-wrap bg-canary p-2 text-[12px]">{{
              summarize(record.profile, s.id)
            }}</pre>
          </label>
          <label class="flex flex-col gap-1">
            <span class="flex items-center gap-2"
              ><input v-model="choices[s.id]" type="radio" value="new" /> Use new</span
            >
            <pre class="max-h-48 overflow-auto whitespace-pre-wrap bg-canary p-2 text-[12px]">{{
              summarize(candidate, s.id)
            }}</pre>
          </label>
        </div>
      </fieldset>
      <div class="flex gap-2">
        <button class="btn btn-primary" type="button" @click="applyRebuild">Apply</button>
        <button class="btn" type="button" @click="candidate = null">Cancel</button>
      </div>
    </div>

    <ProfileEditor v-if="record && !candidate" :profile="record.profile" @save="saveEdits" />
  </section>
</template>
