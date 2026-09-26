import { describe, expect, it } from 'vitest';
import { cleanResume, MAX_BULLETS, resumeRules } from '@/llm/resumeTailor';

const raw = {
  summary: ' Summary. ',
  bullets: [
    ...Array.from({ length: 10 }, (_, i) => ({
      original: `o${i}`,
      tailored: `t${i}`,
      assumed: false,
    })),
    { original: null, tailored: 'new one', assumed: false },
    { original: ' ', tailored: 'new two', assumed: false },
    { original: null, tailored: 'new three', assumed: true },
    { original: 'x', tailored: ' ', assumed: false },
  ],
  skills: ['Go', ' Go', '', 'SQL'],
};

describe('resume tailoring', () => {
  it('keeps rewrites, and adds flagged new bullets only when answering confidently', () => {
    const confident = cleanResume(raw, true);
    expect(confident.summary).toBe('Summary.');
    expect(confident.bullets.filter((b) => b.original)).toHaveLength(MAX_BULLETS);
    const added = confident.bullets.filter((b) => !b.original);
    expect(added.map((b) => b.tailored)).toEqual(['new one', 'new two']);
    expect(added.every((b) => b.assumed)).toBe(true);
    expect(confident.skills).toEqual(['Go', 'SQL']);

    const honest = cleanResume(raw, false);
    expect(honest.bullets.every((b) => b.original)).toBe(true);
  });

  it('only allows new bullets in the confident rules', () => {
    expect(resumeRules([], true)).toContain('add at most 2 new bullets');
    expect(resumeRules([], false)).toContain('Do not add new bullets');
    expect(resumeRules(['No em dashes.'], false)).toContain('- No em dashes.');
  });
});
