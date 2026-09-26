import { describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import {
  buildBlocks,
  levelStyle,
  listLayout,
  paginate,
  type Block,
} from '@/entrypoints/resume/doc/blocks';
import { formatDates, formatMonth, pdfTitle, toMonthYear } from '@/kb/resume/format';
import { newEntry, newResume, newSection, ResumeSchema } from '@/kb/resume/model';
import {
  addMyTemplate,
  applyMyTemplate,
  deleteMyTemplate,
  duplicateResume,
  getMyTemplates,
  getResumes,
  resumeFromProfile,
  saveResume,
} from '@/kb/resume/store';
import { applyTemplate, TEMPLATES } from '@/kb/resume/templates';
import { emptyProfile } from '@/kb/profileSchema';
import { ApplicantSchema } from '@/kb/applicant';
import { applyImport, buildExport, describeImport, parseImport } from '@/storage/exportImport';

describe('resume dates', () => {
  it('formats months the FlowCV ways', () => {
    expect(formatMonth('2024-03', 'MM/YYYY')).toBe('03/2024');
    expect(formatMonth('2024-03', 'Mon YYYY')).toBe('Mar 2024');
    expect(formatMonth('2024-03', 'Month YYYY')).toBe('March 2024');
    expect(formatMonth('2024-03', 'YYYY-MM')).toBe('2024-03');
    expect(formatMonth('2024-03', 'YYYY')).toBe('2024');
    expect(formatMonth('2024', 'Mon YYYY')).toBe('2024');
    const e = newEntry({ start: '2021-03', present: true });
    expect(formatDates(e, { dateFormat: 'Mon YYYY', presentLabel: 'Present' })).toBe(
      'Mar 2021 – Present',
    );
    expect(
      formatDates(newEntry({ date: '2020-06' }), { dateFormat: 'MM/YYYY', presentLabel: '' }),
    ).toBe('06/2020');
  });

  it('reads loose dates from a profile', () => {
    expect(toMonthYear('2022-03')).toBe('2022-03');
    expect(toMonthYear('03/2022')).toBe('2022-03');
    expect(toMonthYear('Mar 2022')).toBe('2022-03');
    expect(toMonthYear('September 2021')).toBe('2021-09');
    expect(toMonthYear('2019')).toBe('2019');
    expect(toMonthYear('present')).toBe('');
    expect(pdfTitle('Jamie Park', '')).toBe('Jamie_Park_Resume');
  });
});

describe('templates', () => {
  it('are complete, valid presets that keep the page size', () => {
    expect(TEMPLATES).toHaveLength(8);
    for (const t of TEMPLATES) {
      const d = applyTemplate(t.id, { page: 'Letter' });
      expect(d.template).toBe(t.id);
      expect(d.page).toBe('Letter');
    }
    expect(new Set(TEMPLATES.map((t) => t.id)).size).toBe(8);
  });
});

describe('import from the profile', () => {
  it('maps every profile section without inventing anything', () => {
    const p = {
      ...emptyProfile(),
      fullName: 'Jamie Park',
      headline: 'Backend Engineer',
      email: 'jamie@example.com',
      summary: 'Backend engineer with 5 years of Python.',
      links: [{ label: 'GitHub', url: 'https://github.com/jamie' }],
      experience: [
        {
          company: 'Ledgerly',
          title: 'Senior Backend Engineer',
          start: '2022-03',
          end: 'present',
          location: 'Remote',
          bullets: ['Cut p95 latency from 900 ms to 240 ms.'],
          tech: [],
        },
      ],
      education: [
        {
          institution: 'University of Porto',
          degree: 'BSc',
          field: 'Computer Science',
          start: '2015',
          end: '2019',
        },
      ],
      skills: [{ name: 'Python', years: 5, evidence: null }],
      languages: [{ language: 'Portuguese', level: 'Native' }],
      certifications: [{ name: 'AWS Developer', issuer: 'Amazon', year: '2023' }],
      achievements: ['Hackathon winner'],
    };
    const r = resumeFromProfile(p, ApplicantSchema.parse({ phoneNumber: '1' }));
    expect(r.personal).toMatchObject({
      fullName: 'Jamie Park',
      jobTitle: 'Backend Engineer',
      email: 'jamie@example.com',
    });
    expect(r.personal.details).toEqual([
      { kind: 'github', label: 'GitHub', value: 'https://github.com/jamie' },
    ]);
    expect(r.sections.map((s) => s.type)).toEqual([
      'profile',
      'experience',
      'education',
      'skills',
      'languages',
      'certificates',
      'awards',
    ]);
    const job = r.sections[1]!.entries[0]!;
    expect(job).toMatchObject({
      title: 'Senior Backend Engineer',
      subtitle: 'Ledgerly',
      start: '2022-03',
      present: true,
      end: '',
      description: '- Cut p95 latency from 900 ms to 240 ms.',
    });
    expect(r.sections[2]!.entries[0]).toMatchObject({
      title: 'BSc, Computer Science',
      subtitle: 'University of Porto',
      start: '2015',
      end: '2019',
    });
    expect(r.sections[3]!.entries[0]).toMatchObject({ title: 'Python', info: '5 years' });
    expect(ResumeSchema.safeParse(r).success).toBe(true);
    // Duplicates get fresh ids everywhere.
    const copy = duplicateResume(r);
    expect(copy.id).not.toBe(r.id);
    expect(copy.sections[1]!.entries[0]!.id).not.toBe(job.id);
    expect(copy.name).toBe('My resume (copy)');
  });
});

describe('pagination', () => {
  const resume = newResume({
    sections: [
      newSection('profile', { text: 'Hello' }),
      newSection('experience', {
        entries: [1, 2, 3, 4].map((i) => newEntry({ title: `Job ${i}` })),
      }),
      newSection('skills', { column: 'side', entries: [newEntry({ title: 'Python' })] }),
      newSection('education', { hidden: true, entries: [newEntry({ title: 'Hidden degree' })] }),
    ],
  });

  it('builds blocks: header, text, one per entry with the heading on the first, hidden left out', () => {
    const blocks = buildBlocks(resume);
    expect(blocks.map((b) => b.kind)).toEqual([
      'header',
      'text',
      'entry',
      'entry',
      'entry',
      'entry',
      'list',
    ]);
    const entries = blocks.filter(
      (b): b is Extract<Block, { kind: 'entry' }> => b.kind === 'entry',
    );
    expect(entries.map((b) => b.withHeading)).toEqual([true, false, false, false]);
    // One column: everything in the main column.
    expect(blocks.filter((b) => b.kind !== 'header').every((b) => b.column === 'main')).toBe(true);
    const two = buildBlocks({ ...resume, design: { ...resume.design, columns: 'two' } });
    expect(two.find((b) => b.kind === 'list')!.column).toBe('side');
  });

  it('packs blocks onto pages without splitting, and drops top spacing on a new page', () => {
    const blocks = buildBlocks(resume);
    const heights = new Map(blocks.map((b) => [b.id, b.kind === 'header' ? 100 : 300]));
    const spacing = new Map(blocks.map((b) => [b.id, b.kind === 'header' ? 0 : 20]));
    const pages = paginate(blocks, heights, spacing, 1000, 100, false);
    // Page 1: header (100) + text (280, first) + 2 entries (300 each) = 980.
    expect(pages.map((p) => p.main.length)).toEqual([3, 3]);
    expect(pages[0]!.header).toBe(true);
    expect(pages[1]!.header).toBe(false);
  });

  it('packs the side column on its own', () => {
    const blocks = buildBlocks({
      ...resume,
      design: { ...resume.design, columns: 'two', header: 'side' },
    });
    const heights = new Map(blocks.map((b) => [b.id, 200]));
    const pages = paginate(blocks, heights, new Map(), 500, 0, true);
    expect(pages[0]!.side.map((b) => b.kind)).toEqual(['header', 'list']);
    expect(pages.reduce((n, p) => n + p.main.length, 0)).toBe(5);
  });
});

describe('resumes in backups', () => {
  it('exports and imports resumes; an older backup keeps the current ones', async () => {
    fakeBrowser.reset();
    const r = newResume({ name: 'Jamie Park' });
    r.personal.fullName = 'Jamie Park';
    await saveResume(r);
    const parsed = parseImport(JSON.stringify(await buildExport()));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(describeImport(parsed.data)).toContain('1 resume');

    await fakeBrowser.storage.local.clear();
    await applyImport(parsed.data);
    expect((await getResumes()).map((x) => x.personal.fullName)).toEqual(['Jamie Park']);

    const { resumes: _none, ...older } = parsed.data;
    await applyImport(older);
    expect(await getResumes()).toHaveLength(1);
  });
});

describe('section settings', () => {
  it('starts a section on a new page when asked, but never leaves page 1 empty', () => {
    const r = newResume({
      sections: [
        newSection('profile', { text: 'Hello', breakBefore: true }),
        newSection('experience', { entries: [newEntry({ title: 'Job' })] }),
        newSection('education', {
          breakBefore: true,
          entries: [newEntry({ title: 'Degree' }), newEntry({ title: 'Course' })],
        }),
      ],
    });
    const blocks = buildBlocks(r);
    const heights = new Map(blocks.map((b) => [b.id, 50]));
    const pages = paginate(blocks, heights, new Map(), 1000, 100, false);
    expect(pages.map((p) => p.main.map((b) => b.id.split(':')[0]))).toEqual([
      [r.sections[0]!.id, r.sections[1]!.id],
      [r.sections[2]!.id, r.sections[2]!.id],
    ]);
  });

  it('lets a list section override the design, and packs every list layout as one block', () => {
    const d = newResume().design;
    const s = newSection('skills', { entries: [newEntry({ title: 'Python', level: 4 })] });
    expect(listLayout(s, d)).toBe(d.skillsLayout);
    expect(listLayout({ ...s, layout: 'bubbles' }, d)).toBe('bubbles');
    expect(levelStyle({ ...s, levelStyle: 'text' }, d)).toBe('text');
    const r = newResume({ sections: [{ ...s, layout: 'list' }] });
    expect(buildBlocks(r).map((b) => b.kind)).toEqual(['header', 'list']);
  });
});

describe('my templates', () => {
  it('saves a design by name, replaces the same name, applies with the page and language kept', async () => {
    fakeBrowser.reset();
    const design = applyTemplate('sidebar');
    const a = await addMyTemplate('  Italian CV ', { ...design, accent: '#aa0000' });
    expect(a.name).toBe('Italian CV');
    const b = await addMyTemplate('italian cv', { ...design, accent: '#00aa00' });
    expect(b.id).toBe(a.id);
    const list = await getMyTemplates();
    expect(list).toHaveLength(1);
    expect(list[0]!.design.accent).toBe('#00aa00');

    const applied = applyMyTemplate(list[0]!, { page: 'Letter', docLang: 'it' });
    expect(applied).toMatchObject({
      columns: design.columns,
      accent: '#00aa00',
      page: 'Letter',
      docLang: 'it',
      template: `my:${a.id}`,
    });
    await deleteMyTemplate(a.id);
    expect(await getMyTemplates()).toEqual([]);
  });

  it('keeps the page size and language when a built-in template is picked', () => {
    expect(applyTemplate('classic', { page: 'Letter', docLang: 'fr' })).toMatchObject({
      page: 'Letter',
      docLang: 'fr',
      template: 'classic',
    });
  });
});

describe('more date formats, year-only dates, and level words', () => {
  it('formats MM.YYYY and YYYY/MM', () => {
    expect(formatMonth('2024-03', 'MM.YYYY')).toBe('03.2024');
    expect(formatMonth('2024-03', 'YYYY/MM')).toBe('2024/03');
    expect(formatMonth('2024-03', 'MM.YYYY', 'it')).toBe('03.2024');
    expect(
      formatDates(newEntry({ start: '2019-10', end: '2022-07' }), {
        dateFormat: 'MM.YYYY',
        presentLabel: '',
        docLang: 'it',
      }),
    ).toBe('10.2019 – 07.2022');
    expect(
      formatDates(newEntry({ start: '2019-10', present: true }), {
        dateFormat: 'YYYY/MM',
        presentLabel: '',
      }),
    ).toBe('2019/10 – Present');
  });

  it('shows a year-only date as the bare year in every format', async () => {
    const { DesignSchema } = await import('@/kb/resume/model');
    const formats = DesignSchema.shape.dateFormat.unwrap().options;
    expect(formats).toEqual(expect.arrayContaining(['MM.YYYY', 'YYYY/MM']));
    for (const f of formats) {
      expect(formatMonth('2016', f)).toBe('2016');
      expect(
        formatDates(newEntry({ start: '2016', end: '2020' }), { dateFormat: f, presentLabel: '' }),
      ).toBe('2016 – 2020');
    }
    // A year-only start with a month end mixes cleanly.
    expect(
      formatDates(newEntry({ start: '2016', end: '2020-06' }), {
        dateFormat: 'MM.YYYY',
        presentLabel: '',
      }),
    ).toBe('2016 – 06.2020');
  });

  it('keeps the default format and accepts the new ones', async () => {
    const { DesignSchema } = await import('@/kb/resume/model');
    expect(DesignSchema.parse({}).dateFormat).toBe('Mon YYYY');
    expect(DesignSchema.parse({ dateFormat: 'MM.YYYY' }).dateFormat).toBe('MM.YYYY');
    expect(DesignSchema.parse({ dateFormat: 'YYYY/MM' }).dateFormat).toBe('YYYY/MM');
    expect(newEntry({ start: '2016' }).start).toBe('2016');
  });

  it('names levels with the skill or language scale in the resume language', async () => {
    const { levelWords } = await import('@/kb/resume/format');
    expect(levelWords('skills')).toEqual([
      'Beginner',
      'Amateur',
      'Competent',
      'Proficient',
      'Expert',
    ]);
    expect(levelWords('languages')[3]).toBe('Fluent');
    expect(levelWords('languages', 'it')[4]).toBe('Madrelingua');
    expect(levelWords('custom', 'de')[0]).toBe('Anfänger');
  });
});

describe('contact links', () => {
  const personalWith = (details: { kind: string; label: string; value: string }[]) =>
    ResumeSchema.parse({ id: 'r1', personal: { email: 'jamie@example.com', details } }).personal;

  it('links any web address, platform or other, shown without https://www. or a trailing slash', async () => {
    const { contactItems } = await import('@/entrypoints/resume/doc/contacts');
    const personal = personalWith([
      { kind: 'x', label: 'X (Twitter)', value: 'https://x.com/jamiepark/' },
      { kind: 'other', label: 'Blog', value: 'https://www.jamiepark.dev/' },
      { kind: 'orcid', label: 'ORCID', value: 'orcid.org/0000-0002-1825-0097' },
      { kind: 'other', label: 'GPA', value: '3.8' },
      { kind: 'skype', label: 'Skype', value: 'jamie.park' },
      { kind: 'dateOfBirth', label: 'Date of birth', value: '14.03.1998' },
      { kind: 'other', label: 'Script', value: 'javascript:alert(1)' },
    ]);
    expect(contactItems(personal, 'icons')).toEqual([
      { icon: 'email', text: 'jamie@example.com', href: 'mailto:jamie@example.com' },
      { icon: 'x', text: 'x.com/jamiepark', href: 'https://x.com/jamiepark/' },
      { icon: 'link', text: 'jamiepark.dev', href: 'https://www.jamiepark.dev/' },
      {
        icon: 'orcid',
        text: 'orcid.org/0000-0002-1825-0097',
        href: 'https://orcid.org/0000-0002-1825-0097',
      },
      { icon: 'other', text: '3.8', href: null },
      { icon: 'skype', text: 'jamie.park', href: null },
      { icon: 'dateOfBirth', text: '14.03.1998', href: null },
      { icon: 'other', text: 'javascript:alert(1)', href: null },
    ]);
    // Without icons, a label says what a line is, except on a platform's own address.
    expect(contactItems(personal, 'bullets').map((c) => c.text)).toEqual([
      'jamie@example.com',
      'x.com/jamiepark',
      'Blog: jamiepark.dev',
      'orcid.org/0000-0002-1825-0097',
      'GPA: 3.8',
      'Skype: jamie.park',
      'Date of birth: 14.03.1998',
      'Script: javascript:alert(1)',
    ]);
  });

  it('follows the order of the details', async () => {
    const { contactItems } = await import('@/entrypoints/resume/doc/contacts');
    const personal = personalWith([
      { kind: 'github', label: 'GitHub', value: 'github.com/jamie' },
      { kind: 'linkedin', label: 'LinkedIn', value: 'linkedin.com/in/jamie' },
    ]);
    expect(contactItems(personal, 'icons').map((c) => c.icon)).toEqual([
      'email',
      'github',
      'linkedin',
    ]);
  });

  it('reads a detail kind it does not know as other, keeping its label', () => {
    const personal = personalWith([{ kind: 'mastodon', label: 'Mastodon', value: '@jamie' }]);
    expect(personal.details).toEqual([{ kind: 'other', label: 'Mastodon', value: '@jamie' }]);
  });

  it('maps profile links to their platform', () => {
    const links = [
      ['ORCID', 'https://orcid.org/0000-0002-1825-0097'],
      ['Twitter', 'https://twitter.com/jamiepark'],
      ['X', 'https://x.com/jamiepark'],
      ['Scholar', 'https://scholar.google.com/citations?user=abc'],
      ['Blog', 'https://medium.com/@jamiepark'],
      ['CV', 'https://dropbox.com/s/cv'],
      ['Site', 'https://jamiepark.dev'],
    ].map(([label, url]) => ({ label: label!, url: url! }));
    const r = resumeFromProfile({ ...emptyProfile(), links });
    expect(r.personal.details.map((x) => x.kind)).toEqual([
      'orcid',
      'x',
      'x',
      'scholar',
      'medium',
      'website',
      'website',
    ]);
  });
});

describe('review fixes: pages break between pieces', () => {
  it('splits rich text into paragraphs and list items, numbering each item', async () => {
    const { splitRich } = await import('@/entrypoints/resume/doc/blocks');
    expect(splitRich('Intro line\nmore\n\n- one\n- two\n\n3. third\n4. fourth\nEnd')).toEqual([
      { text: 'Intro line\nmore', kind: 'p' },
      { text: '- one', kind: 'li' },
      { text: '- two', kind: 'li' },
      { text: '3. third', kind: 'li' },
      { text: '4. fourth', kind: 'li' },
      { text: 'End', kind: 'p' },
    ]);
    // "1." typed on every line still counts up, like the renderer.
    expect(splitRich('1. a\n1. b\n1. c').map((u) => u.text)).toEqual(['1. a', '2. b', '3. c']);
  });

  it('keeps an entry title with its first bullet and lets the rest break', () => {
    const r = newResume({
      sections: [
        newSection('experience', {
          entries: [newEntry({ title: 'Engineer', description: '- a\n- b\n\nClosing words.' })],
        }),
      ],
    });
    const blocks = buildBlocks(r).filter((b) => b.kind !== 'header');
    expect(blocks.map((b) => b.kind)).toEqual(['entry', 'more', 'more']);
    expect(blocks[0]).toMatchObject({ withHeading: true, desc: '- a' });
    expect(blocks[1]).toMatchObject({ text: '- b', join: 'li', last: false });
    expect(blocks[2]).toMatchObject({ text: 'Closing words.', join: 'p', last: true });
  });

  it('breaks long lists between rows, and shows a declaration that only has a signature', () => {
    const skills = Array.from({ length: 5 }, (_, i) => newEntry({ title: `Skill ${i}` }));
    const r = newResume({
      sections: [
        newSection('skills', { layout: 'grid', gridColumns: 2, entries: skills }),
        newSection('declaration', {
          signature: { name: 'Jamie Park', place: 'Lisbon', date: '' },
        }),
      ],
    });
    const blocks = buildBlocks(r).filter((b) => b.kind !== 'header');
    const lists = blocks.filter((b) => b.kind === 'list');
    expect(lists.map((b) => (b.kind === 'list' ? b.entries.length : 0))).toEqual([2, 2, 1]);
    expect(lists.map((b) => b.withHeading)).toEqual([true, false, false]);
    expect(blocks.at(-1)).toMatchObject({ kind: 'text', text: '', last: true });
  });

  it('moves a block that does not fit under the header to page 2', () => {
    const r = newResume({
      sections: [newSection('profile', { text: 'Long profile' })],
    });
    const blocks = buildBlocks(r);
    const heights = new Map(blocks.map((b) => [b.id, b.kind === 'header' ? 300 : 800]));
    const pages = paginate(blocks, heights, new Map(), 1000, 300, false);
    expect(pages.map((p) => p.main.length)).toEqual([0, 1]);
  });
});

describe('review fixes: storage and files', () => {
  it('keeps only data URL photos, so a backup cannot make the page load a web address', () => {
    const parse = (photo: string) => newResume({ personal: { ...newResume().personal, photo } });
    expect(
      ResumeSchema.parse({ ...parse(''), personal: { photo: 'https://x.example/p.gif' } }).personal
        .photo,
    ).toBe('');
    const ok = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';
    expect(ResumeSchema.parse({ ...parse(''), personal: { photo: ok } }).personal.photo).toBe(ok);
  });

  it('autosave never re-creates a resume deleted elsewhere', async () => {
    fakeBrowser.reset();
    const r = newResume({ name: 'Gone' });
    expect(await saveResume(r, { create: false })).toBeNull();
    expect(await getResumes()).toEqual([]);
    expect(await saveResume(r)).not.toBeNull();
    expect(await getResumes()).toHaveLength(1);
  });

  it('keeps accents and vowel signs in the PDF file name', () => {
    expect(pdfTitle('प्रिया शर्मा', '')).toBe('प्रिया_शर्मा_Resume');
    expect(pdfTitle('Hélène Dupont', '')).toBe('Hélène_Dupont_Resume');
  });
});
