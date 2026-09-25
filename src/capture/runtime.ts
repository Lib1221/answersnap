import { createRouter } from '@/messaging/send';
import type { Message } from '@/messaging/protocol';
import type { PageInfo, SnipMode } from '@/storage/schema';
import { findCandidates, resolveTarget } from './fields';
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
      beginSelection(msg.captureId, msg.mode);
      return { ok: true };
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
