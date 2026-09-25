// Fallback model lists and per-model request quirks. The live list comes from each
// provider's models endpoint; these fill the dropdown when that call hasn't run yet.

import type { ModelPrice, Provider } from '@/storage/schema';

export type ProviderId = Provider;

export interface ModelInfo {
  id: string;
  displayName: string;
  role?: 'default' | 'fast' | 'best';
}

export const FALLBACK_MODELS: Record<ProviderId, ModelInfo[]> = {
  anthropic: [
    { id: 'claude-sonnet-5', displayName: 'Sonnet 5', role: 'default' },
    { id: 'claude-haiku-4-5-20251001', displayName: 'Haiku 4.5', role: 'fast' },
    { id: 'claude-opus-5-5', displayName: 'Opus 5.5', role: 'best' },
  ],
  gemini: [
    { id: 'gemini-3.5-flash', displayName: 'Gemini 3.5 Flash', role: 'default' },
    { id: 'gemini-3.8-flash', displayName: 'Gemini 3.8 Flash' },
    { id: 'gemini-3.5-flash-lite', displayName: 'Gemini 3.5 Flash-Lite', role: 'fast' },
    { id: 'gemini-3.1-pro-preview', displayName: 'Gemini 3.1 Pro Preview', role: 'best' },
  ],
};

export function defaultModel(provider: ProviderId, role: 'default' | 'fast'): string {
  return FALLBACK_MODELS[provider].find((m) => m.role === role)!.id;
}

/** USD per million tokens, as of September 2026 (spec 11.3; Gemini paid tier). Editable. */
export const DEFAULT_PRICES: Record<string, ModelPrice> = {
  'claude-sonnet-5': { input: 2, output: 10, cacheRead: 0.2, cacheWrite5m: 2.5 },
  'claude-haiku-4-5-20251001': { input: 1, output: 5, cacheRead: 0.1, cacheWrite5m: 1.25 },
  'claude-opus-5-5': { input: 4, output: 20, cacheRead: 0.2, cacheWrite5m: 5 },
  'gemini-3.5-flash': { input: 0.75, output: 3.75, cacheRead: 0.075, cacheWrite5m: 0 },
  'gemini-3.8-flash': { input: 0.75, output: 3.75, cacheRead: 0.075, cacheWrite5m: 0 },
  'gemini-3.5-flash-lite': { input: 0.3, output: 2.5, cacheRead: 0, cacheWrite5m: 0 },
};

/**
 * Request quirks per model family, from Anthropic's and Google's current docs:
 * - Sonnet 5 runs adaptive thinking when `thinking` is omitted, which would eat a short
 *   answer's token budget. It accepts `{ type: 'disabled' }`.
 * - Opus 5.5 can't disable thinking (400); lower effort instead and leave output room.
 * - Haiku 4.5 has no thinking by default and rejects `effort`.
 * - Gemini 3.x always thinks; `thinkingLevel: 'low'` keeps it short. Thinking tokens
 *   count toward `maxOutputTokens`, so leave room.
 */
export interface ModelQuirks {
  thinking?: { type: 'disabled' };
  effort?: 'low' | 'medium';
  geminiThinkingLevel?: 'low';
  /** Floor for max output tokens when the model thinks before answering. */
  minMaxTokens?: number;
  /** Minimum cacheable prefix in tokens; below it caching silently does nothing. */
  minCacheTokens?: number;
  /** Forced tool_choice ("tool"/"any") returns a 400 on these models; use "auto" + an instruction. */
  noForcedToolChoice?: boolean;
}

export function quirksFor(model: string): ModelQuirks {
  if (model.startsWith('claude-sonnet-5')) {
    return { thinking: { type: 'disabled' }, minCacheTokens: 1024 };
  }
  if (model.startsWith('claude-opus-5-5')) {
    return { effort: 'low', minMaxTokens: 4096, minCacheTokens: 512, noForcedToolChoice: true };
  }
  if (model.startsWith('claude-opus-5'))
    return { effort: 'low', minMaxTokens: 4096, minCacheTokens: 512 };
  if (model.startsWith('claude-fable-5-1'))
    return { noForcedToolChoice: true, minCacheTokens: 512 };
  if (model.startsWith('claude-haiku-4-5')) return { minCacheTokens: 4096 };
  if (model.startsWith('gemini-')) return { geminiThinkingLevel: 'low', minMaxTokens: 4096 };
  return {};
}

const SHORT_NAMES: Record<string, string> = Object.fromEntries(
  Object.values(FALLBACK_MODELS)
    .flat()
    .map((m) => [m.id, m.displayName]),
);

export function shortModelName(id: string): string {
  return SHORT_NAMES[id] ?? id;
}

export const API_KEY_LINKS: Record<ProviderId, string> = {
  anthropic: 'https://console.anthropic.com/settings/keys',
  gemini: 'https://aistudio.google.com/apikey',
};

export const PROVIDER_NAMES: Record<ProviderId, string> = {
  anthropic: 'Anthropic (Claude)',
  gemini: 'Google Gemini',
};
