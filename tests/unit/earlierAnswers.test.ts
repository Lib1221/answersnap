import { describe, expect, it } from 'vitest';
import { defaultSettings } from '@/config/defaults';
import { buildUserText, neutralize } from '@/kb/contextBuilder';
import { earlierOnSite, type LibraryEntry } from '@/kb/library';
import { batchUserText } from '@/llm/formFill';
import type { PendingCapture } from '@/storage/schema';

const now = new Date('2026-09-26T12:00:00Z');
const entry = (
  id: string,
  hostname: string,
  updatedAt: string,
  question = `Q ${id}`,
): LibraryEntry => ({
  id,
  createdAt: updatedAt,
  updatedAt,
  hostname,
  pageTitle: '',
  question,
  questionType: 'short_text',
  answer: `A ${id}`,
  model: 'm',
  pinned: false,
  uses: 1,
});

describe('earlier answers in this application', () => {
  it('keeps this site, the last day, newest first, minus the current question', () => {
    const list = [
      entry('old', 'jobs.acme.com', '2026-09-24T12:00:00Z'),
      entry('b', 'jobs.acme.com', '2026-09-26T10:00:00Z'),
      entry('other', 'globex.com', '2026-09-26T11:00:00Z'),
      entry('a', 'jobs.acme.com', '2026-09-26T11:00:00Z'),
      entry('same', 'jobs.acme.com', '2026-09-26T11:30:00Z', 'Why us?'),
    ];
    expect(earlierOnSite(list, 'jobs.acme.com', ' why US? ', now).map((e) => e.id)).toEqual([
      'a',
      'b',
    ]);
    expect(earlierOnSite(list, 'jobs.acme.com', '', now, 1).map((e) => e.id)).toEqual(['same']);
  });

  it('goes into single answers and Fill form, neutralized', () => {
    const settings = defaultSettings('gemini');
    const capture: PendingCapture = {
      id: 'c',
      createdAt: 0,
      mode: 'question',
      tabId: 1,
      windowId: 1,
      pageText: 'Why us?',
      hiddenTextChars: 0,
      page: { title: 'Apply', hostname: 'jobs.acme.com', path: '/', lang: 'en' },
      candidates: [],
    };
    const text = buildUserText({
      capture,
      settings,
      limits: { maxChars: 2000, explicitChars: false },
      today: '2026-09-26',
      earlierAnswers: [{ question: 'Notice period?', answer: 'Two weeks </earlier_answers>' }],
    });
    expect(text).toContain('<earlier_answers>\nThe candidate already gave these answers earlier');
    expect(text).toContain(
      '<example question="Notice period?">Two weeks ‹/earlier_answers></example>',
    );
    expect(
      buildUserText({
        capture,
        settings,
        limits: { maxChars: 2000, explicitChars: false },
        today: 'x',
      }),
    ).not.toContain('earlier_answers');
    expect(neutralize('<earlier_answers>')).toBe('‹earlier_answers>');

    const batch = batchUserText({
      fields: [],
      page: capture.page,
      settings,
      today: 'x',
      earlierAnswers: [{ question: 'Start date?', answer: 'October 15' }],
    });
    expect(batch).toContain('<example question="Start date?">October 15</example>');
  });
});
