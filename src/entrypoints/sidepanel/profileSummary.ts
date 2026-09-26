import type { CandidateData } from '@/kb/contextBuilder';
import { t } from '@/ui/i18n';

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
  if (resumes)
    parts.push(
      resumes === 1
        ? t('profile_part_resume', 'resume')
        : t('profile_part_resumes', '$1 resumes', String(resumes)),
    );
  if (sites)
    parts.push(
      sites === 1
        ? t('profile_part_site', '$1 site', String(sites))
        : t('profile_part_sites', '$1 sites', String(sites)),
    );
  if (notes)
    parts.push(
      notes === 1
        ? t('profile_part_note', '$1 note', String(notes))
        : t('profile_part_notes', '$1 notes', String(notes)),
    );
  if (letters) parts.push(t('profile_part_cover_letter', 'cover letter'));
  if (stories)
    parts.push(
      stories === 1
        ? t('profile_part_story', '$1 story', String(stories))
        : t('profile_part_stories', '$1 stories', String(stories)),
    );
  const list = parts.join(' + ');
  if (data.profile)
    return parts.length
      ? t('profile_ready_from', 'Profile ready: $1', list)
      : t('profile_ready', 'Profile ready');
  if (parts.length) return t('profile_none_using', 'No profile yet, using $1', list);
  return null;
}
