import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import {
  buildJobContext,
  getJobContext,
  jobLabel,
  jobPromptText,
  parseRoleLine,
  setJobContext,
  JOB_TTL_MS,
} from '@/kb/jobContext';
import { missingItemHash, standardAnswerKeyFor } from '@/kb/missing';
import type { LlmProvider } from '@/llm/types';
import { hashText, PREWARM_AFTER_MS, shouldPrewarm } from '@/entrypoints/sidepanel/prewarm';
import { detectLanguage, runChecks, unsupportedNumbers } from '../../evals/checks';

beforeEach(() => fakeBrowser.reset());

describe('missing-info chips', () => {
  it.each([
    ['expected hourly rate in USD', 'expectedHourlyRate'],
    ['salary expectation', 'expectedSalary'],
    ['work authorization for the US', 'workAuthorization'],
    ['visa sponsorship', 'needsSponsorship'],
    ['notice period', 'noticePeriod'],
    ['earliest start date', 'availableFrom'],
    ['hours overlap with US Pacific', 'hoursOverlap'],
  ])('maps "%s" to %s', (item, key) => {
    expect(standardAnswerKeyFor(item)).toBe(key);
  });

  it('falls back to a new custom question', () => {
    expect(standardAnswerKeyFor('a time you disagreed with a teammate')).toBeNull();
    expect(missingItemHash('favorite project')).toBe('standard-answers?ask=favorite+project');
    expect(missingItemHash('notice period')).toBe('standard-answers?field=noticePeriod');
  });
});

describe('job context', () => {
  it('reads the role line from a summary, else the page title', () => {
    expect(parseRoleLine('Backend Engineer at Acme\nMore text', 'x')).toEqual({
      title: 'Backend Engineer',
      company: 'Acme',
    });
    expect(parseRoleLine(null, 'Senior Python Developer | Careers at Globex')).toEqual({
      title: 'Senior Python Developer',
      company: null,
    });
  });

  it('summarizes long posts once with the fast model and keeps the original', async () => {
    let calls = 0;
    const provider = {
      complete: async () => {
        calls++;
        return {
          text: 'Backend Engineer at Acme\nPython, Django.',
          stopReason: 'end_turn',
          usage: { inputTokens: 0, cacheWriteTokens: 0, cacheReadTokens: 0, outputTokens: 0 },
        };
      },
    } as unknown as LlmProvider;
    const long = 'Build payment APIs. '.repeat(400);
    const ctx = await buildJobContext({
      hostname: 'jobs.acme.test',
      pageTitle: 'Apply',
      text: long,
      summarize: { provider, model: 'fast' },
    });
    expect(calls).toBe(1);
    expect(ctx.summary).toContain('Python, Django.');
    expect(ctx.text.length).toBeGreaterThan(6000);
    expect(jobPromptText(ctx)).toBe(ctx.summary);
    expect(jobLabel(ctx)).toBe('Backend Engineer at Acme');

    const short = await buildJobContext({
      hostname: 'x',
      pageTitle: 'Data Engineer - Jobs',
      text: 'Short post.',
      summarize: { provider, model: 'fast' },
    });
    expect(calls).toBe(1);
    expect(short.summary).toBeNull();
    expect(jobLabel(short)).toBe('Data Engineer');
  });

  it('appends for "Add more" and expires after 12 hours', async () => {
    const first = await buildJobContext({ hostname: 'h', pageTitle: 'Role', text: 'Part one.' });
    await setJobContext(first);
    const more = await buildJobContext({
      hostname: 'h',
      pageTitle: 'Role',
      text: 'Part two.',
      existing: first,
    });
    expect(more.text).toBe('Part one.\n\nPart two.');
    expect(await getJobContext('h')).not.toBeNull();
    expect(await getJobContext('h', Date.now() + JOB_TTL_MS + 1000)).toBeNull();
    expect(await getJobContext('h')).toBeNull();
  });
});

describe('pre-warm scheduling', () => {
  it('re-warms after 4 minutes, on a model change, or when the profile changes', () => {
    const last = { model: 'claude-sonnet-5', hash: hashText('a'), at: 0 };
    expect(shouldPrewarm(null, 'claude-sonnet-5', last.hash, 0)).toBe(true);
    expect(shouldPrewarm(last, 'claude-sonnet-5', last.hash, PREWARM_AFTER_MS - 1)).toBe(false);
    expect(shouldPrewarm(last, 'claude-sonnet-5', last.hash, PREWARM_AFTER_MS + 1)).toBe(true);
    expect(shouldPrewarm(last, 'claude-opus-5-5', last.hash, 10)).toBe(true);
    expect(shouldPrewarm(last, 'claude-sonnet-5', hashText('b'), 10)).toBe(true);
  });
});

describe('eval checks', () => {
  const parsed = (answer: string, type = 'long_text', missing: string[] = []) =>
    ({ question: '', type, answer, missing, notes: '', usedFallback: false }) as Parameters<
      typeof runChecks
    >[0];
  const ctx = {
    maxChars: 300,
    candidateText: 'Ledgerly 2 million requests, 5 years',
    question: '',
  };
  const failed = (r: ReturnType<typeof runChecks>) =>
    r.filter((c) => !c.ok && !c.flag).map((c) => c.name);

  it('catches dashes, banned words, canaries, and limits', () => {
    expect(
      failed(
        runChecks(
          parsed('I am passionate — about APIs with pineapple.'),
          { mustNotContain: ['pineapple'] },
          ctx,
        ),
      ),
    ).toEqual(['no em or en dashes', 'does not contain "pineapple"', 'no banned words']);
    expect(failed(runChecks(parsed('word '.repeat(60)), { maxWords: 50 }, ctx))).toContain(
      'under the word limit',
    );
  });

  it('checks placeholders, assessments, choices, and language', () => {
    expect(
      failed(runChecks(parsed('[[rate]]', 'salary', ['rate']), { placeholders: true }, ctx)),
    ).toEqual([]);
    expect(failed(runChecks(parsed('', 'assessment'), { assessment: true }, ctx))).toEqual([]);
    expect(
      failed(runChecks(parsed('Native', 'single_choice'), { oneOf: ['Fluent'] }, ctx)),
    ).toEqual(['one of Fluent']);
    expect(
      failed(
        runChecks(
          parsed('Django, FastAPI', 'multi_choice'),
          { subsetOf: ['Django', 'Flask'] },
          ctx,
        ),
      ),
    ).toEqual(['only picks Django, Flask']);
    expect(detectLanguage('Ich möchte bei Ihnen arbeiten, weil ich die Arbeit mag.')).toBe('de');
    expect(detectLanguage('I want to work with you because I like the work.')).toBe('en');
  });

  it('flags numbers that are not in the candidate data', () => {
    expect(
      unsupportedNumbers(
        'I handled 2 million requests over 5 years and 12 clients.',
        ctx.candidateText,
      ),
    ).toEqual(['12']);
  });
});
