import type { InsertMode, InsertResult } from '@/capture/insert';
import type { FieldInfo, PageInfo, Rect, Size, SnipMode } from '@/storage/schema';

// One typed protocol for every context (spec 8). Payload fields sit directly on the message.

/** A file upload on the page: the extension can't attach files, so it lists them as a checklist. */
export interface UploadInfo {
  label: string;
  accept?: string;
  required?: boolean;
}

export type StartSnipError = 'NEEDS_GESTURE' | 'RESTRICTED_PAGE' | 'INJECT_FAILED';

export interface MessageMap {
  START_SNIP: {
    msg: { type: 'START_SNIP'; tabId: number; mode: SnipMode };
    reply: { ok: true } | { ok: false; error: StartSnipError };
  };
  BEGIN_SELECTION: {
    msg: { type: 'BEGIN_SELECTION'; captureId: string; mode: SnipMode };
    reply: { ok: true };
  };
  /** Panel asks the page to drop the overlay (Esc pressed while the panel has focus). */
  CANCEL_SELECTION: {
    msg: { type: 'CANCEL_SELECTION' };
    reply: { ok: true };
  };
  REGION_SELECTED: {
    msg: {
      type: 'REGION_SELECTED';
      captureId: string;
      rect: Rect;
      viewport: Size;
      pageText: string;
      hiddenTextChars: number;
      candidates: FieldInfo[];
      page: PageInfo;
      /** Rect to outline instead of the selection ("Answer this field" outlines the field). */
      outline?: Rect;
    };
    reply: { ok: true };
  };
  SELECTION_CANCELLED: {
    msg: { type: 'SELECTION_CANCELLED'; captureId: string };
    reply: void;
  };
  INSERT_ANSWER: {
    msg: { type: 'INSERT_ANSWER'; targetId: string; text: string; mode: InsertMode };
    reply: InsertResult;
  };
  APPLY_CHOICE: {
    msg: { type: 'APPLY_CHOICE'; targetId: string; labels: string[] };
    reply: InsertResult;
  };
  HIGHLIGHT_FIELD: {
    msg: { type: 'HIGHLIGHT_FIELD'; targetId: string; on: boolean };
    reply: void;
  };
  PICK_FIELD: {
    msg: { type: 'PICK_FIELD' };
    reply: FieldInfo | null;
  };
  /** "Fill form": every visible field on the page. */
  SCAN_FORM: {
    /** `max`: how many fields to return (Fill form keeps the default; Scholarship asks for more). */
    msg: { type: 'SCAN_FORM'; max?: number };
    reply: { page: PageInfo; fields: FieldInfo[]; uploads?: UploadInfo[] };
  };
  /** Is a capture runtime listening in this tab? */
  PING: {
    msg: { type: 'PING' };
    reply: { ok: true };
  };
  /** Panel asks the SW to (re)inject the capture script before messaging the page. */
  ENSURE_CAPTURE: {
    msg: { type: 'ENSURE_CAPTURE'; tabId: number };
    reply: { ok: true } | { ok: false; error: StartSnipError };
  };
  READ_PAGE_TEXT: {
    msg: { type: 'READ_PAGE_TEXT'; scope: 'selection' | 'page' | 'job' };
    reply: { title: string; text: string; url: string };
  };
  /** Test-only, compiled out of production (spec 16.2). */
  E2E_START_SNIP: {
    msg: { type: 'E2E_START_SNIP'; tabId: number; mode?: SnipMode };
    reply: { ok: true } | { ok: false; error: StartSnipError };
  };
  /** Test-only: run the "Fill this form" menu action on a tab. */
  E2E_FILL_FORM: {
    msg: { type: 'E2E_FILL_FORM'; tabId: number };
    reply: { ok: true };
  };
  /** Test-only: run the "Use selection as job post" menu action on a tab. */
  E2E_JOB_SELECTION: {
    msg: { type: 'E2E_JOB_SELECTION'; tabId: number };
    reply: { ok: true };
  };
  /** Test-only: run the "Import this page" menu action on a tab. */
  E2E_IMPORT_PAGE: {
    msg: { type: 'E2E_IMPORT_PAGE'; tabId: number };
    reply: { ok: true };
  };
}

export type MessageType = keyof MessageMap;
export type Message<T extends MessageType = MessageType> = MessageMap[T]['msg'];
export type Reply<T extends MessageType> = MessageMap[T]['reply'];

export type AnyMessage = { [T in MessageType]: MessageMap[T]['msg'] }[MessageType];

export function isMessage(value: unknown): value is AnyMessage {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { type?: unknown }).type === 'string'
  );
}
