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
