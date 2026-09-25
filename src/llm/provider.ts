import { FALLBACK_CHAINS } from '@/config/models';
import type { Provider, Settings } from '@/storage/schema';
import { FallbackProvider, orderedChain, storageCooldowns } from './fallback';
import { AnthropicProvider } from './anthropic';
import { GeminiProvider } from './gemini';
import type { LlmProvider, StreamEvent } from './types';

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

/**
 * The provider the app uses: the configured one, wrapped with automatic model fallback when
 * that's on and the provider has a fallback chain (Gemini free tier).
 */
export function createAppProvider(
  settings: Settings,
  apiKey: string,
  onSwitch?: (e: Extract<StreamEvent, { kind: 'fallback' }>) => void,
): LlmProvider {
  const inner = createProvider(settings.provider, apiKey, settings.baseUrl);
  const chains = FALLBACK_CHAINS[settings.provider];
  if (!settings.autoFallback || !chains.answer.length) return inner;
  const available = settings.availableModels;
  const chainFor = (model: string) => {
    const fast = model === settings.fastModel || chains.fast.includes(model);
    return orderedChain(model, fast ? chains.fast : chains.answer, available);
  };
  return new FallbackProvider(inner, chainFor, storageCooldowns, onSwitch);
}
