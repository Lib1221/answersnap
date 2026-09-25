import type { Provider } from '@/storage/schema';
import { AnthropicProvider } from './anthropic';
import { GeminiProvider } from './gemini';
import type { LlmProvider } from './types';

export type { LlmProvider } from './types';

/** `baseUrl` is only set in dev and e2e builds (mock server). */
export function createProvider(provider: Provider, apiKey: string, baseUrl?: string): LlmProvider {
  switch (provider) {
    case 'anthropic':
      return new AnthropicProvider(apiKey, baseUrl);
    case 'gemini':
      return new GeminiProvider(apiKey, baseUrl);
  }
}
