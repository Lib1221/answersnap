import { DEFAULT_PRICES, defaultModel } from './models';
import { SettingsSchema, type Provider, type Settings } from '@/storage/schema';

/** Default style rules (spec 11.6). Editable in settings. */
export const DEFAULT_STYLE_RULES = [
  'Sound like a real person writing to a hiring manager. Plain words and specific details.',
  "Answer in the first sentence. Don't restate the question.",
  'No em dashes or en dashes. Use periods, commas, or parentheses.',
  'No filler openers or closers like "I am excited to", "I hope this finds you well", "Thank you for considering".',
  'Avoid: passionate, leverage, synergy, dynamic, results-driven, spearheaded, delve, tapestry, cutting-edge, seamless, innovative, thrilled.',
  'No strings of three adjectives. No "not only X but also Y". No "It\'s not about X, it\'s about Y".',
  'One concrete example (a project, a number, a tool) from the candidate data beats general claims.',
  'Vary sentence length. Short sentences are fine.',
  'No markdown and no bullet points unless the field clearly expects a list.',
];

/** Mock LLM server used by the e2e build (spec 16.2). */
export const E2E_BASE_URL = 'http://127.0.0.1:4620';

export function defaultSettings(provider: Provider = 'anthropic'): Settings {
  return SettingsSchema.parse({
    provider,
    model: defaultModel(provider, 'default'),
    fastModel: defaultModel(provider, 'fast'),
    styleRules: DEFAULT_STYLE_RULES,
    prices: DEFAULT_PRICES,
    // import.meta.env is undefined outside Vite (the eval runner runs in plain Node).
    baseUrl: import.meta.env?.MODE === 'e2e' ? E2E_BASE_URL : undefined,
  });
}
