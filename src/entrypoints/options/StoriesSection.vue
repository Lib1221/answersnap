<script setup lang="ts">
import { computed, ref } from 'vue';
import { z } from 'zod';
import { loadCandidateData } from '@/kb/candidate';
import { buildSystemBlocks, hasCandidateData } from '@/kb/contextBuilder';
import {
  emptyStory,
  formatStory,
  isComplete,
  parseStory,
  storyLabel,
  STORY_SUGGEST_RULES,
  StorySuggestSchema,
  type Story,
} from '@/kb/stories';
import Icon from '@/ui/AppIcon.vue';
import { configuredProvider, describeError } from './aiProvider';
import { newSource, useSources } from './useSources';

const { sources, add, update, remove } = useSources();
const stories = computed(() =>
  sources.value.filter((s) => s.kind === 'story').map((s) => ({ source: s, story: parseStory(s) })),
);

/** The story being edited: an existing source id, or 'new'. */
const editing = ref<string | null>(null);
const draft = ref<Story>(emptyStory());
const skillsText = ref('');
const suggestions = ref<Story[]>([]);
const busy = ref('');
const error = ref('');

const FIELDS: { key: 'situation' | 'task' | 'action' | 'result'; label: string; hint: string }[] = [
  { key: 'situation', label: 'Situation', hint: 'Where you were and what was going on' },
  { key: 'task', label: 'Task', hint: 'What you had to do, and why it mattered' },
  { key: 'action', label: 'Action', hint: 'What you did, step by step' },
  { key: 'result', label: 'Result', hint: 'What changed; a number if you have one' },
];

function startEdit(id: string | 'new', story: Story = emptyStory()) {
  editing.value = id;
  draft.value = { ...story };
  skillsText.value = story.skills.join(', ');
}

async function saveDraft() {
  const story = { ...draft.value, skills: skillsText.value.split(',').map((k) => k.trim()) };
  if (!isComplete(story)) return;
  const text = formatStory(story);
  if (editing.value && editing.value !== 'new')
    await update(editing.value, { label: storyLabel(story), text });
  else await add(newSource('story', storyLabel(story), text));
  editing.value = null;
}

async function suggest() {
  error.value = '';
  busy.value = 'Reading your profile for stories';
  try {
    const data = await loadCandidateData();
    if (!hasCandidateData(data)) {
      error.value = 'Add your resume in Sources first.';
      return;
    }
    const { provider, settings } = await configuredProvider();
    const { $schema: _drop, ...schema } = z.toJSONSchema(StorySuggestSchema) as Record<
      string,
      unknown
    >;
    const result = await provider.complete({
      model: settings.model,
      maxTokens: 6000,
      system: [
        { text: STORY_SUGGEST_RULES },
        { text: buildSystemBlocks(settings, data)[1]!.text, cache: true },
      ],
      messages: [{ role: 'user', content: [{ type: 'text', text: 'Suggest the stories.' }] }],
      jsonSchema: schema,
      schemaName: 'save_stories',
    });
    const parsed = StorySuggestSchema.safeParse(result.json);
    if (!parsed.success) throw new Error('The suggestions came back in an unexpected shape.');
    suggestions.value = parsed.data.stories.filter(isComplete);
    if (!suggestions.value.length) error.value = 'No new stories found in your profile.';
  } catch (err) {
    error.value = describeError(err);
  } finally {
    busy.value = '';
  }
}

async function keep(s: Story) {
  await add(newSource('story', storyLabel(s), formatStory(s)));
  suggestions.value = suggestions.value.filter((x) => x !== s);
}
</script>

<template>
  <section id="stories" class="flex flex-col gap-6" aria-labelledby="stories-title">
    <div>
      <h2 id="stories-title" class="text-xl font-[650]">Stories</h2>
      <p class="text-graphite-2">
        Your best work stories in STAR form (situation, task, action, result). "Tell me about a
        time..." answers, cover letters, and interview prep use them first.
      </p>
    </div>

    <div class="flex flex-wrap gap-2">
      <button
        class="btn btn-primary"
        type="button"
        data-testid="story-add"
        @click="startEdit('new')"
      >
        <Icon name="pen" /> Add a story
      </button>
      <button
        class="btn"
        type="button"
        :disabled="!!busy"
        data-testid="story-suggest"
        @click="suggest"
      >
        <Icon name="sparkle" /> Suggest stories from my resume
      </button>
    </div>
    <p v-if="busy" role="status" class="text-graphite-2">{{ busy }}…</p>
    <p v-if="error" class="notice" role="alert">{{ error }}</p>

    <form
      v-if="editing"
      class="card flex flex-col gap-3 p-5"
      data-testid="story-editor"
      @submit.prevent="saveDraft"
    >
      <label class="flex flex-col gap-1 font-medium">
        Title
        <input
          v-model="draft.title"
          class="field-input px-3 py-2 font-normal"
          placeholder="Cut invoice report latency by 70%"
          data-testid="story-title"
        />
      </label>
      <label v-for="f in FIELDS" :key="f.key" class="flex flex-col gap-1 font-medium">
        {{ f.label }}
        <textarea
          v-model="draft[f.key]"
          rows="2"
          class="field-input px-3 py-2 font-normal"
          :placeholder="f.hint"
          :data-testid="`story-${f.key}`"
        />
      </label>
      <label class="flex flex-col gap-1 font-medium">
        Skills it shows
        <input
          v-model="skillsText"
          class="field-input px-3 py-2 font-normal"
          placeholder="Python, performance, ownership"
          data-testid="story-skills"
        />
      </label>
      <p class="text-[13px] text-graphite-2">A title, an action, and a result are required.</p>
      <div class="flex gap-2">
        <button
          class="btn btn-primary"
          type="submit"
          :disabled="!isComplete(draft)"
          data-testid="story-save"
        >
          <Icon name="check" /> Save story
        </button>
        <button class="btn btn-quiet" type="button" @click="editing = null">Cancel</button>
      </div>
    </form>

    <div v-if="suggestions.length" class="flex flex-col gap-3" data-testid="story-suggestions">
      <p class="eyebrow">Suggestions from your profile. Keep the ones that sound like you.</p>
      <article
        v-for="s in suggestions"
        :key="s.title"
        class="card flex flex-col gap-1.5 border-l-4 border-l-canary-edge p-4"
      >
        <p class="font-medium">{{ s.title }}</p>
        <p class="text-[13.5px]"><strong>Action:</strong> {{ s.action }}</p>
        <p class="text-[13.5px]"><strong>Result:</strong> {{ s.result }}</p>
        <div class="flex gap-2">
          <button class="btn min-h-0 py-1" type="button" @click="keep(s)">
            <Icon name="check" :size="14" /> Keep
          </button>
          <button
            class="btn btn-quiet min-h-0 py-1"
            type="button"
            @click="suggestions = suggestions.filter((x) => x !== s)"
          >
            Skip
          </button>
        </div>
      </article>
    </div>

    <p v-if="!stories.length && !editing" class="rounded-control bg-surface p-4 text-graphite-2">
      No stories yet. Add one, or let AnswerSnap suggest some from your resume.
    </p>
    <ul class="flex flex-col gap-3" data-testid="story-list">
      <li
        v-for="{ source, story } in stories"
        :key="source.id"
        class="card flex flex-col gap-2 p-4"
      >
        <div class="flex flex-wrap items-start gap-2">
          <p class="min-w-0 flex-1 font-medium">{{ story.title }}</p>
          <label class="flex items-center gap-1.5 text-[13px] text-graphite-2">
            <input
              type="checkbox"
              :checked="source.enabled"
              @change="update(source.id, { enabled: ($event.target as HTMLInputElement).checked })"
            />
            Use
          </label>
        </div>
        <p class="text-[13.5px] text-graphite-2">{{ story.result }}</p>
        <ul v-if="story.skills.length" class="flex flex-wrap gap-1.5">
          <li v-for="k in story.skills" :key="k" class="chip min-h-0 py-0.5 text-[12px]">
            {{ k }}
          </li>
        </ul>
        <div class="flex gap-1">
          <button class="btn btn-quiet" type="button" @click="startEdit(source.id, story)">
            Edit
          </button>
          <button class="btn btn-quiet" type="button" @click="remove(source.id)">Delete</button>
        </div>
      </li>
    </ul>
  </section>
</template>
