import { elementRect } from './geometry';
import type { VisibilityChecker } from './hiddenText';
import { collapse, visibleTextOf } from './visibleText';

const LABEL_MAX = 300;
const ABOVE_PX = 300;
const HINT_BELOW_PX = 60;
const FIELD_SELECTOR = 'input, textarea, select, [contenteditable], [role="textbox"]';

/** Elements an attribute points to by id, in the element's own document or shadow root. */
function byIds(el: Element, attr: string): HTMLElement[] {
  const ids = el.getAttribute(attr)?.split(/\s+/).filter(Boolean) ?? [];
  const root = el.getRootNode() as Document | ShadowRoot;
  const find = (id: string) =>
    ('getElementById' in root ? root.getElementById(id) : null) ??
    el.ownerDocument.getElementById(id);
  return ids.map(find).filter((n): n is HTMLElement => n instanceof HTMLElement);
}

/** The form's own error message for a field: what its aria-describedby alert says. */
export function errorFor(el: Element): string | undefined {
  const text = [...byIds(el, 'aria-errormessage'), ...byIds(el, 'aria-describedby')]
    .filter(
      (n) =>
        n.matches('[role="alert"], [aria-live="assertive"]') || n.querySelector('[role="alert"]'),
    )
    .map((n) => collapse(n.textContent ?? ''))
    .filter(Boolean)
    .join(' ');
  return text ? text.slice(0, 200) : undefined;
}

function textFromIds(el: Element, attr: string, checker: VisibilityChecker): string {
  return collapse(
    byIds(el, attr)
      .map((n) => visibleTextOf(n, checker, LABEL_MAX))
      .join(' '),
  ).slice(0, LABEL_MAX);
}

function isFieldLike(el: Element): boolean {
  return el.matches(FIELD_SELECTOR) || el.querySelector(FIELD_SELECTOR) !== null;
}

/** Nearest visible text in previous siblings, then ancestors' previous siblings, within 300 px above. */
function precedingText(el: Element, checker: VisibilityChecker): string {
  const top = elementRect(el).y;
  let node: Element | null = el;
  for (let depth = 0; node && node !== el.ownerDocument.body && depth < 8; depth++) {
    for (let sib = node.previousSibling; sib; sib = sib.previousSibling) {
      if (sib.nodeType === Node.TEXT_NODE) {
        const t = collapse(sib.nodeValue ?? '');
        if (t && node.parentElement && checker.isVisible(node.parentElement))
          return t.slice(0, LABEL_MAX);
        continue;
      }
      if (!(sib instanceof Element)) continue;
      const r = elementRect(sib);
      if (r.y > top + 4) continue; // not above
      if (top - (r.y + r.h) > ABOVE_PX) return '';
      if (isFieldLike(sib) && !sib.matches('label')) continue;
      const t = visibleTextOf(sib, checker, LABEL_MAX);
      if (t) return t;
    }
    node = node.parentElement;
  }
  return '';
}

/**
 * Label for a field or group container (spec 9.7), first non-empty wins: `labels`,
 * `aria-labelledby`, `aria-label`, fieldset legend, preceding text within 300 px, placeholder.
 */
export function labelFor(el: Element, checker: VisibilityChecker): string | undefined {
  const labelled = el as Partial<HTMLInputElement>;
  const fromLabels = Array.from(labelled.labels ?? [], (l) =>
    visibleTextOf(l, checker, LABEL_MAX),
  ).find(Boolean);
  if (fromLabels) return fromLabels;

  const byIds = textFromIds(el, 'aria-labelledby', checker);
  if (byIds) return byIds;

  const aria = collapse(el.getAttribute('aria-label') ?? '');
  if (aria) return aria.slice(0, LABEL_MAX);

  const legend = el.closest('fieldset')?.querySelector(':scope > legend');
  const legendText = legend ? visibleTextOf(legend, checker, LABEL_MAX) : '';
  if (legendText) return legendText;

  const before = precedingText(el, checker);
  if (before) return before;

  const placeholder = collapse(
    el.getAttribute('placeholder') ?? el.getAttribute('aria-placeholder') ?? '',
  );
  return placeholder || undefined;
}

/** Helper text for a field: aria-describedby, else text within 60 px below it (counters like "0/1000"). */
export function hintFor(el: Element, checker: VisibilityChecker): string | undefined {
  const described = textFromIds(el, 'aria-describedby', checker);
  if (described) return described;

  const bottom = elementRect(el).y + elementRect(el).h;
  let node: Element | null = el;
  for (let depth = 0; node && depth < 2; depth++) {
    for (let sib = node.nextElementSibling; sib; sib = sib.nextElementSibling) {
      const r = elementRect(sib);
      if (r.y < bottom - 4) continue;
      if (r.y - bottom > HINT_BELOW_PX) break;
      if (isFieldLike(sib)) break;
      // A label, legend, or heading below the field belongs to what comes next, not to this one.
      if (
        sib.matches('label, legend, fieldset, h1, h2, h3, h4, h5, h6, [role="heading"]') ||
        sib.querySelector('label[for], legend, h1, h2, h3, h4, h5, h6')
      )
        break;
      const t = visibleTextOf(sib, checker, 200);
      if (t) return t;
    }
    node = node.parentElement;
  }
  return undefined;
}
