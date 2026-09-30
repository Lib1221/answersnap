import { describe, expect, it } from 'vitest';
import { resumeChanges, undoChange, wordDiff } from '@/kb/resume/diff';
import { newEntry, newResume, newSection, type Resume } from '@/kb/resume/model';

// "What changed": a tailored copy against its master, with an undo per change (Jamie Park).

function master(): Resume {
  const r = newResume({
    sections: [
      newSection('profile', { text: 'Backend engineer with 5 years of Python.' }),
      newSection('experience', {
        entries: [
          newEntry({
            title: 'Senior Backend Engineer',
            subtitle: 'Ledgerly',
            description:
              '- Built a Django REST API handling **2 million** requests per day.\n- Cut p95 latency from 900 ms to 240 ms.\n- Mentored 3 engineers.',
          }),
        ],
      }),
      newSection('projects', {
        entries: [
          newEntry({ title: 'Shift Planner', description: '- Vue app.' }),
          newEntry({ title: 'Budget Bot', description: '- Telegram bot.' }),
        ],
      }),
    ],
  });
  r.personal.jobTitle = 'Backend Engineer';
  return r;
}

/** A copy as tailoring makes it: same ids, reworded and trimmed. */
function tailored(m: Resume): Resume {
  const c = JSON.parse(JSON.stringify(m)) as Resume;
  c.personal.jobTitle = 'Backend Engineer | Python & Kubernetes';
  c.sections[0]!.text = 'Backend engineer building **Python** payment APIs.';
  c.sections[1]!.entries[0]!.description =
    '- Cut API p95 latency from 900 ms to 240 ms.\n- Built a Django REST API handling **2 million** requests per day.\n- Deployed services on Kubernetes.';
  c.sections[2]!.entries = [
    c.sections[2]!.entries[1]!,
    { ...c.sections[2]!.entries[0]!, hidden: true },
  ];
  return c;
}

describe('word diff', () => {
  it('marks removed and added words, and keeps the rest', () => {
    expect(wordDiff('Cut p95 latency from 900 ms', 'Cut API p95 latency from 900 ms')).toEqual([
      { kind: 'same', text: 'Cut ' },
      { kind: 'ins', text: 'API ' },
      { kind: 'same', text: 'p95 latency from 900 ms' },
    ]);
    expect(wordDiff('a b', 'a c').map((p) => p.kind)).toEqual(['same', 'del', 'ins']);
  });
});

describe('what changed', () => {
  it('lists every change, pairing reworded lines with their originals', () => {
    const m = master();
    const changes = resumeChanges(m, tailored(m));
    expect(changes.map((c) => [c.kind, c.where])).toEqual([
      ['headline', 'Title line'],
      ['summary', 'Profile'],
      ['line-changed', 'Professional Experience: Ledgerly'],
      ['line-removed', 'Professional Experience: Ledgerly'],
      ['line-added', 'Professional Experience: Ledgerly'],
      // One visible project has no order to change; unhiding Shift Planner brings it up.
      ['hidden', 'Projects: Shift Planner'],
    ]);
    const reworded = changes.find((c) => c.kind === 'line-changed')!;
    expect(reworded.before).toBe('Cut p95 latency from 900 ms to 240 ms.');
    expect(reworded.after).toBe('Cut API p95 latency from 900 ms to 240 ms.');
    // Moving a line within a job isn't a change of its own.
    expect(changes.some((c) => c.before.includes('2 million'))).toBe(false);
  });

  it("puts back the master's version, one change at a time", () => {
    const m = master();
    let c = tailored(m);
    for (;;) {
      const [next] = resumeChanges(m, c);
      if (!next) break;
      c = undoChange(c, m, next);
    }
    expect(c.personal.jobTitle).toBe('Backend Engineer');
    expect(c.sections[0]!.text).toBe(m.sections[0]!.text);
    const lines = c.sections[1]!.entries[0]!.description.split('\n');
    expect(lines).toContain('- Cut p95 latency from 900 ms to 240 ms.');
    expect(lines).toContain('- Mentored 3 engineers.');
    expect(lines).not.toContain('- Deployed services on Kubernetes.');
    expect(c.sections[2]!.entries.map((e) => [e.title, e.hidden])).toEqual([
      ['Shift Planner', false],
      ['Budget Bot', false],
    ]);
  });

  it('undoing a new line also takes it off the list to check', () => {
    const m = master();
    const c = tailored(m);
    c.tailoring = {
      sourceResumeId: m.id,
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
      keywords: [],
      eligibility: [],
      scoreBefore: 0,
      assumed: [
        {
          id: 'a1',
          kind: 'line',
          text: 'Deployed services on Kubernetes.',
          where: 'x',
          sectionId: c.sections[1]!.id,
          entryId: c.sections[1]!.entries[0]!.id,
        },
      ],
      trimmed: [],
      createdAt: '',
    };
    const added = resumeChanges(m, c).find((x) => x.kind === 'line-added')!;
    expect(undoChange(c, m, added).tailoring!.assumed).toEqual([]);
  });
});
