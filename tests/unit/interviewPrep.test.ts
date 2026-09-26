import { describe, expect, it } from 'vitest';
import { interviewRules, QUESTION_COUNT } from '@/llm/interviewPrep';

describe('interview prep rules', () => {
  it('follows the answer mode and style rules', () => {
    const confident = interviewRules(['No em dashes.'], true);
    expect(confident).toContain('about a year of hands-on experience');
    expect(confident).toContain('"assumed" to true');
    expect(confident).toContain('- No em dashes.');
    expect(confident).toContain(`Write the ${QUESTION_COUNT} questions`);
    const honest = interviewRules([], false);
    expect(honest).toContain('Use only facts from the candidate data');
    expect(honest).not.toContain('Style for the answers');
  });
});
