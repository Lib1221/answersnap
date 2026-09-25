import type { Rect } from '@/storage/schema';
import { elementRect, intersects, mostlyInside, toRect } from './geometry';
import type { VisibilityChecker } from './hiddenText';

export const PAGE_TEXT_CAP = 4000;
const SKIP_TAGS = new Set([
  'SCRIPT',
  'STYLE',
  'NOSCRIPT',
  'TEMPLATE',
  'SELECT',
  'OPTION',
  'TEXTAREA',
  'DATALIST',
]);
const MAX_NODES = 20000;

export function collapse(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/** Walks text nodes in document order, descending into open shadow roots. */
export function walkTextNodes(
  root: Node,
  visit: (node: Text) => void,
  skip?: Element | null,
): void {
  let count = 0;
  const walk = (start: Node) => {
    const doc = start.ownerDocument ?? (start as Document);
    const tw = doc.createTreeWalker(start, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode(n) {
        if (
          n.nodeType === Node.ELEMENT_NODE &&
          (SKIP_TAGS.has((n as Element).tagName) || n === skip)
        ) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    for (let n = tw.nextNode(); n && count < MAX_NODES; n = tw.nextNode()) {
      count++;
      if (n.nodeType === Node.TEXT_NODE) {
        if (n.nodeValue && n.nodeValue.trim()) visit(n as Text);
      } else {
        const shadow = (n as Element).shadowRoot;
        if (shadow) walk(shadow);
      }
    }
  };
  walk(root);
}

/** Visible text inside an element, skipping hidden descendants and form control internals. */
export function visibleTextOf(el: Element, checker: VisibilityChecker, max = 300): string {
  const parts: string[] = [];
  walkTextNodes(el, (node) => {
    const parent = node.parentElement;
    if (parent && checker.isVisible(parent)) parts.push(node.nodeValue ?? '');
  });
  return collapse(parts.join(' ')).slice(0, max);
}

function textRects(node: Text): Rect[] {
  const range = node.ownerDocument.createRange();
  range.selectNodeContents(node);
  return Array.from(range.getClientRects(), toRect).filter((r) => r.w > 0 || r.h > 0);
}

/** Box of the nearest ancestor that has one; used for text nodes without client rects. */
function nearestBox(el: Element | null): Rect | null {
  for (let a = el; a; a = a.parentElement) {
    const r = elementRect(a);
    if (r.w > 0 && r.h > 0) return r;
  }
  return null;
}

export interface VisibleTextResult {
  text: string;
  hiddenTextChars: number;
}

interface Piece {
  text: string;
  top: number;
  height: number;
}

function controlLabel(el: HTMLInputElement, checker: VisibilityChecker): string {
  const fromLabels = Array.from(el.labels ?? [], (l) => visibleTextOf(l, checker)).find(Boolean);
  if (fromLabels) return fromLabels;
  const aria = el.getAttribute('aria-label');
  if (aria) return collapse(aria);
  return el.value && el.value !== 'on' ? collapse(el.value) : '';
}

/** Extra lines describing the form controls inside the region (spec 9.5 step 5). */
function controlLines(
  root: Document,
  sel: Rect,
  checker: VisibilityChecker,
  already: string,
): string[] {
  const lines: string[] = [];
  const seen = new Set<string>();
  const add = (line: string) => {
    if (line && !seen.has(line)) {
      seen.add(line);
      lines.push(line);
    }
  };
  for (const el of root.querySelectorAll('input, textarea, select')) {
    const r = elementRect(el);
    const box = r.w > 0 && r.h > 0 ? r : nearestBox(el);
    if (!box || !intersects(box, sel)) continue;
    if (el instanceof HTMLInputElement && (el.type === 'radio' || el.type === 'checkbox')) {
      const label = controlLabel(el, checker);
      if (label) add(`Option: ${label}`);
      continue;
    }
    if (el instanceof HTMLInputElement && el.type === 'hidden') continue;
    if (!checker.isVisible(el)) continue;
    const field = el as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
    const label = Array.from(field.labels ?? [], (l) => visibleTextOf(l, checker)).find(Boolean);
    if (label && !already.includes(label)) add(`Label: ${label}`);
    const placeholder = 'placeholder' in field ? collapse(field.placeholder ?? '') : '';
    if (placeholder) add(`Placeholder: ${placeholder}`);
    if (field instanceof HTMLSelectElement) {
      for (const opt of field.options) {
        const t = collapse(opt.text);
        if (t) add(`Option: ${t}`);
      }
    }
  }
  return lines;
}

/**
 * Text a person can see inside `sel` (viewport CSS px), in document order (spec 9.5).
 * Text inside the region that isn't visible is left out and counted in `hiddenTextChars`.
 */
export function extractVisibleText(
  sel: Rect,
  checker: VisibilityChecker,
  opts: { root?: Document; skip?: Element | null; cap?: number } = {},
): VisibleTextResult {
  const root = opts.root ?? document;
  const pieces: Piece[] = [];
  let hiddenTextChars = 0;

  walkTextNodes(
    root.body ?? root.documentElement,
    (node) => {
      const parent = node.parentElement;
      if (!parent) return;
      const rects = textRects(node);
      let inRegion: boolean;
      let first: Rect | undefined;
      if (rects.length > 0) {
        first = rects.find((r) => mostlyInside(r, sel));
        inRegion = first !== undefined;
      } else {
        // No layout box (display: none and friends): judge by the nearest ancestor that has one.
        const box = nearestBox(parent);
        inRegion = box !== null && mostlyInside(box, sel);
      }
      if (!inRegion) return;
      const value = collapse(node.nodeValue ?? '');
      if (!first || !checker.isVisible(parent)) {
        hiddenTextChars += value.length;
        return;
      }
      pieces.push({ text: value, top: first.y, height: first.h });
    },
    opts.skip,
  );

  let text = '';
  let prev: Piece | null = null;
  for (const p of pieces) {
    if (prev) {
      const lineHeight = Math.max(prev.height, p.height, 1);
      text += Math.abs(p.top - prev.top) > 0.6 * lineHeight ? '\n' : ' ';
    }
    text += p.text;
    prev = p;
  }

  const extra = controlLines(root, sel, checker, text);
  if (extra.length) text += (text ? '\n' : '') + extra.join('\n');

  text = text
    .split('\n')
    .map((l) => collapse(l))
    .filter(Boolean)
    .join('\n');
  return { text: text.slice(0, opts.cap ?? PAGE_TEXT_CAP), hiddenTextChars };
}
