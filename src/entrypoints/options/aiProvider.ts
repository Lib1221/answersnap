import { LlmError } from '@/llm/errors';
import { createProvider } from '@/llm/provider';
import type { LlmProvider } from '@/llm/types';
import { getApiKey, getSettings } from '@/storage/items';
import type { Settings } from '@/storage/schema';

/** The configured provider, or an LlmError('no_key') the UI can show. */
export async function configuredProvider(): Promise<{ provider: LlmProvider; settings: Settings }> {
  const settings = await getSettings();
  const key = await getApiKey(settings.provider);
  if (!key) throw new LlmError('no_key', 'Add your API key in AI provider first.');
  return { provider: createProvider(settings.provider, key, settings.baseUrl), settings };
}

export { describeError } from '@/llm/errors';
