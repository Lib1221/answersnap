import { describe, expect, it } from 'vitest';
import { cleanFit, verdictFor } from '@/llm/jobFit';

describe('job fit', () => {
  it('labels the score', () => {
    expect([95, 80, 79, 60, 59, 40, 39, 0].map(verdictFor)).toEqual([
      'strong',
      'strong',
      'good',
      'good',
      'stretch',
      'stretch',
      'long-shot',
      'long-shot',
    ]);
  });

  it('clamps the score, orders requirements, and tidies lists', () => {
    const fit = cleanFit(
      {
        score: 140.6,
        summary: '  Good.  ',
        requirements: [
          { requirement: 'Nice met', mustHave: false, met: true, evidence: 'x', advice: null },
          { requirement: 'Must met', mustHave: true, met: true, evidence: 'y', advice: null },
          { requirement: 'Must gap', mustHave: true, met: false, evidence: null, advice: 'z' },
          { requirement: ' ', mustHave: true, met: false, evidence: null, advice: null },
        ],
        keywords: ['Go', ' Go ', '', 'SQL', ...Array.from({ length: 12 }, (_, i) => `k${i}`)],
        talkingPoints: ['a', ' ', 'b', 'c', 'd'],
      },
      'm',
    );
    expect(fit.score).toBe(100);
    expect(fit.verdict).toBe('strong');
    expect(fit.summary).toBe('Good.');
    expect(fit.requirements.map((r) => r.requirement)).toEqual([
      'Must gap',
      'Must met',
      'Nice met',
    ]);
    expect(fit.keywords.slice(0, 3)).toEqual(['Go', 'SQL', 'k0']);
    expect(fit.keywords).toHaveLength(10);
    expect(fit.talkingPoints).toEqual(['a', 'b', 'c']);
    expect(cleanFit({ ...fit, score: -5 }, 'm').score).toBe(0);
  });
});
