import type { CandidateData } from '@/kb/contextBuilder';

/** "Profile ready: resume + 1 site" for the panel header (spec 13.2). */
export function profileStatus(data: CandidateData): string | null {
  const enabled = data.sources.filter((s) => s.enabled);
  const count = (kinds: string[]) => enabled.filter((s) => kinds.includes(s.kind)).length;
  const parts: string[] = [];
  const resumes = count(['resume']);
  const sites = count(['website', 'tab', 'ai-transcript']);
  const notes = count(['note']);
  const letters = count(['cover-letter']);
  const stories = count(['story']);
  if (resumes) parts.push(resumes === 1 ? 'resume' : `${resumes} resumes`);
  if (sites) parts.push(`${sites} ${sites === 1 ? 'site' : 'sites'}`);
  if (notes) parts.push(`${notes} ${notes === 1 ? 'note' : 'notes'}`);
  if (letters) parts.push('cover letter');
  if (stories) parts.push(`${stories} ${stories === 1 ? 'story' : 'stories'}`);
  const from = parts.length ? `: ${parts.join(' + ')}` : '';
  if (data.profile) return `Profile ready${from}`;
  if (parts.length) return `No profile yet, using ${parts.join(' + ')}`;
  return null;
}
