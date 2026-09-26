import { z } from 'zod';
import type { KnowledgeSource } from '@/storage/schema';

// Story bank: the candidate's STAR stories, kept as sources of kind 'story' so answers, letters,
// and interview prep use them like any other source. The source text is plain labeled lines, so
// the model reads it directly and the editor can parse it back.

export const STORY_PREFIX = 'Story: ';
const PARTS = ['situation', 'task', 'action', 'result'] as const;
const PART_LABELS: Record<(typeof PARTS)[number], string> = {
  situation: 'Situation',
  task: 'Task',
  action: 'Action',
  result: 'Result',
};

export const StorySchema = z.object({
  title: z.string(),
  situation: z.string(),
  task: z.string(),
  action: z.string(),
  result: z.string(),
  skills: z.array(z.string()),
});
export type Story = z.infer<typeof StorySchema>;

export function emptyStory(): Story {
  return { title: '', situation: '', task: '', action: '', result: '', skills: [] };
}

export function formatStory(s: Story): string {
  const skills = s.skills.map((k) => k.trim()).filter(Boolean);
  return [
    skills.length ? `Skills: ${skills.join(', ')}` : '',
    ...PARTS.map((p) => (s[p].trim() ? `${PART_LABELS[p]}: ${s[p].trim()}` : '')),
  ]
    .filter(Boolean)
    .join('\n');
}

const LINE = /^(Skills|Situation|Task|Action|Result):\s?(.*)$/;

export function parseStory(source: Pick<KnowledgeSource, 'label' | 'text'>): Story {
  const story = emptyStory();
  story.title = source.label.startsWith(STORY_PREFIX)
    ? source.label.slice(STORY_PREFIX.length)
    : source.label;
  let current: keyof Story | null = null;
  for (const line of source.text.split('\n')) {
    const m = line.match(LINE);
    if (m) {
      const key = m[1]!.toLowerCase() as keyof Story;
      current = key;
      if (key === 'skills')
        story.skills = m[2]!
          .split(',')
          .map((k) => k.trim())
          .filter(Boolean);
      else story[key] = m[2]!;
    } else if (current && current !== 'skills' && current !== 'title') {
      // Multi-line parts continue until the next label.
      story[current] = `${story[current]}\n${line}`;
    }
  }
  for (const p of PARTS) story[p] = story[p].trim();
  return story;
}

export function storyLabel(s: Story): string {
  return `${STORY_PREFIX}${s.title.trim() || 'Untitled'}`;
}

export function isComplete(s: Story): boolean {
  return !!s.title.trim() && !!s.action.trim() && !!s.result.trim();
}

export const STORY_SUGGEST_RULES = `You help a candidate build a bank of STAR stories for job applications and interviews. The candidate data is in <candidate_profile>, <standard_answers>, and <source_documents>.

Write 4 stories from real experience in the data, each about a different project or role. Use only facts from the data; where the data is thin, keep that part short rather than inventing details. Skip any story that already appears in a source labeled "Story:".
For each: a short title, then situation, task, action, and result in one to three first-person sentences each; put numbers in the result when the data has them. skills: 2 to 5 skills the story shows.`;

export const StorySuggestSchema = z.object({ stories: z.array(StorySchema) });
