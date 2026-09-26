import { FALLBACK_CHAINS } from '@/config/models';
import type { Provider, Settings } from '@/storage/schema';
import { FallbackProvider, orderedChain, storageCooldowns } from './fallback';
import { AnthropicProvider } from './anthropic';
import { GeminiProvider } from './gemini';
import { OLLAMA_DEFAULT_URL, OPENROUTER_BASE_URL, OpenAICompatProvider } from './openaiCompat';
import type { LlmProvider, StreamEvent } from './types';

export type { LlmProvider } from './types';

/**
 * `baseUrl` is the dev/e2e mock server when set; for Ollama it's also the user's Ollama address.
 * OpenAI-compatible APIs live under /v1 of it.
 */
export function createProvider(provider: Provider, apiKey: string, baseUrl?: string): LlmProvider {
  switch (provider) {
    case 'anthropic':
      return new AnthropicProvider(apiKey, baseUrl);
    case 'gemini':
      return new GeminiProvider(apiKey, baseUrl);
    case 'openrouter':
      return new OpenAICompatProvider(
        apiKey,
        baseUrl ? `${baseUrl}/v1` : OPENROUTER_BASE_URL,
        'OpenRouter',
      );
    case 'ollama':
      return new OpenAICompatProvider(
        apiKey,
        `${(baseUrl ?? OLLAMA_DEFAULT_URL).replace(/\/+$/, '')}/v1`,
        'Ollama',
      );
  }
}

/** The base URL for this user's provider: the dev override, else Ollama's address. */
export function providerBaseUrl(
  settings: Pick<Settings, 'provider' | 'baseUrl' | 'ollamaUrl'>,
): string | undefined {
  if (settings.baseUrl) return settings.baseUrl;
  return settings.provider === 'ollama' ? settings.ollamaUrl : undefined;
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
  const inner = createProvider(settings.provider, apiKey, providerBaseUrl(settings));
  const chains = FALLBACK_CHAINS[settings.provider];
  if (!settings.autoFallback || !chains.answer.length) return inner;
  const available = settings.availableModels;
  const chainFor = (model: string) => {
    const fast = model === settings.fastModel || chains.fast.includes(model);
    return orderedChain(model, fast ? chains.fast : chains.answer, available);
  };
  return new FallbackProvider(inner, chainFor, storageCooldowns, onSwitch);
}
