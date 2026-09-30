import type { DialogInfo } from '@/storage/schema';
import type { VisibilityChecker } from './hiddenText';
import { collapse } from './visibleText';

// A form in a modal window (LinkedIn's Easy Apply, most ATS "apply" dialogs): the window is what
// the user is filling, so the scan stays inside it and never drafts the page behind. Read only:
// nothing here clicks.

const DIALOG = 'dialog[open], [role="dialog"], [role="alertdialog"], [aria-modal="true"]';
const FIELD = 'input:not([type="hidden"]), textarea, select, [role="textbox"], [role="radio"]';
/** Consent banners are dialogs with checkboxes too: never mistake one for the form. */
const BANNER = /\b(cookies?|consent preferences|privacy (settings|preferences|choices))\b/i;

/** The document and every open shadow root below it (LinkedIn hosts the dialog in one). */
function roots(root: Document | ShadowRoot, out: (Document | ShadowRoot)[] = []) {
  out.push(root);
  for (const el of root.querySelectorAll('*')) if (el.shadowRoot) roots(el.shadowRoot, out);
  return out;
}

function hasVisibleField(dialog: Element, checker: VisibilityChecker): boolean {
  const stack: ParentNode[] = [dialog];
  while (stack.length) {
    const node = stack.pop()!;
    for (const el of node.querySelectorAll('*')) {
      if (el.shadowRoot) stack.push(el.shadowRoot);
      if (!el.matches(FIELD)) continue;
      // Styled choices hide the input and show its label.
      const shown =
        checker.isVisible(el) ||
        Array.from((el as HTMLInputElement).labels ?? []).some((l) => checker.isVisible(l));
      if (shown) return true;
    }
  }
  return false;
}

/** The top open window that holds a form, or null (then the whole page is the form). */
export function openDialog(doc: Document, checker: VisibilityChecker): Element | null {
  let found: Element | null = null;
  for (const root of roots(doc))
    for (const el of root.querySelectorAll(DIALOG)) {
      if (el.closest('[aria-hidden="true"]') || !el.getClientRects().length) continue;
      if (BANNER.test(collapse(el.textContent ?? '').slice(0, 400))) continue;
      // A window inside another (a confirm over the form) wins only if it holds fields itself.
      if (hasVisibleField(el, checker)) found = el;
    }
  return found;
}

/** What the window says about the step: its heading, progress, and whether Submit is showing. */
export function dialogInfo(dialog: Element): DialogInfo {
  const text = (el: Element | null) => collapse(el?.textContent ?? '').slice(0, 120);
  const heading =
    text(dialog.querySelector('form h3, form h2')) || text(dialog.querySelector('h2, h3, h1'));
  const bar = dialog.querySelector('[aria-valuenow]');
  const progress = bar ? Number(bar.getAttribute('aria-valuenow')) : NaN;
  const final = Array.from(dialog.querySelectorAll('button')).some((b) =>
    /\bsubmit\b/i.test(`${b.textContent ?? ''} ${b.getAttribute('aria-label') ?? ''}`),
  );
  return {
    ...(heading ? { heading } : {}),
    ...(Number.isFinite(progress) ? { progress: Math.round(progress) } : {}),
    ...(final ? { final } : {}),
  };
}
