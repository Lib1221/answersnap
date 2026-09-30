import { describe, expect, it } from 'vitest';
import { atsFindings, plainFromRichLines, resumePlainText } from '@/entrypoints/resume/doc/ats';
import { newEntry, newResume, newSection, type Resume } from '@/kb/resume/model';
import { applyTemplate } from '@/kb/resume/templates';

// "ATS preview": what a parser reads, and what it would miss (Jamie Park).

function jamie(): Resume {
  const r = newResume({
    design: applyTemplate('professional', {}),
    sections: [
      newSection('profile', { text: 'Backend engineer building **Python** payment APIs.' }),
      newSection('experience', {
        entries: [
          newEntry({
            title: 'Backend Engineer',
            subtitle: 'Ledgerly',
            start: '2022-03',
            present: true,
            city: 'Lisbon',
            description: '- Built a Django REST API handling **2 million** requests per day.',
          }),
        ],
      }),
      newSection('skills', {
        entries: [newEntry({ title: 'Python' }), newEntry({ title: 'Django' })],
      }),
    ],
  });
  Object.assign(r.personal, {
    fullName: 'Jamie Park',
    jobTitle: 'Backend Engineer',
    email: 'jamie.park@example.com',
    phone: '+351 912 345 678',
  });
  return r;
}

describe('what a parser reads', () => {
  it('writes the resume as plain text in page order, marks taken out', () => {
    const text = resumePlainText(jamie());
    expect(text.split('\n').slice(0, 3)).toEqual([
      'Jamie Park',
      'Backend Engineer',
      'jamie.park@example.com | +351 912 345 678',
    ]);
    expect(text).toContain('PROFILE\nBackend engineer building Python payment APIs.');
    expect(text).toContain('Backend Engineer, Ledgerly   03/2022 – Present | Lisbon');
    expect(text).toContain('Built a Django REST API handling 2 million requests per day.');
    expect(text).not.toContain('**');
  });

  it('reads a downloaded PDF as plain text', () => {
    expect(
      plainFromRichLines(
        '**Backend Engineer,** *Ledgerly* || 03/2022 – Present\n- Built **2 million** things\n[page 2]\n[GitHub](https://github.com/jamie)',
      ),
    ).toBe(
      'Backend Engineer, Ledgerly   03/2022 – Present\n- Built 2 million things\n--- page 2 ---\nGitHub',
    );
  });
});

describe('what a parser would miss', () => {
  it('passes a clean one-column resume', () => {
    const r = jamie();
    expect(atsFindings(r, resumePlainText(r)).filter((f) => f.level === 'warn')).toEqual([]);
  });

  it('flags missing contacts, odd headings, undated jobs, spaced letters, named links, and columns', () => {
    const r = jamie();
    r.personal.email = '';
    r.personal.phone = '';
    r.sections[1]!.title = 'Where I Shipped Things';
    r.sections[1]!.entries[0]!.start = '';
    r.sections[1]!.entries[0]!.present = false;
    r.design.headingSpacing = 0.15;
    r.design.columns = 'two';
    r.personal.details = [
      {
        kind: 'linkedin',
        label: 'LinkedIn',
        value: 'https://www.linkedin.com/in/jamie',
        display: 'Linkedin',
      },
    ];
    const warns = atsFindings(r, resumePlainText(r))
      .filter((f) => f.level === 'warn')
      .map((f) => f.text);
    expect(warns).toEqual([
      expect.stringContaining('No email address'),
      'No phone number in the text.',
      expect.stringContaining('"Where I Shipped Things" isn\'t a heading parsers know'),
      expect.stringContaining('No dates on Backend Engineer'),
      expect.stringContaining('Heading letters are spaced far apart'),
      expect.stringContaining('"Linkedin" shows a name, not the address'),
      expect.stringContaining('Two columns'),
    ]);
  });

  it("lists a tailored copy's job keywords the text doesn't hold", () => {
    const r = jamie();
    r.tailoring = {
      sourceResumeId: 'm',
      applicationId: null,
      job: {
        url: '',
        hostname: 'x',
        title: '',
        company: '',
        location: '',
        workplace: '',
        text: 'x'.repeat(100),
      },
      keywords: [
        { term: 'Python', aliases: [], importance: 'must' },
        { term: 'Kubernetes', aliases: [], importance: 'must' },
      ],
      eligibility: [],
      scoreBefore: 0,
      assumed: [],
      trimmed: [],
      createdAt: '',
    };
    expect(atsFindings(r, resumePlainText(r)).at(-1)).toEqual({
      level: 'warn',
      text: "Not in the text: Kubernetes. A recruiter's keyword search won't find them.",
    });
  });
});
