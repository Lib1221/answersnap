import { describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { newEntry, newResume, newSection, ResumeSchema, type Resume } from '@/kb/resume/model';
import {
  addSkill,
  applyTailoring,
  endLike,
  experienceYears,
  joinUnits,
  nextTrim,
  outlineResume,
  regionMet,
  removeAssumed,
  restoreBold,
  resumeText,
  rewriteProblem,
  summarySeniority,
  termsOf,
  unheldSeniority,
  wrongRegionClaim,
  yearsMet,
  type TailorPatch,
} from '@/kb/resume/tailorApply';
import {
  containsKeyword,
  getTailorRequest,
  keepsNumbers,
  matchKeywords,
  normalizeForMatch,
  numbersIn,
  parseJobPost,
  saveTailorRequest,
  type JobPost,
} from '@/kb/resume/tailoring';
import { jobContextText, tailorRules, TailorOutputSchema } from '@/llm/tailor';

const JOB: JobPost = {
  url: 'https://www.linkedin.com/jobs/view/123/',
  hostname: 'www.linkedin.com',
  title: 'Backend Engineer',
  company: 'Acme',
  location: 'Remote',
  workplace: 'Remote',
  text: 'We need a backend engineer with Python, Django, PostgreSQL, Kubernetes and AWS. '.repeat(
    3,
  ),
};

function master(): Resume {
  const r = newResume({
    name: 'Master',
    master: true,
    sections: [
      newSection('profile', { text: 'Backend engineer with 5 years of Python.' }),
      newSection('experience', {
        entries: [
          newEntry({
            title: 'Senior Backend Engineer',
            subtitle: 'Ledgerly',
            start: '2022-03',
            present: true,
            description:
              '- Built a Django REST API handling **2 million** requests per day.\n- Cut p95 latency from 900 ms to 240 ms.\n- Mentored 3 engineers.',
          }),
          newEntry({
            title: 'Backend Engineer',
            subtitle: 'Brightpath',
            start: '2021-09',
            end: '2022-02',
            description: '- Wrote ETL pipelines in Python.\n- Maintained Flask services.',
          }),
        ],
      }),
      newSection('skills', {
        entries: [
          newEntry({
            title: 'Languages & Tools',
            description: '- Python, Django, Flask, PostgreSQL',
          }),
        ],
      }),
      newSection('projects', {
        entries: [
          newEntry({ title: 'Shift Planner', description: '- Vue app.\n- 300 weekly users.' }),
          newEntry({ title: 'Budget Bot', description: '- Telegram bot.' }),
          newEntry({ title: 'Recipe Site', description: '- Static site.' }),
        ],
      }),
    ],
  });
  r.personal.fullName = 'Jamie Park';
  r.personal.jobTitle = 'Backend Engineer';
  return r;
}

const PATCH = (m: Resume, over: Partial<TailorPatch> = {}): TailorPatch => {
  const o = outlineResume(m);
  const id = (title: string) =>
    [...o.entries.entries()].find(
      ([, ref]) =>
        m.sections.find((s) => s.id === ref.sectionId)?.entries.find((e) => e.id === ref.entryId)
          ?.title === title,
    )![0];
  return {
    job: { title: 'Backend Engineer', company: 'Acme', location: '', workplace: 'Remote' },
    keywords: [
      { term: 'Python', aliases: [], importance: 'must' },
      { term: 'Kubernetes', aliases: ['k8s'], importance: 'must' },
      { term: 'AWS', aliases: ['Amazon Web Services'], importance: 'nice' },
    ],
    eligibility: [],
    headline: 'Backend Engineer | Python & Django APIs',
    summary: 'Backend engineer building **Python** and Django APIs for payments.',
    entries: [
      {
        id: id('Senior Backend Engineer'),
        lines: [
          {
            from: `${id('Senior Backend Engineer')}.2`,
            text: 'Cut API p95 latency from 900 ms to 240 ms.',
          },
          {
            from: `${id('Senior Backend Engineer')}.1`,
            text: 'Built a Django REST API handling **2 million** requests per day.',
          },
        ],
      },
    ],
    order: [],
    hide: [],
    ...over,
  };
};

const ctx = (m: Resume, fillGaps = true) => ({
  job: JOB,
  applicationId: 'app1',
  knownText: resumeText(m),
  fillGaps,
  now: new Date('2026-09-29T10:00:00Z'),
});

describe('keyword matching', () => {
  it('keeps tech names and ignores punctuation', () => {
    const text = normalizeForMatch(
      'Built with Node.js, C++ and scikit-learn; REST APIs. CI/CD too.',
    );
    expect(containsKeyword(text, { term: 'Node.js', aliases: [] })).toBe(true);
    expect(containsKeyword(text, { term: 'C++', aliases: [] })).toBe(true);
    expect(containsKeyword(text, { term: 'Scikit-learn', aliases: [] })).toBe(true);
    expect(containsKeyword(text, { term: 'REST API', aliases: [] })).toBe(true);
    expect(containsKeyword(text, { term: 'CI/CD', aliases: [] })).toBe(true);
    expect(containsKeyword(text, { term: 'Java', aliases: [] })).toBe(false);
    expect(containsKeyword(text, { term: 'Kubernetes', aliases: ['C++'] })).toBe(true);
  });

  it('weighs must-haves 70% and nice-to-haves 30%', () => {
    const m = matchKeywords('Python and AWS', [
      { term: 'Python', aliases: [], importance: 'must' },
      { term: 'Kubernetes', aliases: [], importance: 'must' },
      { term: 'AWS', aliases: [], importance: 'nice' },
    ]);
    // Half the must-haves (0.7 x 0.5) and all the nice-to-haves (0.3 x 1).
    expect(m.score).toBe(65);
    expect([m.mustFound, m.mustTotal]).toEqual([1, 2]);
    expect(m.missing.map((k) => k.term)).toEqual(['Kubernetes']);
  });
});

describe('keyword matching, the hard cases', () => {
  const has = (text: string, term: string, aliases: string[] = []) =>
    containsKeyword(text, { term, aliases });

  it('matches short names only as written, and not inside compounds', () => {
    expect(has('Built services in Go and Python.', 'Go')).toBe(true);
    expect(has('Owned the go-to-market plan.', 'Go')).toBe(false);
    expect(has('Reported to C-level leaders.', 'C')).toBe(false);
    expect(has('Wrote firmware in C and C++.', 'C')).toBe(true);
    expect(has('Gave a swift reply to every ticket.', 'Swift')).toBe(false);
    expect(has('Shipped iOS apps in Swift.', 'Swift')).toBe(true);
  });

  it("doesn't count a longer name for a shorter one", () => {
    expect(has('Built mobile apps with React Native.', 'React')).toBe(false);
    expect(has('Built dashboards with React and React Native.', 'React')).toBe(true);
    expect(has('Wrote JavaScript for the frontend.', 'Java')).toBe(false);
  });

  it('matches spellings, plurals, and known equivalents', () => {
    expect(has('Set up CI / CD pipelines.', 'CI/CD')).toBe(true);
    expect(has('Set up a CICD pipeline.', 'CI/CD')).toBe(true);
    expect(has('Services in NodeJS.', 'Node.js')).toBe(true);
    expect(has('Maintained internal libraries.', 'library')).toBe(true);
    expect(has('Automated the review process.', 'processes')).toBe(true);
    expect(has('Deployed on K8s.', 'Kubernetes')).toBe(true);
    expect(has('Ran on Amazon Web Services.', 'AWS')).toBe(true);
    expect(has('Trained models with sklearn.', 'Scikit-learn')).toBe(true);
    expect(has('Designed RESTful APIs.', 'REST APIs')).toBe(true);
    // A slash can join a name or list two names.
    expect(has('Git / GitHub', 'Git')).toBe(true);
    expect(has('Git / GitHub', 'GitHub')).toBe(true);
  });
});

describe('number guard', () => {
  it('reads metrics and ignores digits inside names', () => {
    expect(numbersIn('on **80,000+** orders, ~12% better, 1.5x faster in 2022')).toEqual([
      '80000',
      '12',
      '1.5',
      '2022',
    ]);
    expect(numbersIn('AWS S3, EC2, K8s, Web3 and 3D')).toEqual([]);
    expect(keepsNumbers('Cut latency by 40%', 'Reduced API latency by 40%')).toBe(true);
    expect(keepsNumbers('Cut latency by 40%', 'Reduced API latency by 60%')).toBe(false);
    expect(keepsNumbers('Served 5,000 requests', 'Served 5000+ requests')).toBe(true);
  });
});

describe('job posts and requests', () => {
  it('validates and caps a job post from a page', () => {
    expect(parseJobPost({ hostname: 'x.com', text: 'too short' })).toBeNull();
    const job = parseJobPost({ ...JOB, text: `${'a'.repeat(30_000)}`, title: '  Engineer  ' });
    expect(job!.text.length).toBe(20_000);
    expect(job!.title).toBe('Engineer');
  });

  it('hands a request over through session storage, and forgets stale ones', async () => {
    fakeBrowser.reset();
    const req = await saveTailorRequest(JOB, 'app1', new Date('2026-09-29T10:00:00Z'));
    expect((await getTailorRequest(req.id, Date.parse('2026-09-29T10:05:00Z')))!.job.company).toBe(
      'Acme',
    );
    expect(await getTailorRequest(req.id, Date.parse('2026-09-29T20:00:00Z'))).toBeNull();
    expect(await getTailorRequest('../evil')).toBeNull();
  });

  it('puts the page facts before the post', () => {
    expect(jobContextText(JOB).split('\n').slice(0, 3)).toEqual([
      'Title: Backend Engineer',
      'Company: Acme',
      'Location: Remote',
    ]);
  });
});

describe('applying a tailoring', () => {
  it('rewrites and reorders lines, sets headline and summary, and leaves the master alone', () => {
    const m = master();
    const before = JSON.stringify(m);
    const { resume, rejected } = applyTailoring(m, PATCH(m), ctx(m));
    expect(JSON.stringify(m)).toBe(before);
    expect(resume.id).not.toBe(m.id);
    expect(resume.master).toBe(false);
    expect(resume.name).toBe('Acme – Backend Engineer');
    expect(resume.personal.jobTitle).toBe('Backend Engineer | Python & Django APIs');
    expect(resume.sections[0]!.text).toContain('**Python**');
    const senior = resume.sections[1]!.entries[0]!;
    expect(senior.description).toBe(
      '- Cut API p95 latency from 900 ms to 240 ms.\n- Built a Django REST API handling **2 million** requests per day.',
    );
    expect(rejected).toEqual([]);
    expect(resume.tailoring!.applicationId).toBe('app1');
    // The master has Python but neither Kubernetes nor AWS: 0.7 x 1/2.
    expect(resume.tailoring!.scoreBefore).toBe(35);
  });

  it('keeps the original line when a rewrite changes a number', () => {
    const m = master();
    const p = PATCH(m);
    p.entries[0]!.lines[0]!.text = 'Cut API p95 latency from 900 ms to 120 ms.';
    const { resume, rejected } = applyTailoring(m, p, ctx(m));
    expect(resume.sections[1]!.entries[0]!.description).toContain('900 ms to 240 ms');
    expect(rejected.some((x) => x.includes('changed a number'))).toBe(true);
  });

  it('new lines: flagged in confident mode, refused with numbers or in honest mode', () => {
    const m = master();
    const p = PATCH(m);
    const eid = p.entries[0]!.id;
    p.entries[0]!.lines.push(
      { from: null, text: 'Deployed services on Kubernetes.' },
      { from: null, text: 'Scaled to 10 million users.' },
    );
    const confident = applyTailoring(m, p, ctx(m, true));
    expect(confident.resume.sections[1]!.entries[0]!.description).toContain('Kubernetes');
    expect(confident.resume.sections[1]!.entries[0]!.description).not.toContain('10 million');
    expect(confident.resume.tailoring!.assumed.map((a) => a.kind)).toContain('line');
    const honest = applyTailoring(m, p, ctx(m, false));
    expect(honest.resume.sections[1]!.entries[0]!.description).not.toContain('Kubernetes');
    expect(honest.rejected).toContain(`${eid}: new line not allowed`);
  });

  it('a job keeps at least two lines, and lines never move between entries', () => {
    const m = master();
    const o = outlineResume(m);
    const [senior, other] = [...o.entries.keys()];
    const p = PATCH(m, {
      entries: [
        {
          id: senior!,
          lines: [
            { from: `${senior}.3`, text: 'Mentored 3 engineers.' },
            { from: `${other}.1`, text: 'Wrote ETL pipelines in Python.' },
          ],
        },
      ],
    });
    const { resume, rejected } = applyTailoring(m, p, ctx(m));
    const lines = resume.sections[1]!.entries[0]!.description.split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe('- Mentored 3 engineers.');
    expect(lines[1]).toContain('Django REST API');
    expect(rejected.some((x) => x.includes("isn't one of its lines"))).toBe(true);
  });

  it('reorders and hides projects only, and always keeps one', () => {
    const m = master();
    const o = outlineResume(m);
    const ids = [...o.entries.keys()];
    const exp = ids.slice(0, 2);
    const projects = ids.slice(3);
    const expSection = [...o.sections.keys()][1]!;
    const projSection = [...o.sections.keys()][3]!;
    const p = PATCH(m, {
      order: [
        { section: expSection, entries: [exp[1]!, exp[0]!] },
        { section: projSection, entries: [projects[2]!, projects[0]!] },
      ],
      hide: [exp[1]!, projects[1]!],
    });
    const { resume } = applyTailoring(m, p, ctx(m));
    expect(resume.sections[1]!.entries.map((e) => e.subtitle)).toEqual(['Ledgerly', 'Brightpath']);
    expect(resume.sections[1]!.entries.every((e) => !e.hidden)).toBe(true);
    expect(resume.sections[3]!.entries.map((e) => [e.title, e.hidden])).toEqual([
      ['Recipe Site', false],
      ['Shift Planner', false],
      ['Budget Bot', true],
    ]);
    expect(resume.tailoring!.trimmed).toEqual(['Left out for this job: Budget Bot']);
  });

  it('flags skills added to a skills line and keywords the data never mentions', () => {
    const m = master();
    const o = outlineResume(m);
    const skills = [...o.entries.keys()][2]!;
    const p = PATCH(m, {
      entries: [
        {
          id: skills,
          lines: [
            { from: `${skills}.1`, text: 'Python, Django, Kubernetes, AWS, PostgreSQL, Flask' },
          ],
        },
      ],
      summary: 'Backend engineer with 8 years of Python.',
    });
    const { resume } = applyTailoring(m, p, ctx(m));
    const assumed = resume.tailoring!.assumed;
    expect(assumed.filter((a) => a.kind === 'skill').map((a) => a.text)).toEqual([
      'Kubernetes',
      'AWS',
    ]);
    expect(assumed.some((a) => a.kind === 'claim' && a.text.includes('"8"'))).toBe(true);
    // Removing an added skill takes it out of its line and off the list.
    const k8s = assumed.find((a) => a.text === 'Kubernetes')!;
    const after = removeAssumed(resume, k8s);
    expect(after.sections[2]!.entries[0]!.description).toBe(
      '- Python, Django, AWS, PostgreSQL, Flask',
    );
    expect(after.tailoring!.assumed.some((a) => a.id === k8s.id)).toBe(false);
  });

  it('ignores unknown ids and keeps an entry whose lines were all refused', () => {
    const m = master();
    const p = PATCH(m, { entries: [{ id: 'E99', lines: [{ from: 'E99.1', text: 'x' }] }] });
    const { resume, rejected } = applyTailoring(m, p, ctx(m));
    expect(rejected).toEqual(['Unknown entry E99']);
    expect(resume.sections[1]!.entries[0]!.description).toBe(
      m.sections[1]!.entries[0]!.description,
    );
  });
});

describe('fitting the pages', () => {
  it('cuts projects past two, then the longest entry, and never jobs or skills', () => {
    const m = master();
    let r = applyTailoring(m, PATCH(m, { entries: [] }), ctx(m)).resume;
    const notes: string[] = [];
    for (let i = 0; i < 20; i++) {
      const t = nextTrim(r);
      if (!t) break;
      r = t.resume;
      notes.push(t.note);
    }
    expect(notes[0]).toBe('Left out to fit the pages: Recipe Site');
    expect(notes.some((n) => n.startsWith('Shortened Ledgerly'))).toBe(true);
    expect(r.sections[1]!.entries.every((e) => !e.hidden)).toBe(true);
    expect(r.sections[1]!.entries[0]!.description.split('\n')).toHaveLength(2);
    expect(r.sections[2]!.entries[0]!.description).toContain('Python');
    expect(r.sections[3]!.entries.filter((e) => !e.hidden)).toHaveLength(1);
  });

  it('rebuilds descriptions with paragraphs and renumbered lists', () => {
    expect(
      joinUnits([
        { kind: 'p', text: 'Intro' },
        { kind: 'li', text: '- a' },
        { kind: 'li', text: '3. b' },
        { kind: 'li', text: '1. c' },
        { kind: 'p', text: 'End' },
      ]),
    ).toBe('Intro\n\n- a\n1. b\n2. c\n\nEnd');
  });
});

describe('the tailoring prompt', () => {
  it('follows the confident setting and asks for JSON the schema accepts', () => {
    expect(tailorRules([], true)).toContain('at most 3 new lines');
    expect(tailorRules([], false)).toContain('Never add anything the data');
    expect(tailorRules(['No em dashes.'], true)).toContain('- No em dashes.');
    expect(TailorOutputSchema.safeParse(PATCH(master())).success).toBe(true);
  });
});

describe('claims a title line or summary may not raise', () => {
  it('flags a seniority the candidate never held', () => {
    const m = master();
    expect(unheldSeniority('Senior Backend Engineer | Python', m)).toEqual([]);
    expect(unheldSeniority('Lead Platform Engineer | Python', m)).toEqual(['lead']);
    const { resume } = applyTailoring(
      m,
      PATCH(m, { headline: 'Principal Backend Engineer | Python' }),
      ctx(m),
    );
    expect(resume.tailoring!.assumed.map((a) => a.text)).toContain(
      'Your title line says "principal", a level your own job titles don\'t show.',
    );
  });

  it('counts years from the dated jobs, overlaps once, and flags a summary that claims more', () => {
    const m = master();
    // Brightpath 09/2021 to 02/2022, then Ledgerly 03/2022 to now (09/2026): about 5 years.
    expect(experienceYears(m, new Date('2026-09-29T10:00:00Z'))).toBe(5);
    const { resume } = applyTailoring(
      m,
      PATCH(m, { summary: 'Backend engineer with 7+ years of Python and Django.' }),
      ctx(m),
    );
    expect(resume.tailoring!.assumed.map((a) => a.text)).toContain(
      'The summary says 7 years; your dated jobs add up to about 5.',
    );
    const ok = applyTailoring(
      m,
      PATCH(m, { summary: 'Backend engineer with 5 years of Python and Django.' }),
      ctx(m),
    );
    expect(ok.resume.tailoring!.assumed.some((a) => a.text.includes('years;'))).toBe(false);
  });
});

describe('what a rewrite must keep (cases from a live run)', () => {
  const KW = [
    { term: 'Transformers', aliases: [], importance: 'must' as const },
    { term: 'PyTorch', aliases: [], importance: 'must' as const },
    { term: 'NLP', aliases: [], importance: 'must' as const },
  ];
  const known = 'Trained NLP and churn models (TF-IDF, clustering, ensemble) in Python.';
  const check = (src: string, next: string) =>
    rewriteProblem(src, next, KW, known, ` ${known.toLowerCase()} `);

  it("finds a line's tools, acronyms, and names", () => {
    expect(
      termsOf('Trained NLP and churn models (TF-IDF, clustering, ensemble) on 80,000+ orders'),
    ).toEqual(expect.arrayContaining(['TF-IDF', 'clustering', 'ensemble', 'NLP']));
    expect(termsOf('Designed REST APIs for Django apps')).toEqual(
      expect.arrayContaining(['REST', 'APIs', 'Django']),
    );
  });

  it("refuses swapping the line's tools for the job's", () => {
    expect(
      check(
        'Trained NLP and churn models (TF-IDF, clustering, ensemble) on 80,000+ orders',
        'Trained NLP and classification models (transformers, scikit-learn) on 80,000+ orders',
      ),
    ).toMatch(/^dropped TF-IDF/);
  });

  it('refuses a past role rewritten in the present tense', () => {
    expect(
      check(
        'Reviewed chatbot answers from 6 ML models for accuracy',
        'Own the review of chatbot answers from 6 ML models for accuracy',
      ),
    ).toBe('changed the tense');
  });

  it("refuses a job keyword the candidate's data never mentions", () => {
    expect(check('Built NLP models with Python', 'Built NLP models with Python and PyTorch')).toBe(
      'added PyTorch',
    );
    // Rewording with the job's words that are true is fine.
    expect(check('Built NLP models with Python', 'Built production NLP models with Python')).toBe(
      null,
    );
  });

  it('keeps every item of a skills line and adds only missing job keywords', () => {
    const m = master();
    const o = outlineResume(m);
    const skills = [...o.entries.keys()][2]!;
    const { resume } = applyTailoring(
      m,
      PATCH(m, {
        keywords: [
          { term: 'Kubernetes', aliases: [], importance: 'must' },
          { term: 'Python', aliases: [], importance: 'must' },
        ],
        entries: [
          {
            id: skills,
            // Drops Flask and PostgreSQL, adds a job keyword and an unrelated word.
            lines: [{ from: `${skills}.1`, text: 'Python, Kubernetes, Django, Excel' }],
          },
        ],
      }),
      ctx(m),
    );
    expect(resume.sections[2]!.entries[0]!.description).toBe(
      '- Python, Kubernetes, Django, Flask, PostgreSQL',
    );
    expect(resume.tailoring!.assumed.filter((a) => a.kind === 'skill').map((a) => a.text)).toEqual([
      'Kubernetes',
    ]);
  });
});

describe('keeping the keywords that make the match', () => {
  it('never hides the only project that shows a job keyword', () => {
    const m = master();
    m.sections[3]!.entries[1]!.description = '- Telegram bot in Rust.';
    const o = outlineResume(m);
    const projects = [...o.entries.keys()].slice(3);
    const { resume } = applyTailoring(
      m,
      PATCH(m, {
        keywords: [{ term: 'Rust', aliases: [], importance: 'must' }],
        hide: [projects[1]!, projects[2]!],
      }),
      ctx(m),
    );
    expect(resume.sections[3]!.entries.map((e) => [e.title, e.hidden])).toEqual([
      ['Shift Planner', false],
      ['Budget Bot', false],
      ['Recipe Site', true],
    ]);
  });

  it('trims lines that carry no unique keyword first', () => {
    const m = master();
    m.sections[1]!.entries[0]!.description =
      '- Built a Django REST API.\n- Cut latency with Redis caching.\n- Mentored 3 engineers.\n- Wrote docs.';
    let r = applyTailoring(
      m,
      PATCH(m, { entries: [], keywords: [{ term: 'Redis', aliases: [], importance: 'must' }] }),
      ctx(m),
    ).resume;
    // Projects past two go first, then the longest job's lines from the end: "Wrote docs",
    // "Mentored", but never the Redis line.
    const notes: string[] = [];
    for (let i = 0; i < 3; i++) {
      const t = nextTrim(r)!;
      r = t.resume;
      notes.push(t.note);
    }
    expect(notes[1]).toContain('Wrote docs');
    expect(notes[2]).toContain('Mentored 3 engineers');
    expect(r.sections[1]!.entries[0]!.description).toContain('Redis');
  });
});

describe('eligibility sanity', () => {
  it('drops "outside EMEA" for a candidate in Africa, and keeps real limits', () => {
    const et = 'Nairobi, Kenya (GMT+3)';
    expect(
      wrongRegionClaim(
        'The position is for EMEA (Remote); you are outside the required region.',
        et,
      ),
    ).toBe(true);
    expect(wrongRegionClaim('Remote within the EU only; you are outside the EU.', et)).toBe(false);
    expect(wrongRegionClaim('US work authorization required.', et)).toBe(false);
    expect(wrongRegionClaim('Remote within EMEA; you are outside it.', 'Lisbon, Portugal')).toBe(
      false,
    );
  });

  it('drops a region the candidate is in, and keeps caveats and other limits', () => {
    const et = 'Nairobi, Kenya (GMT+3)';
    // From a live run: a "warning" that the candidate meets the requirement.
    expect(
      regionMet(
        'Remote within EMEA required; your current location is Kenya (GMT+3), which falls within the EMEA region.',
        et,
      ),
    ).toBe(true);
    // Only when the item says so: a harmless warning costs less than a hidden limit.
    expect(regionMet('Remote (Anywhere); you are based in Kenya.', et)).toBe(false);
    expect(
      regionMet('Lives in EMEA; Lisbon falls within the EMEA region.', 'Lisbon, Portugal'),
    ).toBe(true);
    // A caveat, a time zone, or authorization is a real limit.
    expect(regionMet('Within EMEA, but the role needs 4 hours of overlap with PST.', et)).toBe(
      false,
    );
    expect(regionMet('Remote in EMEA with 9:00 to 17:00 CET working hours.', et)).toBe(false);
    expect(regionMet('Worldwide role; EU work authorization required.', et)).toBe(false);
    expect(regionMet('US work authorization required; you are based in Kenya.', et)).toBe(false);
    expect(regionMet('Remote within EMEA; you are based in the US.', 'Austin, Texas')).toBe(false);
  });
});

describe('small repairs after a live run', () => {
  it('puts back bold the rewrite dropped', () => {
    expect(
      restoreBold(
        'Built Django REST APIs serving **3,000+ requests/day** for web apps',
        'Built Django REST APIs and data pipelines serving 3,000+ requests/day in production',
      ),
    ).toBe(
      'Built Django REST APIs and data pipelines serving **3,000+ requests/day** in production',
    );
    expect(restoreBold('Cut costs by **40%**', 'Cut cloud costs by **40%**')).toBe(
      'Cut cloud costs by **40%**',
    );
  });

  it('drops a years requirement the candidate already meets', () => {
    expect(yearsMet('3+ years of experience required; you have about 4 years.', 4)).toBe(true);
    expect(yearsMet('7+ years of backend experience required.', 4)).toBe(false);
    expect(yearsMet('A 4-year degree is required.', 5)).toBe(false);
  });

  it('takes skills as items, not sentences', () => {
    const m = master();
    const skills = [...outlineResume(m).entries.keys()][2]!;
    const { resume, rejected } = applyTailoring(
      m,
      PATCH(m, {
        entries: [
          {
            id: skills,
            lines: [
              { from: `${skills}.1`, text: 'Python, Django, Flask, PostgreSQL' },
              {
                from: null,
                text: 'Experience with cloud infrastructure (AWS or GCP) and design documentation',
              },
            ],
          },
        ],
      }),
      ctx(m),
    );
    expect(resume.sections[2]!.entries[0]!.description).toBe('- Python, Django, Flask, PostgreSQL');
    expect(rejected.some((x) => x.includes('reads like a sentence'))).toBe(true);
  });

  it('ends a rewrite like its source line, and keeps skill items as written', () => {
    expect(endLike('Reduced errors by ~25%', 'Reduced platform errors by ~25%.')).toBe(
      'Reduced platform errors by ~25%',
    );
    expect(endLike('Trained **4 AI systems**', 'Trained and evaluated **4 AI systems**.')).toBe(
      'Trained and evaluated **4 AI systems**',
    );
    expect(endLike('Wrote the docs.', 'Wrote the API docs.')).toBe('Wrote the API docs.');
    expect(endLike('Shipped Node.js services', 'Shipped Node.js')).toBe('Shipped Node.js');

    const m = master();
    const o = outlineResume(m);
    const [senior, , skills] = [...o.entries.keys()];
    const { resume } = applyTailoring(
      m,
      PATCH(m, {
        entries: [
          {
            id: senior!,
            lines: [
              { from: `${senior}.3`, text: 'Mentored 3 backend engineers' },
              { from: null, text: 'Reviewed pull requests for the payments team.' },
            ],
          },
          {
            id: skills!,
            // The model's copy of the items: new case, closing periods, and a keyword added.
            lines: [
              { from: `${skills}.1`, text: 'python, Django., Flask, PostgreSQL, Kubernetes.' },
            ],
          },
        ],
      }),
      ctx(m),
    );
    const lines = resume.sections[1]!.entries[0]!.description.split('\n');
    // The source lines end with a period, so the new line keeps its own.
    expect(lines).toContain('- Mentored 3 backend engineers');
    expect(lines).toContain('- Reviewed pull requests for the payments team.');
    expect(resume.sections[2]!.entries[0]!.description).toBe(
      '- Python, Django, Flask, PostgreSQL, Kubernetes',
    );
  });
});

describe('review fixes: numbers, names, and regions', () => {
  it('counts a metric written with its unit', () => {
    expect(
      numbersIn('900ms to 120ms; 10k users; $2M ARR; 1M+ events; 5x; 30 qps; 12mo').join(' '),
    ).toBe('900 120 10 2 1 5 30 12');
    // Names and ordinals still don't count.
    expect(numbersIn('S3, EC2, K8s, Web3, 3D, 5G, p95, 3rd place')).toEqual([]);
    expect(keepsNumbers('Cut latency from 900ms to 240ms.', 'Cut latency from 900ms to 90ms')).toBe(
      false,
    );
  });

  it("doesn't read English words as Go or R", () => {
    const go = { term: 'Go', aliases: [] };
    const r = { term: 'R', aliases: [] };
    expect(containsKeyword('I can start soon and am ready to go.', go)).toBe(false);
    expect(containsKeyword('Built Go and golang services', go)).toBe(true);
    expect(containsKeyword('Worked with the R&D team', r)).toBe(false);
    expect(containsKeyword('Analysis in Python & R', r)).toBe(true);
    expect(containsKeyword('the ml team', { term: 'Machine Learning', aliases: [] })).toBe(false);
    // So an English "go" in the candidate's data doesn't let a rewrite add the language.
    const m = master();
    const [, bright] = [...outlineResume(m).entries.keys()];
    const { rejected } = applyTailoring(
      m,
      PATCH(m, {
        keywords: [{ term: 'Go', aliases: [], importance: 'must' }],
        entries: [
          {
            id: bright!,
            lines: [{ from: `${bright}.1`, text: 'Wrote ETL pipelines in Python and Go.' }],
          },
        ],
      }),
      { ...ctx(m), knownText: `${resumeText(m)}\nI am ready to go.` },
    );
    expect(rejected).toContain(`${bright}.1: added Go`);
  });

  it('keeps real location limits for a candidate in Africa', () => {
    const et = 'Nairobi, Kenya (GMT+3)';
    for (const text of [
      'Remote anywhere in the United States; you are based in Kenya.',
      'Must be based in South Africa; you are based in Kenya.',
      'Open to candidates anywhere in Europe; you live in Kenya.',
      'EMEA excluded: this role hires in the Americas only.',
      'US-based role at a global company; you live in Kenya.',
    ]) {
      expect(regionMet(text, et), text).toBe(false);
      expect(wrongRegionClaim(text, et), text).toBe(false);
    }
    expect(wrongRegionClaim('Remote anywhere in the US; you are outside the US.', et)).toBe(false);
  });

  it('keeps a years limit tied to one skill, or with a caveat', () => {
    expect(yearsMet('Your dated jobs add up to about 2 years; the role needs 5+ years.', 2)).toBe(
      false,
    );
    expect(
      yearsMet('5+ years of experience with Kubernetes required; your resume shows none.', 6),
    ).toBe(false);
    expect(
      yearsMet(
        '3+ years of React Native required; you have 5 years of backend work and no mobile.',
        5,
      ),
    ).toBe(false);
    expect(
      yearsMet('3+ years of experience required; you have about 4 years of experience.', 4),
    ).toBe(true);
  });

  it('flags a summary that claims a title the candidate never held', () => {
    const m = master();
    const patch = PATCH(m, { summary: 'Senior backend engineer building **Python** APIs.' });
    m.sections[1]!.entries[0]!.title = 'Backend Engineer';
    expect(summarySeniority('Senior backend engineer and tech lead.', m)).toEqual([
      'senior',
      'lead',
    ]);
    // A verb or other people's titles aren't claims.
    expect(summarySeniority('I lead a team and work with product managers.', m)).toEqual([]);
    const { resume } = applyTailoring(m, patch, ctx(m));
    expect(resume.tailoring!.assumed.map((a) => a.text)).toContain(
      'The summary says "senior", a level your own job titles don\'t show.',
    );
  });
});

describe('review fixes: skills lines', () => {
  const skillsMaster = (description: string) => {
    const m = master();
    m.sections[2]!.entries[0]!.description = description;
    return { m, id: [...outlineResume(m).entries.keys()][2]! };
  };

  it('keeps skills lines the patch leaves out or empties', () => {
    const { m, id } = skillsMaster(
      '- Python, Django, Flask, Postgres\n- Docker, GitHub Actions, Linux\n- English, Amharic',
    );
    const { resume } = applyTailoring(
      m,
      PATCH(m, {
        entries: [
          {
            id,
            lines: [
              { from: `${id}.1`, text: 'Python, Django, Flask, Postgres' },
              { from: `${id}.2`, text: '' },
            ],
          },
        ],
      }),
      ctx(m),
    );
    expect(resume.sections[2]!.entries[0]!.description).toBe(
      '- Python, Django, Flask, Postgres\n- Docker, GitHub Actions, Linux\n- English, Amharic',
    );
  });

  it("uses the job's spelling of a skill the resume already names, once", () => {
    const { m, id } = skillsMaster('- Python, Django, Flask, Postgres');
    const { resume } = applyTailoring(
      m,
      PATCH(m, {
        keywords: [{ term: 'PostgreSQL', aliases: [], importance: 'must' }],
        entries: [{ id, lines: [{ from: `${id}.1`, text: 'PostgreSQL, Python, Django, Flask' }] }],
      }),
      ctx(m),
    );
    expect(resume.sections[2]!.entries[0]!.description).toBe('- PostgreSQL, Python, Django, Flask');
    expect(resume.tailoring!.assumed).toEqual([]);
  });

  it('keeps a group label in front, in its own bold', () => {
    const { m, id } = skillsMaster(
      '- **Languages:** Python, Java, SQL\n- **Frameworks:** Django, Flask',
    );
    const { resume } = applyTailoring(
      m,
      PATCH(m, {
        entries: [
          {
            id,
            lines: [
              { from: `${id}.1`, text: '**Languages:** Python, Java, SQL' },
              { from: `${id}.2`, text: 'Frameworks: Flask, Django' },
            ],
          },
        ],
      }),
      ctx(m),
    );
    expect(resume.sections[2]!.entries[0]!.description).toBe(
      '- **Languages:** Python, Java, SQL\n- **Frameworks:** Flask, Django',
    );
  });
});

describe('review fixes: what to check, and removing it', () => {
  it('flags an unknown keyword in the title line and summary on their own', () => {
    const m = master();
    const [senior, , skills] = [...outlineResume(m).entries.keys()];
    const { resume } = applyTailoring(
      m,
      PATCH(m, {
        keywords: [
          { term: 'Kubernetes', aliases: [], importance: 'must' },
          { term: 'R', aliases: [], importance: 'must' },
        ],
        headline: 'Backend Engineer | Python & R',
        summary: 'Backend engineer running Python services on **Kubernetes**.',
        entries: [
          { id: senior!, lines: [{ from: null, text: 'Deployed services on Kubernetes.' }] },
          {
            id: skills!,
            lines: [{ from: `${skills}.1`, text: 'Python, Django, Flask, PostgreSQL, MongoDB' }],
          },
        ],
      }),
      ctx(m),
    );
    const where = resume.tailoring!.assumed.map((a) => [a.kind, a.where]);
    expect(where).toContainEqual(['claim', 'Title line']);
    expect(where).toContainEqual(['claim', 'Profile']);
    expect(where).toContainEqual(['line', 'Professional Experience: Ledgerly']);
    // Removing the new line leaves the summary's claim to check.
    const line = resume.tailoring!.assumed.find((a) => a.kind === 'line')!;
    expect(line.text).toBe('Deployed services on Kubernetes.');
    const after = removeAssumed(resume, line);
    expect(resumeText(after)).not.toContain('Deployed services on Kubernetes');
    expect(after.tailoring!.assumed.some((a) => a.where === 'Profile')).toBe(true);
  });

  it('removes a new skills line, and a skill added as its own entry', () => {
    const m = master();
    const skills = [...outlineResume(m).entries.keys()][2]!;
    const { resume } = applyTailoring(
      m,
      PATCH(m, {
        keywords: [{ term: 'PyTorch', aliases: [], importance: 'must' }],
        entries: [
          {
            id: skills,
            lines: [
              { from: `${skills}.1`, text: 'Python, Django, Flask, PostgreSQL' },
              { from: null, text: 'PyTorch, TensorFlow' },
            ],
          },
        ],
      }),
      ctx(m),
    );
    const added = resume.tailoring!.assumed.find((a) => a.kind === 'skill')!;
    expect(added.text).toBe('PyTorch, TensorFlow');
    expect(removeAssumed(resume, added).sections[2]!.entries[0]!.description).toBe(
      '- Python, Django, Flask, PostgreSQL',
    );

    // Skills as one entry each (as "New from my profile" makes them).
    const flat = { ...resume, sections: resume.sections.map((s) => ({ ...s })) };
    flat.sections[2] = newSection('skills', {
      entries: [newEntry({ title: 'Python' }), newEntry({ title: 'Django' })],
    });
    const withK8s = addSkill(flat, 'Kubernetes');
    expect(withK8s.sections[2]!.entries.map((e) => e.title)).toEqual([
      'Python',
      'Django',
      'Kubernetes',
    ]);
    const a = withK8s.tailoring!.assumed.at(-1)!;
    expect(removeAssumed(withK8s, a).sections[2]!.entries.map((e) => e.title)).toEqual([
      'Python',
      'Django',
    ]);
  });

  it("keeps a job's own two lines, whatever lines were added", () => {
    const m = master();
    const senior = [...outlineResume(m).entries.keys()][0]!;
    const { resume } = applyTailoring(
      m,
      PATCH(m, {
        entries: [
          {
            id: senior,
            lines: [
              { from: null, text: 'Deployed backend services on Kubernetes.' },
              { from: null, text: 'Automated infrastructure with Terraform.' },
            ],
          },
        ],
      }),
      ctx(m),
    );
    const own = resume.sections[1]!.entries[0]!.description;
    expect(own).toContain('**2 million**');
    expect(own).toContain('Cut p95 latency');
  });

  it('never saves what the stored schema would refuse', () => {
    const m = master();
    const { resume } = applyTailoring(
      m,
      PATCH(m, {
        job: {
          title: 'Backend Engineer',
          company: 'Acme',
          location: '',
          workplace: 'Hybrid (3 days a week in our Amsterdam office, 2 days remote, flexible)',
        },
        keywords: [
          { term: 'Python', aliases: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'], importance: 'must' },
          { term: 'x'.repeat(120), aliases: [], importance: 'nice' },
        ],
        eligibility: [{ text: 'Needs '.repeat(80), level: 'warn' }],
      }),
      { ...ctx(m), job: { ...JOB, workplace: '' } },
    );
    expect(ResumeSchema.safeParse(resume).success).toBe(true);
    expect(resume.tailoring!.keywords).toHaveLength(1);
  });
});

describe('review fixes: fitting the pages', () => {
  it('hides a keyword-free project before cutting a line with a unique keyword', () => {
    const m = master();
    m.sections[1]!.entries[0]!.description =
      '- Built a Django REST API.\n- Cut p95 latency.\n- Ran services on Kubernetes.';
    m.sections[3]!.entries = m.sections[3]!.entries.slice(0, 2);
    const { resume } = applyTailoring(
      m,
      PATCH(m, {
        entries: [],
        keywords: [{ term: 'Kubernetes', aliases: [], importance: 'must' }],
      }),
      ctx(m),
    );
    const first = nextTrim(resume)!;
    expect(first.note).toBe('Left out to fit the pages: Budget Bot');
    expect(resumeText(first.resume)).toContain('Kubernetes');
  });

  it('spares a plain "Tech:" line', () => {
    const m = master();
    m.sections[3]!.entries = [
      newEntry({
        title: 'Shift Planner',
        description:
          '- Built a scheduling app.\n- Synced calendars.\n- Sent reminders by SMS.\n- Tech: Vue, Firebase',
      }),
    ];
    const { resume } = applyTailoring(m, PATCH(m, { entries: [] }), ctx(m));
    const first = nextTrim(resume)!;
    expect(first.note).not.toContain('Tech:');
  });
});
