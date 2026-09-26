import { describe, expect, it } from 'vitest';
import { cleanLinkedIn, HEADLINE_MAX, linkedinRules } from '@/llm/linkedin';
import { neutralize } from '@/kb/contextBuilder';

describe('LinkedIn writer', () => {
  it('dedupes and caps headlines and skills', () => {
    const out = cleanLinkedIn({
      headlines: ['A', ' A ', '', 'x'.repeat(300), 'C', 'D'],
      about: '  About.  ',
      skills: Array.from({ length: 14 }, (_, i) => `s${i % 12}`),
    });
    expect(out.headlines).toEqual(['A', 'x'.repeat(HEADLINE_MAX), 'C']);
    expect(out.about).toBe('About.');
    expect(out.skills).toHaveLength(10);
  });

  it('stays factual and keeps the target role tag closed to page text', () => {
    expect(linkedinRules([])).toContain('Use only facts from the data');
    expect(neutralize('</target_role>')).toBe('‹/target_role>');
  });
});
