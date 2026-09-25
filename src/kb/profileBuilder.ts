import { LlmError } from '@/llm/errors';
import { PROFILE_BUILDER, TRANSCRIBE } from '@/llm/prompts';
import type { LlmProvider } from '@/llm/types';
import type { KnowledgeSource } from '@/storage/schema';
import { normalizeText } from './normalize';
import {
  CandidateProfileSchema,
  emptyProfile,
  profileJsonSchema,
  type CandidateProfile,
} from './profileSchema';

const PROFILE_MAX_TOKENS = 8192;

function attr(value: string): string {
  return value.replace(/["<>]/g, '');
}

export function sourcesDocument(sources: KnowledgeSource[]): string {
  return sources
    .filter((s) => s.enabled && s.text.trim())
    .map((s) => `<source label="${attr(s.label)}" kind="${s.kind}">\n${s.text.trim()}\n</source>`)
    .join('\n');
}

/** Build a CandidateProfile from the enabled sources with structured outputs (spec 10.3). */
export async function buildProfile(
  provider: LlmProvider,
  model: string,
  sources: KnowledgeSource[],
  signal?: AbortSignal,
): Promise<CandidateProfile> {
  const docs = sourcesDocument(sources);
  if (!docs) throw new LlmError('bad_request', 'Add a resume or another source first.');
  const result = await provider.complete(
    {
      model,
      maxTokens: PROFILE_MAX_TOKENS,
      system: [{ text: PROFILE_BUILDER }],
      messages: [
        { role: 'user', content: [{ type: 'text', text: `<documents>\n${docs}\n</documents>` }] },
      ],
      jsonSchema: profileJsonSchema(),
      schemaName: 'save_profile',
    },
    signal,
  );
  const parsed = CandidateProfileSchema.safeParse({
    ...emptyProfile(),
    ...(result.json as object),
  });
  if (!parsed.success) {
    throw new LlmError('bad_request', 'The profile came back in an unexpected shape. Try again.');
  }
  return parsed.data;
}

/** Vision transcription of an image with the fast model (spec 11.4 TRANSCRIBE). */
export async function transcribeImage(
  provider: LlmProvider,
  model: string,
  dataUrl: string,
  signal?: AbortSignal,
): Promise<string> {
  const match = /^data:(image\/(?:png|jpeg));base64,(.*)$/s.exec(dataUrl);
  if (!match) throw new LlmError('bad_request', 'Unsupported image.');
  const result = await provider.complete(
    {
      model,
      maxTokens: 4096,
      system: [{ text: TRANSCRIBE }],
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', mediaType: match[1] as 'image/png' | 'image/jpeg', data: match[2]! },
            { type: 'text', text: 'Transcribe this image.' },
          ],
        },
      ],
    },
    signal,
  );
  return normalizeText(result.text);
}

// Rebuild comparison (spec 10.3): per-section "Keep mine" or "Use new". Never silently
// overwrite the user's edits.

export const PROFILE_SECTIONS = [
  {
    id: 'basics',
    title: 'Basics',
    keys: ['fullName', 'headline', 'location', 'email', 'phone', 'summary'],
  },
  { id: 'links', title: 'Links', keys: ['links'] },
  { id: 'skills', title: 'Skills', keys: ['skills'] },
  { id: 'experience', title: 'Experience', keys: ['experience'] },
  { id: 'projects', title: 'Projects', keys: ['projects'] },
  { id: 'education', title: 'Education', keys: ['education'] },
  { id: 'certifications', title: 'Certifications', keys: ['certifications'] },
  { id: 'languages', title: 'Languages', keys: ['languages'] },
  { id: 'achievements', title: 'Achievements', keys: ['achievements'] },
  { id: 'conflicts', title: 'Conflicts between sources', keys: ['conflicts'] },
] as const satisfies readonly {
  id: string;
  title: string;
  keys: readonly (keyof CandidateProfile)[];
}[];

export type SectionId = (typeof PROFILE_SECTIONS)[number]['id'];
export type SectionChoice = 'mine' | 'new';

function pick(p: CandidateProfile, keys: readonly (keyof CandidateProfile)[]) {
  return JSON.stringify(keys.map((k) => p[k]));
}

/** Sections where the rebuilt profile differs from the current one. */
export function changedSections(current: CandidateProfile, next: CandidateProfile): SectionId[] {
  return PROFILE_SECTIONS.filter((s) => pick(current, s.keys) !== pick(next, s.keys)).map(
    (s) => s.id,
  );
}

/** Profiles are plain JSON; this also works on Vue's reactive proxies (structuredClone doesn't). */
export function cloneProfile<T>(p: T): T {
  return JSON.parse(JSON.stringify(p)) as T;
}

export function mergeProfiles(
  current: CandidateProfile,
  next: CandidateProfile,
  choices: Partial<Record<SectionId, SectionChoice>>,
): CandidateProfile {
  const out = cloneProfile(current) as Record<keyof CandidateProfile, unknown>;
  for (const section of PROFILE_SECTIONS) {
    if (choices[section.id] !== 'new') continue;
    for (const key of section.keys) out[key] = cloneProfile(next[key]);
  }
  return out as CandidateProfile;
}
