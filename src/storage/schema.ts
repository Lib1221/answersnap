import { z } from 'zod';

// Shared data model (spec 7.2). Types are inferred from the zod schemas so every
// storage read can be validated with the same definition.

export const SnipModeSchema = z.enum(['question', 'field', 'job', 'import']);
export type SnipMode = z.infer<typeof SnipModeSchema>;

export const RectSchema = z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() });
export type Rect = z.infer<typeof RectSchema>;

export const SizeSchema = z.object({ w: z.number(), h: z.number() });
export type Size = z.infer<typeof SizeSchema>;

export const FieldKindSchema = z.enum([
  'input',
  'textarea',
  'contenteditable',
  'select',
  'radio-group',
  'checkbox-group',
]);
export type FieldKind = z.infer<typeof FieldKindSchema>;

export const FieldInfoSchema = z.object({
  targetId: z.string(),
  kind: FieldKindSchema,
  inputType: z.string().optional(),
  maxLength: z.number().optional(),
  minLength: z.number().optional(),
  required: z.boolean().optional(),
  placeholder: z.string().optional(),
  label: z.string().optional(),
  hint: z.string().optional(),
  currentValue: z.string().optional(),
  options: z.array(z.string()).optional(),
  inIframe: z.boolean().optional(),
  confidence: z.enum(['focused', 'inside', 'below', 'right', 'picked']),
});
export type FieldInfo = z.infer<typeof FieldInfoSchema>;

export const PageInfoSchema = z.object({
  title: z.string(),
  hostname: z.string(),
  path: z.string(),
  lang: z.string().nullable(),
});
export type PageInfo = z.infer<typeof PageInfoSchema>;

export const CapturedImageSchema = z.object({
  dataUrl: z.string(),
  mediaType: z.enum(['image/png', 'image/jpeg']),
  width: z.number(),
  height: z.number(),
  outlined: z.boolean(),
});
export type CapturedImage = z.infer<typeof CapturedImageSchema>;

export const PendingCaptureSchema = z.object({
  id: z.string(),
  createdAt: z.number(),
  mode: SnipModeSchema,
  tabId: z.number(),
  windowId: z.number(),
  image: CapturedImageSchema.optional(),
  pageText: z.string(),
  hiddenTextChars: z.number(),
  page: PageInfoSchema,
  field: FieldInfoSchema.optional(),
  candidates: z.array(FieldInfoSchema),
});
export type PendingCapture = z.infer<typeof PendingCaptureSchema>;

export const CaptureErrorCodeSchema = z.enum([
  'RESTRICTED_PAGE',
  'NEEDS_GESTURE',
  'CAPTURE_FAILED',
  'INJECT_FAILED',
]);
export type CaptureErrorCode = z.infer<typeof CaptureErrorCodeSchema>;

/**
 * Progress of the current snip, written by the service worker. The panel may open in the
 * same gesture that starts the snip, so it reads this on mount instead of relying on a
 * runtime message it could miss (see DECISIONS.md).
 */
export const CaptureStatusSchema = z.object({
  captureId: z.string(),
  state: z.enum(['selecting', 'capturing', 'done', 'cancelled', 'error']),
  mode: SnipModeSchema,
  tabId: z.number(),
  windowId: z.number(),
  code: CaptureErrorCodeSchema.optional(),
  updatedAt: z.number(),
});
export type CaptureStatus = z.infer<typeof CaptureStatusSchema>;

// ---------------------------------------------------------------------------------------------
// Settings (spec 7.2, plus the Gemini provider). Every field has a default so older or partial
// stored objects still parse.

export const ProviderSchema = z.enum(['anthropic', 'gemini']);
export type Provider = z.infer<typeof ProviderSchema>;
export const ToneSchema = z.enum(['professional', 'friendly', 'concise']);
export type Tone = z.infer<typeof ToneSchema>;
export const LengthPrefSchema = z.enum(['auto', 'short', 'medium', 'long']);
export type LengthPref = z.infer<typeof LengthPrefSchema>;

export const ModelPriceSchema = z.object({
  input: z.number(),
  output: z.number(),
  cacheRead: z.number(),
  cacheWrite5m: z.number(),
});
export type ModelPrice = z.infer<typeof ModelPriceSchema>;

export const SettingsSchema = z.object({
  schemaVersion: z.literal(1).default(1),
  provider: ProviderSchema.default('anthropic'),
  apiKeyStorage: z.enum(['local', 'session']).default('local'),
  model: z.string().default(''),
  fastModel: z.string().default(''),
  maxOutputTokens: z.number().int().positive().default(1024),
  tone: ToneSchema.default('professional'),
  length: LengthPrefSchema.default('auto'),
  answerLanguage: z.string().default('auto'),
  styleRules: z.array(z.string()).default([]),
  sendScreenshot: z.boolean().default(true),
  contextPadding: z.boolean().default(true),
  prewarmCache: z.boolean().default(true),
  history: z
    .object({
      enabled: z.boolean().default(true),
      retentionDays: z.number().int().positive().default(180),
    })
    .default({ enabled: true, retentionDays: 180 }),
  prices: z.record(z.string(), ModelPriceSchema).default({}),
  /** Gemini free tier: no charge, but Google may use requests to improve its products. */
  geminiFreeTier: z.boolean().default(true),
  /** Check every drafted answer's sentences against the candidate data. */
  factCheck: z.boolean().default(true),
  /** Which model checks: the fast model (cheap, separate quota) or the answer model (stricter). */
  factCheckModel: z.enum(['fast', 'main']).default('fast'),
  /**
   * Answer confidently: never admit a gap, claim modest experience for skills the data doesn't
   * show (listed as "Assumed" in the notes). On by default (Liben's call); "Stick to my profile"
   * in settings turns it off.
   */
  fillGaps: z.boolean().default(true),
  /** A Chrome notification when a tracked application has gone quiet. */
  followUpReminders: z.boolean().default(true),
  /** When a model runs out of quota, switch to the next one in its chain. */
  autoFallback: z.boolean().default(true),
  /** Model ids the key can use (from Test key), so fallback skips models the key can't reach. */
  availableModels: z.array(z.string()).default([]),
  baseUrl: z.string().optional(),
  onboardingDone: z.boolean().default(false),
});
export type Settings = z.infer<typeof SettingsSchema>;

export const KnowledgeSourceSchema = z.object({
  id: z.string(),
  kind: z.enum(['resume', 'website', 'tab', 'note', 'ai-transcript', 'cover-letter', 'story']),
  label: z.string(),
  url: z.string().optional(),
  fileName: z.string().optional(),
  text: z.string(),
  chars: z.number(),
  importedAt: z.string(),
  enabled: z.boolean(),
});
export type KnowledgeSource = z.infer<typeof KnowledgeSourceSchema>;
export const SourcesSchema = z.array(KnowledgeSourceSchema);

export const PendingImportSchema = z.object({
  url: z.string(),
  title: z.string(),
  text: z.string(),
  tabId: z.number(),
  createdAt: z.number(),
  /** Chrome refused or the page didn't answer; empty text alone can mean a canvas-only page. */
  failed: z.boolean().default(false),
});
export type PendingImport = z.infer<typeof PendingImportSchema>;
