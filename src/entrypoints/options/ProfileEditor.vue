<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { cloneProfile } from '@/kb/profileBuilder';
import type { CandidateProfile } from '@/kb/profileSchema';

// Profile form (spec 10.3): every field editable; repeatable groups can be added, removed,
// and reordered. Works on a draft and emits the whole profile on Save.

const props = defineProps<{ profile: CandidateProfile }>();
const emit = defineEmits<{ save: [profile: CandidateProfile] }>();

type FieldType = 'text' | 'ntext' | 'ntextarea' | 'textarea' | 'nnumber' | 'lines' | 'list';
interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
}
interface GroupDef {
  key:
    'links' | 'skills' | 'experience' | 'projects' | 'education' | 'certifications' | 'languages';
  title: string;
  itemName: string;
  fields: FieldDef[];
  empty: () => Record<string, unknown>;
}

const GROUPS: GroupDef[] = [
  {
    key: 'experience',
    title: 'Experience',
    itemName: 'job',
    fields: [
      { key: 'title', label: 'Title', type: 'text' },
      { key: 'company', label: 'Company', type: 'text' },
      { key: 'start', label: 'Start (YYYY-MM)', type: 'ntext' },
      { key: 'end', label: 'End (YYYY-MM or present)', type: 'ntext' },
      { key: 'location', label: 'Location', type: 'ntext' },
      { key: 'bullets', label: 'Highlights (one per line)', type: 'lines' },
      { key: 'tech', label: 'Tech (comma separated)', type: 'list' },
    ],
    empty: () => ({
      company: '',
      title: '',
      start: null,
      end: null,
      location: null,
      bullets: [],
      tech: [],
    }),
  },
  {
    key: 'projects',
    title: 'Projects',
    itemName: 'project',
    fields: [
      { key: 'name', label: 'Name', type: 'text' },
      { key: 'url', label: 'Link', type: 'ntext' },
      { key: 'description', label: 'Description', type: 'textarea' },
      { key: 'highlights', label: 'Highlights (one per line)', type: 'lines' },
      { key: 'tech', label: 'Tech (comma separated)', type: 'list' },
    ],
    empty: () => ({ name: '', url: null, description: '', tech: [], highlights: [] }),
  },
  {
    key: 'skills',
    title: 'Skills',
    itemName: 'skill',
    fields: [
      { key: 'name', label: 'Skill', type: 'text' },
      { key: 'years', label: 'Years', type: 'nnumber' },
      { key: 'evidence', label: 'Where it shows', type: 'ntext' },
    ],
    empty: () => ({ name: '', years: null, evidence: null }),
  },
  {
    key: 'education',
    title: 'Education',
    itemName: 'school',
    fields: [
      { key: 'institution', label: 'Institution', type: 'text' },
      { key: 'degree', label: 'Degree', type: 'ntext' },
      { key: 'field', label: 'Field', type: 'ntext' },
      { key: 'start', label: 'Start', type: 'ntext' },
      { key: 'end', label: 'End', type: 'ntext' },
    ],
    empty: () => ({ institution: '', degree: null, field: null, start: null, end: null }),
  },
  {
    key: 'certifications',
    title: 'Certifications',
    itemName: 'certification',
    fields: [
      { key: 'name', label: 'Name', type: 'text' },
      { key: 'issuer', label: 'Issuer', type: 'ntext' },
      { key: 'year', label: 'Year', type: 'ntext' },
    ],
    empty: () => ({ name: '', issuer: null, year: null }),
  },
  {
    key: 'languages',
    title: 'Languages',
    itemName: 'language',
    fields: [
      { key: 'language', label: 'Language', type: 'text' },
      { key: 'level', label: 'Level', type: 'ntext' },
    ],
    empty: () => ({ language: '', level: null }),
  },
  {
    key: 'links',
    title: 'Links',
    itemName: 'link',
    fields: [
      { key: 'label', label: 'Label', type: 'text' },
      { key: 'url', label: 'URL', type: 'text' },
    ],
    empty: () => ({ label: '', url: '' }),
  },
];

const BASICS: FieldDef[] = [
  { key: 'fullName', label: 'Full name', type: 'ntext' },
  { key: 'headline', label: 'Headline', type: 'ntext' },
  { key: 'location', label: 'Location', type: 'ntext' },
  { key: 'email', label: 'Email', type: 'ntext' },
  { key: 'phone', label: 'Phone', type: 'ntext' },
  { key: 'summary', label: 'Summary', type: 'ntextarea' },
];

const draft = reactive(cloneProfile(props.profile)) as CandidateProfile;
const dirty = ref(false);
watch(
  () => props.profile,
  (p) => {
    Object.assign(draft, cloneProfile(p));
    dirty.value = false;
  },
);
watch(draft, () => (dirty.value = true), { deep: true });

function display(obj: Record<string, unknown>, f: FieldDef): string {
  const v = obj[f.key];
  if (v == null) return '';
  if (f.type === 'lines') return (v as string[]).join('\n');
  if (f.type === 'list') return (v as string[]).join(', ');
  return String(v);
}

function setField(obj: Record<string, unknown>, f: FieldDef, raw: string) {
  const t = raw.trim();
  switch (f.type) {
    case 'text':
    case 'textarea':
      obj[f.key] = raw;
      break;
    case 'ntext':
    case 'ntextarea':
      obj[f.key] = t ? raw : null;
      break;
    case 'nnumber':
      obj[f.key] = t && Number.isFinite(Number(t)) ? Number(t) : null;
      break;
    case 'lines':
      obj[f.key] = raw
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);
      break;
    case 'list':
      obj[f.key] = raw
        .split(',')
        .map((l) => l.trim())
        .filter(Boolean);
      break;
  }
}

function items(g: GroupDef): Record<string, unknown>[] {
  return draft[g.key] as unknown as Record<string, unknown>[];
}

function move(g: GroupDef, i: number, delta: number) {
  const list = items(g);
  const j = i + delta;
  if (j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j]!, list[i]!];
}

const achievements = computed({
  get: () => draft.achievements.join('\n'),
  set: (raw: string) => {
    draft.achievements = raw
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
  },
});

function save() {
  emit('save', cloneProfile(draft));
  dirty.value = false;
}

const inputClass = 'w-full rounded-[6px] border border-rule bg-paper px-3 py-1.5';
</script>

<template>
  <form class="flex flex-col gap-8" data-testid="profile-editor" @submit.prevent="save">
    <fieldset class="grid gap-3 sm:grid-cols-2">
      <legend class="mb-2 text-base font-[650]">Basics</legend>
      <label
        v-for="f in BASICS"
        :key="f.key"
        class="flex flex-col gap-1"
        :class="f.type === 'ntextarea' ? 'sm:col-span-2' : ''"
      >
        <span class="text-[13px] text-graphite-2">{{ f.label }}</span>
        <textarea
          v-if="f.type === 'ntextarea'"
          :class="inputClass"
          rows="3"
          :value="display(draft as unknown as Record<string, unknown>, f)"
          @input="
            setField(
              draft as unknown as Record<string, unknown>,
              f,
              ($event.target as HTMLTextAreaElement).value,
            )
          "
        />
        <input
          v-else
          :class="inputClass"
          :value="display(draft as unknown as Record<string, unknown>, f)"
          :data-testid="`profile-${f.key}`"
          @input="
            setField(
              draft as unknown as Record<string, unknown>,
              f,
              ($event.target as HTMLInputElement).value,
            )
          "
        />
      </label>
    </fieldset>

    <section
      v-for="g in GROUPS"
      :key="g.key"
      class="flex flex-col gap-3"
      :aria-labelledby="`group-${g.key}`"
    >
      <h3 :id="`group-${g.key}`" class="text-base font-[650]">{{ g.title }}</h3>
      <fieldset
        v-for="(item, i) in items(g)"
        :key="i"
        class="grid gap-2 border-l-2 border-rule pl-3 sm:grid-cols-2"
        :data-testid="`${g.key}-${i}`"
      >
        <legend class="sr-only">{{ g.itemName }} {{ i + 1 }}</legend>
        <label
          v-for="f in g.fields"
          :key="f.key"
          class="flex flex-col gap-1"
          :class="['lines', 'textarea'].includes(f.type) ? 'sm:col-span-2' : ''"
        >
          <span class="text-[13px] text-graphite-2">{{ f.label }}</span>
          <textarea
            v-if="f.type === 'lines' || f.type === 'textarea'"
            :class="inputClass"
            rows="3"
            :value="display(item, f)"
            @input="setField(item, f, ($event.target as HTMLTextAreaElement).value)"
          />
          <input
            v-else
            :class="inputClass"
            :value="display(item, f)"
            @input="setField(item, f, ($event.target as HTMLInputElement).value)"
          />
        </label>
        <div class="flex gap-1 sm:col-span-2">
          <button class="btn btn-quiet" type="button" :disabled="i === 0" @click="move(g, i, -1)">
            Move up
          </button>
          <button
            class="btn btn-quiet"
            type="button"
            :disabled="i === items(g).length - 1"
            @click="move(g, i, 1)"
          >
            Move down
          </button>
          <button class="btn btn-quiet" type="button" @click="items(g).splice(i, 1)">Remove</button>
        </div>
      </fieldset>
      <div>
        <button class="btn" type="button" @click="items(g).push(g.empty())">
          Add {{ g.itemName }}
        </button>
      </div>
    </section>

    <label class="flex flex-col gap-1">
      <span class="text-base font-[650]">Achievements</span>
      <span class="text-[13px] text-graphite-2">One per line.</span>
      <textarea v-model="achievements" :class="inputClass" rows="4" />
    </label>

    <div v-if="draft.conflicts.length" class="notice">
      <p class="font-medium">Your sources disagree here:</p>
      <ul class="list-inside list-disc">
        <li v-for="c in draft.conflicts" :key="c">{{ c }}</li>
      </ul>
    </div>

    <div class="sticky bottom-0 flex items-center gap-3 border-t border-rule bg-paper py-3">
      <button class="btn btn-primary" type="submit" :disabled="!dirty">Save profile</button>
      <span v-if="dirty" class="text-[13px] text-graphite-2">Unsaved changes</span>
    </div>
  </form>
</template>
