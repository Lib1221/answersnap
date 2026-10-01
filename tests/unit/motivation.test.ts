import { describe, expect, it } from 'vitest';
import {
  countWords,
  letterLimitFrom,
  motivationQuestion,
  runMotivationLetter,
} from '@/llm/motivation';
import type { Requirements } from '@/llm/requirements';
import type { CompleteRequest, LlmProvider } from '@/llm/types';
import { SettingsSchema } from '@/storage/schema';

// The Study tab's motivation letter: the call's limit, the applicant's own reasons, no invention.

const reqs = (details: string, name = 'Motivation letter'): Requirements => ({
  program: 'MSc Data Science',
  institution: 'University of Padua',
  deadlines: [],
  eligibility: [],
  documents: [{ name, details, required: true }],
  language: [],
  fees: [],
  steps: [],
  warnings: [],
});

const input = {
  program: 'MSc Data Science',
  institution: 'University of Padua',
  wordLimit: 300,
  why: 'The statistical learning track and the lab on health data.',
  goals: '',
};

const reply = (answer: string) => ({
  text: `<question>q</question>\n<type>long_text</type>\n<answer>${answer}</answer>\n<missing></missing>\n<notes></notes>`,
  stopReason: 'end_turn',
  usage: { inputTokens: 0, cacheWriteTokens: 0, cacheReadTokens: 0, outputTokens: 0 },
});
const textOf = (r: CompleteRequest) => (r.messages[0]!.content[0] as { text: string }).text;

describe("the call's length limit", () => {
  it('reads words, characters, and pages from the motivation letter document', () => {
    expect(letterLimitFrom(reqs('PDF, max 500 words'))).toBe(500);
    expect(letterLimitFrom(reqs('Up to 3,000 characters, in English'))).toBe(500);
    expect(letterLimitFrom(reqs('One page, PDF'))).toBe(450);
    expect(letterLimitFrom(reqs('Max 2 pages', 'Statement of purpose'))).toBe(900);
    expect(letterLimitFrom(reqs('PDF only'))).toBeNull();
    expect(letterLimitFrom(reqs('max 500 words', 'Transcript of records'))).toBeNull();
    expect(letterLimitFrom(null)).toBeNull();
  });
});

describe('the request', () => {
  it("uses the applicant's own reason, and asks for a blank where they gave none", () => {
    const q = motivationQuestion(input);
    expect(q).toContain('Write a motivation letter for MSc Data Science at University of Padua.');
    expect(q).toContain('The statistical learning track and the lab on health data.');
    expect(q).toContain('[[what you want to do after the programme]]');
    expect(q).not.toContain('[[why you chose this programme]]');
    expect(q).toContain('about 270 words and never more than 300 words');
  });
});

describe('writing the letter', () => {
  const settings = SettingsSchema.parse({ fillGaps: true });
  const run = (provider: LlmProvider) =>
    runMotivationLetter({
      provider,
      model: 'm',
      settings,
      data: { profile: null, standardAnswers: null, sources: [] },
      input,
      pageText: 'MSc Data Science. Tracks: statistical learning. Letter: max 300 words.',
      hostname: 'unipd.example',
    });

  it('sticks to the profile whatever the setting, and lists the blanks to fill in', async () => {
    const requests: CompleteRequest[] = [];
    const provider = {
      complete: async (r: CompleteRequest) => {
        requests.push(r);
        return reply(
          'Dear Admissions Committee,\n\nAfterwards I want to [[what you want to do after the programme]].\n\nJamie Park',
        );
      },
    } as unknown as LlmProvider;
    const letter = await run(provider);
    expect(letter.missing).toEqual(['what you want to do after the programme']);
    expect(requests).toHaveLength(1);
    // "Answer confidently" is on in settings; the letter still gets the honest rules.
    expect(requests[0]!.system[0]!.text).toContain('come only from <candidate_profile>');
    // The page is context in the user turn, never a system block.
    expect(textOf(requests[0]!)).toContain('<job_context>');
    expect(requests[0]!.system.map((b) => b.text).join('\n')).not.toContain('statistical learning');
  });

  it('asks once more when the letter runs over the limit, and keeps the shorter one', async () => {
    const long = Array.from({ length: 340 }, (_, i) => `word${i}`).join(' ');
    const short = Array.from({ length: 250 }, (_, i) => `word${i}`).join(' ');
    const requests: CompleteRequest[] = [];
    const provider = {
      complete: async (r: CompleteRequest) => {
        requests.push(r);
        return reply(requests.length === 1 ? long : short);
      },
    } as unknown as LlmProvider;
    const letter = await run(provider);
    expect(requests).toHaveLength(2);
    expect(textOf(requests[1]!)).toContain('Your last draft had 340 words');
    expect(countWords(letter.text)).toBe(250);
  });
});
