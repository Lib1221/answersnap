import type { KnowledgeSource } from '@/storage/schema';

// Cover letters. The candidate's own letter is kept as a source of kind 'cover-letter', so every
// answer can draw on its facts and voice; the Letter tab drafts a new letter for the job in front.

export const COVER_LETTER_LABEL = 'My cover letter';

export type LetterLength = 'short' | 'standard' | 'long';
export const LETTER_LENGTHS: Record<LetterLength, { label: string; guide: string }> = {
  short: { label: 'Short', guide: 'a cover letter of about 200 words in 3 short paragraphs' },
  standard: {
    label: 'Standard',
    guide: 'a cover letter of about 300 words in 3 or 4 short paragraphs',
  },
  long: { label: 'Long', guide: 'a cover letter of about 400 words in 4 or 5 paragraphs' },
};
/** A 400-word letter runs about 2,500 characters; leave room so Insert isn't blocked. */
export const LETTER_MAX_CHARS = 4000;
/** Output tokens for a letter: the answer default (1,024) is sized for form answers. */
export const LETTER_MAX_TOKENS = 2048;

const COVER_LETTER_QUESTION =
  /\bcover(?:ing)? letter\b|\bmotivation(?:al)? letter\b|\bletter of (?:motivation|interest|intent)\b/i;

/** "Cover letter", "Motivation letter", "Letter of interest" fields get a letter-sized answer. */
export function isCoverLetterQuestion(text: string): boolean {
  return COVER_LETTER_QUESTION.test(text);
}

export function findCoverLetter(sources: KnowledgeSource[]): KnowledgeSource | undefined {
  return sources.find((s) => s.kind === 'cover-letter');
}

/** The request the Letter tab sends as the question. */
export function letterQuestion(opts: {
  company: string;
  role: string;
  notes: string;
  hasJob: boolean;
  hasSample: boolean;
}): string {
  const company = opts.company.trim();
  const role = opts.role.trim();
  const target =
    role && company
      ? `the ${role} role at ${company}`
      : role
        ? `the ${role} role`
        : company
          ? `a role at ${company}`
          : 'this job';
  return [
    `Write a cover letter for ${target}.`,
    opts.hasJob
      ? "Connect the candidate's most relevant experience to what the job post in <job_context> asks for, and name the company and the role."
      : "There is no job post, so tailor it to the role and company named here and the candidate's strongest experience.",
    opts.hasSample
      ? `The source labeled "${COVER_LETTER_LABEL}" is a cover letter the candidate wrote. Keep its voice and the stories it chose, and rewrite it for this job instead of copying it.`
      : '',
    'Format: a greeting line (the hiring manager\'s name if the job post gives one, otherwise "Dear Hiring Manager,"), the body paragraphs, then a sign-off line and the candidate\'s name. Open with a specific reason or result, not "I am writing to express my interest". Plain text with a blank line between paragraphs. The greeting and sign-off are part of the letter; the style rules apply to everything in between.',
    opts.notes.trim() ? `The candidate also wants this in the letter: ${opts.notes.trim()}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}
