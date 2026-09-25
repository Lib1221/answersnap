import type { FieldInfo, PageInfo, Rect, Size, SnipMode } from '@/storage/schema';

// One typed protocol for every context (spec 8). Payload fields sit directly on the message.

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
    };
    reply: { ok: true };
  };
  SELECTION_CANCELLED: {
    msg: { type: 'SELECTION_CANCELLED'; captureId: string };
    reply: void;
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
