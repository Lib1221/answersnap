// Inserting answers into page fields (spec 12). Runs only after the user clicks Insert.

export type InsertMode = 'replace' | 'append';
export type InsertFailure = 'TARGET_GONE' | 'NOT_FILLABLE' | 'VERIFY_FAILED' | 'IN_IFRAME';
export type InsertResult =
  | { ok: true; method: 'native-setter' | 'exec-command' | 'paste' | 'paragraphs' }
  | { ok: false; reason: InsertFailure };

export function normalizeWs(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

type TextControl = HTMLInputElement | HTMLTextAreaElement;

/**
 * The native value setter plus a bubbling input event works with React, Vue, and Angular
 * controlled inputs (their wrappers listen for `input`).
 */
export function setNativeValue(el: TextControl, value: string): void {
  const proto =
    el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

function insertIntoControl(el: TextControl, text: string, mode: InsertMode): InsertResult {
  // Single-line inputs can't hold newlines.
  const value = el instanceof HTMLInputElement ? text.replace(/\s*\n+\s*/g, ' ') : text;
  let next = value;
  if (mode === 'append' && el.value) {
    const sep = el instanceof HTMLInputElement ? ' ' : el.value.endsWith('\n') ? '' : '\n\n';
    next = `${el.value}${sep}${value}`;
  }
  el.focus();
  setNativeValue(el, next);
  el.blur();
  return normalizeWs(el.value) === normalizeWs(next)
    ? { ok: true, method: 'native-setter' }
    : { ok: false, reason: 'VERIFY_FAILED' };
}

function editorText(el: HTMLElement): string {
  return normalizeWs(el.innerText ?? el.textContent ?? '');
}

function selectContents(el: HTMLElement, collapseToEnd: boolean) {
  const range = el.ownerDocument.createRange();
  range.selectNodeContents(el);
  if (collapseToEnd) range.collapse(false);
  const sel = el.ownerDocument.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);
}

/** Paste event with text/plain, which editors like Quill, ProseMirror, and Lexical handle. */
function syntheticPaste(el: HTMLElement, text: string): void {
  const dt = new DataTransfer();
  dt.setData('text/plain', text);
  el.dispatchEvent(
    new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }),
  );
}

function execInsert(el: HTMLElement, text: string): void {
  // Deprecated, but still the most reliable path through editors' beforeinput handling.
  el.ownerDocument.execCommand('insertText', false, text);
}

/** Paragraph by paragraph, for editors that collapse newlines from a single insertText. */
function execParagraphs(el: HTMLElement, text: string): void {
  const paragraphs = text.split(/\n+/);
  paragraphs.forEach((p, i) => {
    if (i > 0) el.ownerDocument.execCommand('insertParagraph');
    if (p) el.ownerDocument.execCommand('insertText', false, p);
  });
}

async function insertIntoEditor(
  el: HTMLElement,
  text: string,
  mode: InsertMode,
): Promise<InsertResult> {
  const before = editorText(el);
  const expected = normalizeWs(mode === 'append' && before ? `${before} ${text}` : text);
  const matches = () => editorText(el) === expected;
  const multiParagraph = /\n/.test(text.trim());
  const prepare = () => {
    el.focus();
    selectContents(el, mode === 'append');
  };

  prepare();
  execInsert(el, text);
  await nextFrame();
  if (matches()) {
    // Some editors drop the line breaks; redo paragraph by paragraph.
    if (multiParagraph && !/\n/.test((el.innerText ?? '').trim())) {
      prepare();
      execParagraphs(el, text);
      await nextFrame();
      if (matches()) return { ok: true, method: 'paragraphs' };
    }
    return { ok: true, method: 'exec-command' };
  }

  // Appending twice would duplicate text; let the panel fall back to copy.
  if (mode === 'append' && editorText(el) !== before) return { ok: false, reason: 'VERIFY_FAILED' };
  // The editor ignored execCommand: paste over the same selection instead.
  prepare();
  syntheticPaste(el, text);
  await nextFrame();
  if (matches()) return { ok: true, method: 'paste' };
  return { ok: false, reason: 'VERIFY_FAILED' };
}

function nextFrame(): Promise<void> {
  return new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
}

/** Topmost editable host for a contenteditable element. */
export function editingHost(el: Element): HTMLElement | null {
  if (!(el instanceof HTMLElement) || !el.isContentEditable) return null;
  let host: HTMLElement = el;
  while (host.parentElement?.isContentEditable) host = host.parentElement;
  return host;
}

export async function insertText(
  el: Element | null,
  text: string,
  mode: InsertMode,
): Promise<InsertResult> {
  if (!el || !el.isConnected) return { ok: false, reason: 'TARGET_GONE' };
  if (el.tagName === 'IFRAME' || el.tagName === 'FRAME') return { ok: false, reason: 'IN_IFRAME' };
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    if (el.disabled || el.readOnly) return { ok: false, reason: 'NOT_FILLABLE' };
    return insertIntoControl(el, text, mode);
  }
  const host =
    editingHost(el) ?? (el.getAttribute('role') === 'textbox' ? (el as HTMLElement) : null);
  if (!host) return { ok: false, reason: 'NOT_FILLABLE' };
  const result = await insertIntoEditor(host, text, mode);
  // Blur after, like inputs: a still-focused editor would win the next snip's field detection.
  host.ownerDocument.getSelection()?.removeAllRanges();
  host.blur();
  return result;
}
