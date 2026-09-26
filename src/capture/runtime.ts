import { createRouter } from '@/messaging/send';
import type { Message } from '@/messaging/protocol';
import type { PageInfo, SnipMode } from '@/storage/schema';
import {
  collectFillable,
  describeField,
  findCandidates,
  resolveTarget,
  scanForm,
  scanUploads,
} from './fields';
import { clampRect, elementRect } from './geometry';
import { applyChoice } from './choice';
import { insertText } from './insert';
import { flash, pickField, setHighlight } from './picker';
import { createVisibilityChecker } from './hiddenText';
import { mountOverlay, type OverlayHandle } from './overlay';
import { readPageText } from './pageImport';
import { extractVisibleText } from './visibleText';

let overlay: OverlayHandle | null = null;
let currentCaptureId: string | null = null;

/** Focused element, following open shadow roots. */
export function deepActiveElement(doc: Document = document): Element | null {
  let a: Element | null = doc.activeElement;
  while (a?.shadowRoot?.activeElement) a = a.shadowRoot.activeElement;
  return a === doc.body ? null : a;
}

export function pageInfo(): PageInfo {
  return {
    title: document.title.slice(0, 300),
    hostname: location.hostname,
    path: location.pathname,
    lang: document.documentElement.lang || null,
  };
}

/** Two animation frames plus 50 ms, so the removed overlay is never in the screenshot. */
function afterRepaint(): Promise<void> {
  return new Promise((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 50))),
  );
}

function teardown() {
  overlay?.unmount();
  overlay = null;
}

function send(msg: Message<'REGION_SELECTED'> | Message<'SELECTION_CANCELLED'>) {
  browser.runtime
    .sendMessage(msg)
    .catch((err: unknown) => console.warn('[AnswerSnap] send failed', err));
}

/**
 * "Answer this field" (spec 3.3): the right-clicked field is focused. Capture from 200 px above
 * it to 40 px below it, outline the field, and take the question from its label.
 */
async function answerField(captureId: string) {
  const checker = createVisibilityChecker();
  const active = deepActiveElement();
  const field = collectFillable(document, checker).find(
    (f) =>
      f.el === active ||
      f.members.includes(active as HTMLInputElement) ||
      (f.kind === 'contenteditable' && !!active && f.el.contains(active)),
  );
  const viewport = { w: window.innerWidth, h: window.innerHeight };
  if (!field) {
    // Nothing fillable is focused: fall back to a normal snip.
    beginSelection(captureId, 'question');
    return;
  }
  const box = field.members.length ? field.rect : elementRect(field.el);
  const region = clampRect(
    { x: box.x - 40, y: box.y - 200, w: box.w + 80, h: box.h + 240 },
    viewport,
  );
  const info = describeField(field, 'focused', checker);
  const { text, hiddenTextChars } = extractVisibleText(region, checker);
  const pageText = info.label && !text.includes(info.label) ? `${info.label}\n${text}` : text;
  await afterRepaint();
  send({
    type: 'REGION_SELECTED',
    captureId,
    rect: region,
    viewport,
    pageText,
    hiddenTextChars,
    candidates: [info],
    page: pageInfo(),
    outline: clampRect(box, viewport),
  });
}

function beginSelection(captureId: string, mode: SnipMode) {
  const cancelled = currentCaptureId;
  teardown();
  if (cancelled && cancelled !== captureId)
    send({ type: 'SELECTION_CANCELLED', captureId: cancelled });

  currentCaptureId = captureId;
  const activeAtStart = deepActiveElement();
  const checker = createVisibilityChecker();

  overlay = mountOverlay(mode, checker, {
    onSelect: async (rect) => {
      const host = overlay?.host ?? null;
      // Job posts and imports can be long; questions keep the 4,000 character cap (spec 9.5).
      const cap = mode === 'job' || mode === 'import' ? 20_000 : undefined;
      const { text, hiddenTextChars } = extractVisibleText(rect, checker, { skip: host, cap });
      const candidates = findCandidates(rect, activeAtStart, checker);
      const viewport = { w: window.innerWidth, h: window.innerHeight };
      teardown();
      currentCaptureId = null;
      await afterRepaint();
      send({
        type: 'REGION_SELECTED',
        captureId,
        rect,
        viewport,
        pageText: text,
        hiddenTextChars,
        candidates,
        page: pageInfo(),
      });
    },
    onCancel: () => {
      teardown();
      currentCaptureId = null;
      send({ type: 'SELECTION_CANCELLED', captureId });
    },
  });
}

export function startCaptureRuntime(): void {
  createRouter({
    BEGIN_SELECTION: (msg) => {
      if (msg.mode === 'field') void answerField(msg.captureId);
      else beginSelection(msg.captureId, msg.mode);
      return { ok: true };
    },
    PING: () => ({ ok: true }),
    SCAN_FORM: (msg) => {
      const checker = createVisibilityChecker();
      return {
        page: pageInfo(),
        fields: scanForm(document, checker, msg.max),
        uploads: scanUploads(document, checker),
      };
    },
    READ_PAGE_TEXT: (msg) => readPageText(msg.scope),
    // Only ever runs after the user clicks Insert in the panel (hard rule 5).
    INSERT_ANSWER: async (msg) => {
      setHighlight(msg.targetId, false);
      const el = resolveTarget(msg.targetId);
      const result = await insertText(el, msg.text, msg.mode);
      if (result.ok && el) flash(el);
      return result;
    },
    APPLY_CHOICE: (msg) => {
      setHighlight(msg.targetId, false);
      const el = resolveTarget(msg.targetId);
      const result = applyChoice(el, msg.labels);
      if (result.ok && el) flash(el.closest('fieldset, [role="radiogroup"], [role="group"]') ?? el);
      return result;
    },
    HIGHLIGHT_FIELD: (msg) => setHighlight(msg.targetId, msg.on),
    PICK_FIELD: () => pickField(),
    CANCEL_SELECTION: () => {
      const id = currentCaptureId;
      teardown();
      currentCaptureId = null;
      if (id) send({ type: 'SELECTION_CANCELLED', captureId: id });
      return { ok: true };
    },
  });
}
