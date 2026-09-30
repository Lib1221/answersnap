import { describe, expect, it } from 'vitest';
import { newEntry, newResume, newSection } from '@/kb/resume/model';
import {
  datedWork,
  screen,
  skillOf,
  yearsOption,
  yearsWith,
  type ScreeningContext,
} from '@/kb/screening';
import type { FieldInfo } from '@/storage/schema';

// Screening questions answered from the candidate's own data (fictional Jamie Park).

const resume = newResume({
  sections: [
    newSection('experience', {
      entries: [
        newEntry({
          title: 'Senior Backend Engineer',
          subtitle: 'Ledgerly',
          start: '2022-03',
          present: true,
          description: '- Built a Django REST API in Python.\n- Ran services on Kubernetes.',
        }),
        newEntry({
          title: 'Backend Engineer',
          subtitle: 'Brightpath',
          start: '2020-09',
          end: '2022-02',
          description: '- Wrote ETL pipelines in Python and pandas.',
        }),
      ],
    }),
    newSection('volunteering', {
      entries: [
        newEntry({
          title: 'Mentor',
          subtitle: 'Data Science for Everyone',
          start: '2021-01',
          end: '2021-12',
          description: '- Taught Python to beginners.',
        }),
      ],
    }),
  ],
});
const NOW = new Date('2026-09-30T12:00:00Z');
const work = datedWork(resume, null, NOW);
const ctx: ScreeningContext = {
  work,
  knownText: 'Python, Django, Kubernetes, pandas, PostgreSQL',
  degrees: ['BSc Computer Science, University of Porto'],
  saved: { workAuthorization: 'Authorized to work in Portugal (EU)', needsSponsorship: 'No' },
};
const field = (label: string, extra: Partial<FieldInfo> = {}): FieldInfo => ({
  targetId: 'f1',
  kind: 'input',
  confidence: 'inside',
  label,
  ...extra,
});
const yesNo = (label: string) => field(label, { kind: 'radio-group', options: ['Yes', 'No'] });

describe('years with a skill, counted honestly', () => {
  it('counts only the jobs that name the skill, overlaps once, rounded down', () => {
    // Python: Brightpath 2020-09 to 2022-02 and Ledgerly 2022-03 to now, with the 2021
    // volunteering inside them: 6 years 1 month.
    expect(yearsWith(work, 'Python')).toMatchObject({ years: 6, months: 73 });
    // Kubernetes: Ledgerly only, 4 years 7 months.
    expect(yearsWith(work, 'Kubernetes').years).toBe(4);
    expect(yearsWith(work, 'Rust')).toMatchObject({ years: 0, used: [] });
    expect(yearsWith(work, null).years).toBe(6);
  });

  it('reads the skill out of the question', () => {
    expect(skillOf('How many years of work experience do you have with Python?')).toBe('Python');
    expect(
      skillOf('How many years of Software Development experience do you currently have?'),
    ).toBe('Software Development');
    expect(skillOf('How many years of work experience do you have?')).toBeNull();
  });

  it('picks the dropdown range that holds the number', () => {
    expect(yearsOption(4, ['Less than 1 year', '1-3 years', '3-5 years', '5+ years'])).toBe(
      '3-5 years',
    );
    expect(yearsOption(7, ['0-2', '3-5', '5+'])).toBe('5+');
    expect(yearsOption(0, ['Less than 1 year', '1-3 years'])).toBe('Less than 1 year');
  });
});

describe('sorting screening questions', () => {
  it('answers years with a skill from the dated jobs, and says what it counted', () => {
    const s = screen(field('How many years of work experience do you have with Kubernetes?'), ctx);
    expect(s).toMatchObject({ lane: 'rule', answer: '4' });
    expect(s.lane === 'rule' && s.note).toContain('Senior Backend Engineer, Ledgerly');
    // Never the job's minimum for a skill the jobs don't show.
    expect(screen(field('How many years of experience do you have with Rust?'), ctx)).toMatchObject(
      { lane: 'you' },
    );
  });

  it('answers "Do you have experience with X?" only with evidence', () => {
    expect(screen(yesNo('Do you have experience with PostgreSQL?'), ctx)).toMatchObject({
      lane: 'rule',
      answer: 'Yes',
    });
    expect(screen(yesNo('Do you have experience with Terraform?'), ctx)).toMatchObject({
      lane: 'you',
      locked: false,
    });
  });

  it('checks a degree against the resume', () => {
    expect(
      screen(yesNo("Have you completed the following level of education: Bachelor's Degree?"), ctx),
    ).toMatchObject({ lane: 'rule', answer: 'Yes' });
    expect(
      screen(yesNo("Have you completed the following level of education: Master's Degree?"), ctx),
    ).toMatchObject({ lane: 'you' });
  });

  it('leaves authorization and sponsorship to the candidate, with the saved answer', () => {
    const auth = screen(yesNo('Are you legally authorized to work in the United States?'), ctx);
    expect(auth).toMatchObject({ lane: 'you', locked: false });
    expect(auth.lane === 'you' && auth.note).toContain('Authorized to work in Portugal');
    expect(
      screen(yesNo('Will you now or in the future require sponsorship for a visa?'), ctx),
    ).toMatchObject({ lane: 'you' });
  });

  it('never touches self-identification, consents, records, or following the company', () => {
    for (const f of [
      field('Gender', { kind: 'select', options: ['Male', 'Female', 'Decline to self-identify'] }),
      field('Are you a protected veteran?', { kind: 'select', options: ['Yes', 'No'] }),
      field('Disability status', { kind: 'radio-group', options: ['Yes', 'No'] }),
      field('I certify that the information provided is true', {
        kind: 'checkbox-group',
        options: ['I agree'],
      }),
      yesNo('Have you ever been convicted of a felony?'),
      yesNo('Are you willing to undergo a background check?'),
      field('What is your current salary?'),
      field('Follow Northwind to stay up to date with their page.', {
        kind: 'checkbox-group',
        domId: 'follow-company-checkbox',
      }),
    ])
      expect(screen(f, ctx), f.label).toMatchObject({ lane: 'you', locked: true });
  });

  it('takes a question from its own label, not the question above it', () => {
    const why = field('Why do you want to work at Northwind?', {
      kind: 'textarea',
      section: 'Are you legally authorized to work in the United States?',
    });
    expect(screen(why, ctx)).toEqual({ lane: 'model' });
    const race = field('Race', {
      kind: 'select',
      options: ['Asian', 'Black', 'White', 'Decline'],
      section: 'Voluntary Self-Identification',
    });
    expect(screen(race, ctx)).toMatchObject({ lane: 'you', locked: true });
  });

  it('sends everything else to the model', () => {
    expect(
      screen(field('Why do you want to work at Northwind?', { kind: 'textarea' }), ctx),
    ).toEqual({
      lane: 'model',
    });
    expect(screen(field('Mobile phone number'), ctx)).toEqual({ lane: 'model' });
  });
});
