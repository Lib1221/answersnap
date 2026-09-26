import { describe, expect, it } from 'vitest';
import { emptyStory, formatStory, isComplete, parseStory, storyLabel } from '@/kb/stories';
import { renderSystemRules } from '@/llm/prompts';
import { profileStatus } from '@/entrypoints/sidepanel/profileSummary';
import type { KnowledgeSource } from '@/storage/schema';

const story = {
  title: 'Faster reports',
  situation: 'Reports were slow.\nCustomers complained.',
  task: 'Fix it.',
  action: 'Moved generation to Celery workers.',
  result: 'p95 fell from 900 ms to 240 ms.',
  skills: ['Python', ' Celery ', ''],
};

describe('story bank', () => {
  it('round-trips a story through the source text, multi-line parts included', () => {
    const text = formatStory(story);
    expect(text).toBe(
      'Skills: Python, Celery\nSituation: Reports were slow.\nCustomers complained.\nTask: Fix it.\nAction: Moved generation to Celery workers.\nResult: p95 fell from 900 ms to 240 ms.',
    );
    expect(parseStory({ label: storyLabel(story), text })).toEqual({
      ...story,
      skills: ['Python', 'Celery'],
    });
    expect(storyLabel(emptyStory())).toBe('Story: Untitled');
  });

  it('needs a title, an action, and a result', () => {
    expect(isComplete(story)).toBe(true);
    expect(isComplete({ ...story, result: ' ' })).toBe(false);
    expect(formatStory({ ...emptyStory(), title: 'x', action: 'Did it.' })).toBe('Action: Did it.');
  });

  it('answers prefer stories, and the panel counts them', () => {
    expect(renderSystemRules([])).toContain('prefer a fitting source labeled "Story:"');
    const src = (kind: KnowledgeSource['kind']) =>
      ({
        id: kind,
        kind,
        label: kind,
        text: 'x',
        chars: 1,
        importedAt: '',
        enabled: true,
      }) as KnowledgeSource;
    expect(
      profileStatus({
        profile: { fullName: 'J' },
        sources: [src('resume'), src('story'), src('story')],
      }),
    ).toBe('Profile ready: resume + 2 stories');
  });
});
