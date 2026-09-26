import { z } from 'zod';
import { ApplicationsSchema, getApplications, saveApplications } from '@/kb/applications';
import { LibrarySchema, getLibrary, saveLibrary } from '@/kb/library';
import { ProfileRecordSchema, StandardAnswersSchema } from '@/kb/profileSchema';
import { ResumeSchema } from '@/kb/resume/model';
import {
  getMyTemplates,
  getResumes,
  MyTemplateSchema,
  saveMyTemplates,
  saveResumes,
} from '@/kb/resume/store';
import {
  getProfile,
  getSettings,
  getSources,
  getStandardAnswers,
  profileItem,
  saveSettings,
  saveSources,
  saveStandardAnswers,
} from './items';
import { SettingsSchema, SourcesSchema, type Provider } from './schema';

// Export and import (spec 13.3): one JSON file with settings (never the API keys), sources,
// profile, standard answers, library, tracked applications, and built resumes. Import validates
// everything before replacing. Applicant details (passport and the like) are never exported.

export const EXPORT_FORMAT = 'answersnap-export';

const PROVIDER_SHORT: Record<Provider, string> = {
  anthropic: 'Anthropic',
  gemini: 'Google Gemini',
  openrouter: 'OpenRouter',
  ollama: 'Ollama',
};

export const ExportSchema = z.object({
  format: z.literal(EXPORT_FORMAT),
  version: z.literal(1),
  exportedAt: z.string(),
  settings: SettingsSchema.omit({ baseUrl: true }),
  sources: SourcesSchema,
  profile: ProfileRecordSchema.nullable(),
  standardAnswers: StandardAnswersSchema,
  library: LibrarySchema,
  /** Added after v1; older exports have none. */
  applications: ApplicationsSchema.default([]),
  /** Resume builder documents. Older exports have none, and importing them keeps the current ones. */
  resumes: z.array(ResumeSchema).optional(),
  resumeTemplates: z.array(MyTemplateSchema).optional(),
});
export type ExportData = z.infer<typeof ExportSchema>;

export async function buildExport(now = new Date()): Promise<ExportData> {
  const { baseUrl: _dev, ...settings } = await getSettings();
  return {
    format: EXPORT_FORMAT,
    version: 1,
    exportedAt: now.toISOString(),
    settings,
    sources: await getSources(),
    profile: await getProfile(),
    standardAnswers: await getStandardAnswers(),
    library: await getLibrary(),
    applications: await getApplications(),
    resumes: await getResumes(),
    resumeTemplates: await getMyTemplates(),
  };
}

export function parseImport(
  text: string,
): { ok: true; data: ExportData } | { ok: false; error: string } {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, error: "That file isn't valid JSON." };
  }
  const result = ExportSchema.safeParse(json);
  if (!result.success) {
    const where = result.error.issues[0]?.path.join('.') || 'file';
    return { ok: false, error: `That file isn't an AnswerSnap export (problem at ${where}).` };
  }
  return { ok: true, data: result.data };
}

export function describeImport(d: ExportData): string[] {
  const enabled = d.sources.filter((s) => s.enabled).length;
  return [
    `${d.sources.length} ${d.sources.length === 1 ? 'source' : 'sources'} (${enabled} in use)`,
    d.profile
      ? `Profile for ${d.profile.profile.fullName ?? 'an unnamed candidate'}`
      : 'No profile',
    `${d.library.length} saved ${d.library.length === 1 ? 'answer' : 'answers'}`,
    `${d.applications.length} tracked ${d.applications.length === 1 ? 'application' : 'applications'}`,
    ...(d.resumes ? [`${d.resumes.length} ${d.resumes.length === 1 ? 'resume' : 'resumes'}`] : []),
    `Settings: ${PROVIDER_SHORT[d.settings.provider]}, ${d.settings.model}`,
  ];
}

/** Replace everything the export covers. API keys stay as they are. */
export async function applyImport(d: ExportData): Promise<void> {
  await saveSettings(d.settings);
  await saveSources(d.sources);
  if (d.profile) await profileItem.setValue(d.profile);
  else await profileItem.removeValue();
  await saveStandardAnswers(d.standardAnswers);
  await saveLibrary(d.library);
  await saveApplications(d.applications);
  if (d.resumes) await saveResumes(d.resumes);
  if (d.resumeTemplates) await saveMyTemplates(d.resumeTemplates);
}

/** "Delete all data": every storage area (the synced copy too) and every optional host permission. */
export async function deleteAllData(): Promise<void> {
  await browser.storage.local.clear();
  await browser.storage.session.clear();
  await browser.storage.sync.clear();
  const required = new Set(browser.runtime.getManifest().host_permissions ?? []);
  const { origins = [] } = await browser.permissions.getAll();
  const optional = origins.filter((o) => !required.has(o));
  if (optional.length) await browser.permissions.remove({ origins: optional }).catch(() => false);
}
