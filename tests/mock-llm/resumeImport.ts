// Mock for resume import (src/llm/resumeImport.ts): structures the fictional Jamie Park resume
// (tests/fixtures/resumes/jamie-park.pdf) by pointing at its numbered lines, as the model does.

export const IMPORT_PROMPT = /You convert a resume into structured data for a resume builder/;

const entry = (e: Record<string, unknown>) => ({
  title: '',
  subtitle: '',
  city: '',
  country: '',
  start: '',
  end: '',
  present: false,
  date: '',
  link: '',
  info: '',
  level: 0,
  lines: [] as number[],
  ...e,
});

/** The structure of Jamie's resume, given its lines (L1 is lines[0]). */
export function jamieStructure(lines: string[]) {
  const find = (re: RegExp) => lines.flatMap((l, i) => (re.test(l) ? [i + 1] : []));
  return {
    personal: {
      fullName: 'Jamie Park',
      jobTitle: 'Backend Engineer',
      email: 'jamie.park@example.com',
      phone: '',
      location: 'Lisbon, Portugal (UTC+0)',
      links: [{ kind: 'github', label: 'GitHub', url: 'https://github.com/jamiepark-example' }],
    },
    sections: [
      {
        type: 'profile',
        title: 'Summary',
        lines: find(/Five years of professional Python/),
        entries: [],
      },
      {
        type: 'experience',
        title: 'EXPERIENCE',
        lines: [],
        entries: [
          entry({
            title: 'Senior Backend Engineer',
            subtitle: 'Ledgerly',
            city: 'Remote',
            start: '03/2022',
            present: true,
            lines: find(/Django REST Framework API|Cut p95 latency|Tech: Python, Django, Django/),
          }),
          entry({
            title: 'Backend Engineer',
            subtitle: 'Brightpath Analytics',
            city: 'Lisbon',
            // Year only, as a small model sometimes answers: the month comes back from the file.
            start: '2021',
            end: '2022',
            lines: find(/ETL pipelines|Flask microservices/),
          }),
          entry({
            title: 'Volunteer Mentor',
            subtitle: 'Data Science for Everyone',
            start: '2021',
            present: true,
            lines: find(/Mentor 4 learners/),
          }),
        ],
      },
      {
        type: 'projects',
        title: 'PROJECTS',
        lines: [],
        entries: [
          entry({
            title: '**Shift Planner**',
            link: 'https://github.com/jamiepark-example/shift-planner',
            lines: find(/Vue 3 and Django app/),
          }),
        ],
      },
      {
        type: 'education',
        title: 'EDUCATION',
        lines: [],
        entries: [
          entry({
            title: 'BSc Computer Science',
            subtitle: 'University of Porto',
            start: '2015',
            end: '2019',
          }),
        ],
      },
      {
        type: 'languages',
        title: 'LANGUAGES',
        lines: [],
        entries: [
          entry({ title: 'English', info: 'fluent' }),
          entry({ title: 'Portuguese', info: 'native' }),
        ],
      },
    ],
  };
}

/** The mock's reply: the numbered lines from the request, structured. */
export function importJson(raw: string): string {
  const escaped = raw.match(/<resume_lines>\\n(.*?)\\n<\/resume_lines>/)?.[1] ?? '';
  const numbered = JSON.parse(`"${escaped}"`) as string;
  const lines = numbered.split('\n').map((l) => l.replace(/^L\d+: /, ''));
  return JSON.stringify(jamieStructure(lines));
}
