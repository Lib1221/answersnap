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

export function describeError(err: unknown): string {
  if (err instanceof LlmError) {
    if (err.kind === 'auth') return 'The API key was rejected. Check it in AI provider.';
    if (err.kind === 'rate_limit') return 'Rate limited by the API. Wait a minute and try again.';
    if (err.kind === 'overloaded' || err.kind === 'server')
      return 'The AI service is busy. Try again in a moment.';
    if (err.kind === 'network') return "Can't reach the AI service. Check your connection.";
    return err.message;
  }
  return 'Something went wrong. Try again.';
}
