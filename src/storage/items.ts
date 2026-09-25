import { storage } from 'wxt/utils/storage';
import type { z } from 'zod';
import {
  CaptureStatusSchema,
  PendingCaptureSchema,
  type CaptureStatus,
  type PendingCapture,
} from './schema';

// storage.session is only readable by extension pages and the SW (default access level).

export const pendingCaptureItem = storage.defineItem<PendingCapture>('session:pendingCapture');
export const captureStatusItem = storage.defineItem<CaptureStatus>('session:captureStatus');

/** Parse a raw stored value; invalid data reads as null. */
export function parseOrNull<S extends z.ZodType>(schema: S, value: unknown): z.infer<S> | null {
  if (value == null) return null;
  const result = schema.safeParse(value);
  if (!result.success) {
    console.warn('[AnswerSnap] dropped invalid stored value', result.error.issues.slice(0, 3));
    return null;
  }
  return result.data;
}

export async function readCaptureStatus(): Promise<CaptureStatus | null> {
  return parseOrNull(CaptureStatusSchema, await captureStatusItem.getValue());
}

/** Reads and deletes the pending capture (it must not outlive one read, hard rule 3). */
export async function takePendingCapture(): Promise<PendingCapture | null> {
  const raw = await pendingCaptureItem.getValue();
  if (raw == null) return null;
  await pendingCaptureItem.removeValue();
  return parseOrNull(PendingCaptureSchema, raw);
}
