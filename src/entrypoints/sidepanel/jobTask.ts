import { loadCandidateData } from '@/kb/candidate';
import { buildSystemBlocks, hasCandidateData } from '@/kb/contextBuilder';
import { LlmError } from '@/llm/errors';
import { createAppProvider, type LlmProvider } from '@/llm/provider';
import type { StreamEvent } from '@/llm/types';
import { getApiKey, getSettings } from '@/storage/items';
import type { Settings } from '@/storage/schema';
import { errorMessage } from './useAnswer';

export type JobTask =
  | { ok: true; settings: Settings; provider: LlmProvider; candidateBlock: string }
  | { ok: false; error: string };

/** What every job tool (fit check, interview prep) needs before its request. */
export async function prepareJobTask(
  onSwitch?: (e: Extract<StreamEvent, { kind: 'fallback' }>) => void,
): Promise<JobTask> {
  const settings = await getSettings();
  const key = await getApiKey(settings.provider);
  if (!key) return { ok: false, error: 'Add your API key to start.' };
  const data = await loadCandidateData();
  if (!hasCandidateData(data))
    return { ok: false, error: 'Add your resume so there is something to compare.' };
  return {
    ok: true,
    settings,
    provider: createAppProvider(settings, key, onSwitch),
    candidateBlock: buildSystemBlocks(settings, data)[1]!.text,
  };
}

export function jobTaskError(err: unknown, settings: Settings, fallback: string): string {
  return err instanceof LlmError ? errorMessage(err, settings) : fallback;
}
