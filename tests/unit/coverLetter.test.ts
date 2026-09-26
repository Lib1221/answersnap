import { describe, expect, it } from 'vitest';
import { defaultSettings } from '@/config/defaults';
import {
  COVER_LETTER_LABEL,
  findCoverLetter,
  isCoverLetterQuestion,
  LETTER_LENGTHS,
  letterQuestion,
} from '@/kb/coverLetter';
import { buildUserText } from '@/kb/contextBuilder';
import { batchUserText } from '@/llm/formFill';
import { parseLimits } from '@/llm/limits';
import { profileStatus } from '@/entrypoints/sidepanel/profileSummary';
import type { FieldInfo, KnowledgeSource, PendingCapture } from '@/storage/schema';

const settings = defaultSettings('gemini');
const page = { title: 'Apply', hostname: 'jobs.example.com', path: '/apply', lang: 'en' };

function captureFor(pageText: string, field?: FieldInfo): PendingCapture {
  return {
    id: 'c',
    createdAt: 0,
    mode: 'question',
    tabId: 1,
    windowId: 1,
    pageText,
    hiddenTextChars: 0,
    page,
    ...(field ? { field } : {}),
    candidates: [],
  };
}

const source = (kind: KnowledgeSource['kind'], enabled = true): KnowledgeSource => ({
  id: kind,
  kind,
  label: kind,
  text: 'x',
  chars: 1,
  importedAt: '',
  enabled,
});

describe('cover letters', () => {
  it('spots cover letter questions', () => {
    for (const q of [
      'Cover letter',
      'Please attach or paste your covering letter',
      'Motivation letter (optional)',
      'Letter of interest',
    ])
      expect(isCoverLetterQuestion(q), q).toBe(true);
    for (const q of ['Why do you want to join us?', 'Upload your resume', 'Letter grade'])
      expect(isCoverLetterQuestion(q), q).toBe(false);
  });

  it('builds the letter request from what the user filled in', () => {
    const full = letterQuestion({
      company: 'Acme',
      role: 'Backend Engineer',
      notes: 'I can start in two weeks',
      hasJob: true,
      hasSample: true,
    });
    expect(full).toContain('Write a cover letter for the Backend Engineer role at Acme.');
    expect(full).toContain('<job_context>');
    expect(full).toContain(`"${COVER_LETTER_LABEL}"`);
    expect(full).toContain('Dear Hiring Manager,');
    expect(full).toContain('The candidate also wants this in the letter: I can start in two weeks');

    const bare = letterQuestion({
      company: '',
      role: '',
      notes: ' ',
      hasJob: false,
      hasSample: false,
    });
    expect(bare).toContain('Write a cover letter for this job.');
    expect(bare).toContain('There is no job post');
    expect(bare).not.toContain(COVER_LETTER_LABEL);
    expect(bare).not.toContain('also wants');
    expect(
      letterQuestion({ company: 'Acme', role: '', notes: '', hasJob: false, hasSample: false }),
    ).toContain('a role at Acme');
  });

  it('gives cover letter fields a letter-sized length, and honors an explicit length', () => {
    const field: FieldInfo = {
      targetId: 'f',
      kind: 'textarea',
      label: 'Cover letter',
      confidence: 'below',
    };
    const c = captureFor('Cover letter', field);
    const text = buildUserText({
      capture: c,
      settings,
      limits: parseLimits(c.pageText, field),
      today: '2026-09-26',
    });
    expect(text).toContain(`length: ${LETTER_LENGTHS.standard.guide}`);

    // A stated limit wins over the letter default.
    const limited = captureFor('Cover letter (max 1000 characters)', field);
    const limitedText = buildUserText({
      capture: limited,
      settings,
      limits: parseLimits(limited.pageText, field),
      today: '2026-09-26',
    });
    expect(limitedText).not.toContain(LETTER_LENGTHS.standard.guide);

    const other = captureFor('Why do you want to join us?', { ...field, label: 'Why us' });
    expect(
      buildUserText({
        capture: other,
        settings,
        limits: parseLimits(other.pageText),
        today: '2026-09-26',
      }),
    ).toContain('length: about 120 words');

    const override = buildUserText({
      capture: c,
      settings,
      limits: { maxChars: 4000, explicitChars: false },
      today: '2026-09-26',
      length: 'LETTER OVERRIDE',
    });
    expect(override).toContain('length: LETTER OVERRIDE;');
  });

  it('asks Fill form for a full letter in cover letter fields', () => {
    const field: FieldInfo = {
      targetId: 'f',
      kind: 'textarea',
      label: 'Cover letter',
      confidence: 'below',
    };
    const text = batchUserText({
      fields: [{ field, question: 'Cover letter', limits: parseLimits('Cover letter', field) }],
      page,
      settings,
      today: '2026-09-26',
    });
    expect(text).toContain('cover letter fields, which get a full cover letter of about 300 words');
  });

  it('finds the saved letter and shows it in the panel header', () => {
    expect(findCoverLetter([source('resume'), source('cover-letter')])?.kind).toBe('cover-letter');
    expect(findCoverLetter([source('resume')])).toBeUndefined();
    expect(
      profileStatus({
        profile: { fullName: 'J' },
        sources: [source('resume'), source('cover-letter')],
      }),
    ).toBe('Profile ready: resume + cover letter');
    expect(
      profileStatus({
        profile: { fullName: 'J' },
        sources: [source('resume'), source('cover-letter', false)],
      }),
    ).toBe('Profile ready: resume');
  });
});
