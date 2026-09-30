// Mock for one-click tailoring (src/llm/tailor.ts): reads the master resume outline from the
// request and returns a tailoring built from it, so the e2e flow exercises the real apply step.

export const TAILOR_PROMPT = /You are an expert technical recruiter and ATS specialist/;

interface OutlineEntry {
  id: string;
  type: string;
  lines: { id: string; text: string }[];
}

function outlineFrom(raw: string): OutlineEntry[] {
  // The block itself (the rules also name <master_resume> in passing): the tag, then a newline.
  const escaped = raw.match(/<master_resume>\\n(.*?)\\n<\/master_resume>/)?.[1] ?? '';
  const outline = JSON.parse(`"${escaped}"`) as string;
  const entries: OutlineEntry[] = [];
  let type = '';
  for (const line of outline.split('\n')) {
    const section = line.match(/^\[S\d+\] .* \((\w+)\)$/);
    if (section) {
      type = section[1]!;
      continue;
    }
    const entry = line.match(/^ \[(E\d+)\] /);
    if (entry) {
      entries.push({ id: entry[1]!, type, lines: [] });
      continue;
    }
    const l = line.match(/^ {2}\[(E\d+\.\d+)\] (.*)$/);
    if (l) entries.at(-1)?.lines.push({ id: l[1]!, text: l[2]! });
  }
  return entries;
}

export function tailorJson(raw: string): string {
  const entries = outlineFrom(raw);
  const firstJob = entries.find((e) => e.type === 'experience' && e.lines.length);
  return JSON.stringify({
    job: {
      title: 'Senior Backend Engineer',
      company: 'Northwind',
      location: 'Remote (EU)',
      workplace: 'Remote',
    },
    keywords: [
      { term: 'Python', aliases: [], importance: 'must' },
      { term: 'Django', aliases: [], importance: 'must' },
      { term: 'Kubernetes', aliases: ['k8s'], importance: 'must' },
      { term: 'PostgreSQL', aliases: ['Postgres'], importance: 'must' },
      { term: 'AWS', aliases: ['Amazon Web Services'], importance: 'nice' },
    ],
    eligibility: [
      { text: "Remote within the EU only; you're based in Lisbon, Portugal.", level: 'warn' },
    ],
    headline: 'Senior Backend Engineer | Python, Django, and payments APIs',
    summary:
      'Backend engineer building **Python** and **Django** payment and data APIs, from reconciliation at scale to faster reporting.',
    entries: firstJob
      ? [
          {
            id: firstJob.id,
            lines: [
              ...[...firstJob.lines].reverse().map((l) => ({ from: l.id, text: l.text })),
              { from: null, text: 'Deployed containerized services with Kubernetes.' },
            ],
          },
        ]
      : [],
    order: [],
    hide: [],
  });
}
