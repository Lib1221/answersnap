import { describe, expect, it } from 'vitest';
import { refineInstruction } from '@/llm/conversation';
import {
  factCheckUserText,
  mergeVerdicts,
  runFactCheck,
  shouldFactCheck,
  splitSentences,
  type SentenceCheck,
} from '@/llm/factCheck';
import type { CompleteRequest, LlmProvider } from '@/llm/types';

const EMBELLISHED =
  "I moved report generation to Celery workers, which cut p95 latency from 900 ms to 240 ms. The system was struggling under heavy load before I stepped in. I'd like to do more of this work.";

describe('splitting and eligibility', () => {
  it('splits sentences, keeping decimals and abbreviations whole', () => {
    expect(splitSentences(EMBELLISHED)).toHaveLength(3);
    expect(splitSentences('I have 2.5 years of Django. It was fun!')).toEqual([
      'I have 2.5 years of Django.',
      'It was fun!',
    ]);
    expect(splitSentences('  ')).toEqual([]);
  });

  it('skips value answers and short or placeholder-only answers', () => {
    expect(shouldFactCheck('number', '5')).toBe(false);
    expect(shouldFactCheck('url', 'https://github.com/jamiepark-example')).toBe(false);
    expect(shouldFactCheck('salary', '[[expected hourly rate in USD]]')).toBe(false);
    expect(shouldFactCheck('short_text', '[[notice period]] is my notice.')).toBe(false);
    expect(shouldFactCheck('long_text', EMBELLISHED)).toBe(true);
  });
});

describe('request and merge', () => {
  it('numbers the sentences and includes the question and job context', () => {
    const text = factCheckUserText(
      ['One.', 'Two.'],
      'Describe a project.',
      'Backend role at Acme.',
    );
    expect(text).toContain('<answer_sentences>\n1. One.\n2. Two.\n</answer_sentences>');
    expect(text).toContain('<question>Describe a project.</question>');
    expect(text).toContain('<job_context>\nBackend role at Acme.\n</job_context>');
    expect(factCheckUserText(['One.'], '', null)).not.toContain('<job_context>');
  });

  it('maps verdicts back by index and treats placeholder sentences as placeholders', () => {
    const merged = mergeVerdicts(['Fact.', 'Made up.', '[[rate]].'], {
      checks: [
        {
          index: 1,
          claims: [{ claim: 'did X', quote: 'Did X' }],
          verdict: 'supported',
          issue: null,
        },
        {
          index: 2,
          claims: [{ claim: 'did Y', quote: null }],
          verdict: 'unsupported',
          issue: 'Not in your resume.',
        },
      ],
    });
    expect(merged.map((c) => c.verdict)).toEqual(['supported', 'unsupported', 'placeholder']);
    expect(merged[0]!.evidence).toBe('Did X');
    expect(merged[1]!.issue).toBe('Not in your resume.');
  });

  it('flags a sentence with an unquoted claim even if the model called it supported', () => {
    const [c] = mergeVerdicts(['The system was struggling, so I moved it to Celery.'], {
      checks: [
        {
          index: 1,
          claims: [
            { claim: 'the system was struggling', quote: null },
            { claim: 'moved it to Celery', quote: 'moving report generation to Celery workers' },
          ],
          verdict: 'supported',
          issue: null,
        },
      ],
    });
    expect(c).toMatchObject({
      verdict: 'unsupported',
      issue: 'Not in your data: the system was struggling.',
    });
  });
});

describe('runFactCheck', () => {
  it('sends the candidate block with a cache breakpoint and a JSON schema, and reports unsupported sentences', async () => {
    const seen: CompleteRequest[] = [];
    const provider = {
      complete: async (req: CompleteRequest) => {
        seen.push(req);
        return {
          text: '',
          json: {
            checks: [
              {
                index: 1,
                claims: [{ claim: 'cut latency', quote: 'Cut p95 latency' }],
                verdict: 'supported',
                issue: null,
              },
              {
                index: 2,
                claims: [{ claim: 'system struggling', quote: null }],
                verdict: 'unsupported',
                issue: 'No load problems in your resume.',
              },
              { index: 3, claims: [], verdict: 'supported', issue: null },
            ],
          },
          stopReason: 'end_turn',
          usage: { inputTokens: 0, cacheWriteTokens: 0, cacheReadTokens: 0, outputTokens: 0 },
          model: 'fast-model-used',
        };
      },
    } as unknown as LlmProvider;
    const result = await runFactCheck({
      provider,
      model: 'fast',
      candidateBlock: '<candidate_profile>{}</candidate_profile>',
      question: 'Q?',
      answer: EMBELLISHED,
    });
    expect(result.unsupported.map((c) => c.sentence)).toEqual([
      'The system was struggling under heavy load before I stepped in.',
    ]);
    expect(result.model).toBe('fast-model-used');
    const req = seen[0]!;
    expect(req.system.map((b) => !!b.cache)).toEqual([false, true]);
    expect(req.schemaName).toBe('save_fact_check');
    expect(JSON.stringify(req.jsonSchema)).toContain('unsupported');
  });

  it('rejects a malformed result', async () => {
    const provider = {
      complete: async () => ({
        text: '',
        json: { nope: 1 },
        stopReason: 'end_turn',
        usage: { inputTokens: 0, cacheWriteTokens: 0, cacheReadTokens: 0, outputTokens: 0 },
      }),
    } as unknown as LlmProvider;
    await expect(
      runFactCheck({ provider, model: 'm', candidateBlock: '', question: '', answer: EMBELLISHED }),
    ).rejects.toThrow();
  });
});

it('"Fix it" asks for a rewrite without exactly the flagged claims', () => {
  const flagged: SentenceCheck[] = [
    {
      sentence: 'The system was struggling.',
      verdict: 'unsupported',
      issue: 'Not in your resume.',
      evidence: null,
    },
  ];
  const text = refineInstruction({ kind: 'fix-facts', unsupported: flagged }, 100, {
    maxChars: 1000,
    explicitChars: false,
  });
  expect(text).toBe(
    'These sentences state things the candidate data doesn\'t support: "The system was struggling." (Not in your resume.). Rewrite the answer without those claims, using only facts from the candidate data. Keep everything else. Same tags.',
  );
});
