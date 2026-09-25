import { storage } from 'wxt/utils/storage';
import { loadCandidateData } from '@/kb/candidate';
import { buildSystemBlocks, hasCandidateData } from '@/kb/contextBuilder';
import { createProvider } from '@/llm/provider';
import { getApiKey, getSettings } from '@/storage/items';

/** Anthropic's 5-minute cache: re-warm when the last warm-up is older than this (spec 11.2). */
export const PREWARM_AFTER_MS = 4 * 60 * 1000;

interface LastPrewarm {
  model: string;
  /** Hash of the system blocks, so an edited profile gets warmed again. */
  hash: string;
  at: number;
}

const lastPrewarmItem = storage.defineItem<LastPrewarm>('session:lastPrewarm');

export function hashText(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

export function shouldPrewarm(
  last: LastPrewarm | null,
  model: string,
  hash: string,
  now: number,
): boolean {
  return !last || last.model !== model || last.hash !== hash || now - last.at > PREWARM_AFTER_MS;
}

/**
 * When the panel opens: write the prompt cache for the current profile so the first real
 * answer starts faster. Anthropic only; Gemini caches repeated prefixes on its own.
 */
export async function prewarmIfNeeded(now = Date.now()): Promise<boolean> {
  const settings = await getSettings();
  if (!settings.prewarmCache || settings.provider !== 'anthropic') return false;
  const key = await getApiKey(settings.provider);
  const data = await loadCandidateData();
  if (!key || !hasCandidateData(data)) return false;

  const system = buildSystemBlocks(settings, data);
  const hash = hashText(system.map((b) => b.text).join('\u0000'));
  if (!shouldPrewarm((await lastPrewarmItem.getValue()) ?? null, settings.model, hash, now))
    return false;
  await lastPrewarmItem.setValue({ model: settings.model, hash, at: now });
  try {
    await createProvider(settings.provider, key, settings.baseUrl).prewarm(system, settings.model);
    return true;
  } catch (err) {
    console.warn('[AnswerSnap] pre-warm failed', err);
    await lastPrewarmItem.removeValue();
    return false;
  }
}
