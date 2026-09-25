import type { FieldInfo, FieldKind, Rect } from '@/storage/schema';
import { center, distance, elementRect, intersects, union } from './geometry';
import type { VisibilityChecker } from './hiddenText';
import { hintFor, labelFor } from './labels';
import { collapse, visibleTextOf } from './visibleText';

const TEXT_INPUT_TYPES = new Set(['text', 'email', 'url', 'tel', 'number', 'search', '']);
export const MAX_CANDIDATES = 5;
const CURRENT_VALUE_CAP = 2000;

// ---------------------------------------------------------------------------------------------
// Registry: ids sent to the panel map back to live elements for insert and highlight.

const registry = new Map<string, WeakRef<Element>>();
const ids = new WeakMap<Element, string>();
let nextId = 1;

export function registerElement(el: Element): string {
  let id = ids.get(el);
  if (!id) {
    id = `f${nextId++}`;
    ids.set(el, id);
    registry.set(id, new WeakRef(el));
  }
  return id;
}

export function resolveTarget(id: string): Element | null {
  return registry.get(id)?.deref() ?? null;
}

// ---------------------------------------------------------------------------------------------
// Fillable elements (spec 9.7).

export interface Fillable {
  /** The element itself, or the first member for radio and checkbox groups. */
  el: Element;
  kind: FieldKind;
  members: HTMLInputElement[];
  rect: Rect;
  /** An iframe that may hold the field. v1 can't fill it; the panel falls back to copy. */
  inIframe?: boolean;
}

const MIN_IFRAME_W = 40;
const MIN_IFRAME_H = 20;

function queryAllDeep(
  root: Document | ShadowRoot,
  selector: string,
  out: Element[] = [],
): Element[] {
  for (const el of root.querySelectorAll('*')) {
    if (el.matches(selector)) out.push(el);
    if (el.shadowRoot) queryAllDeep(el.shadowRoot, selector, out);
  }
  return out;
}

function isEditable(el: Element): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el.isContentEditable) return true;
  const attr = el.getAttribute('contenteditable');
  return attr === '' || attr === 'true' || attr === 'plaintext-only';
}

function isDisabled(el: Element): boolean {
  const f = el as Partial<HTMLInputElement>;
  if (f.disabled || f.readOnly) return true;
  if (el.getAttribute('aria-disabled') === 'true' || el.getAttribute('aria-readonly') === 'true')
    return true;
  return el.closest('fieldset:disabled') !== null;
}

function textKind(el: Element): FieldKind | null {
  if (el instanceof HTMLTextAreaElement) return 'textarea';
  if (el instanceof HTMLSelectElement) return 'select';
  if (el instanceof HTMLInputElement) {
    const type = (el.getAttribute('type') ?? '').toLowerCase();
    return TEXT_INPUT_TYPES.has(type) ? 'input' : null;
  }
  if (isEditable(el)) {
    // Top-most editable host only.
    const parent = el.parentElement;
    return parent && isEditable(parent) ? null : 'contenteditable';
  }
  if (el.getAttribute('role') === 'textbox') return 'contenteditable';
  return null;
}

function groupKey(input: HTMLInputElement, sameName: number): Element | string {
  if (input.name && (input.type === 'radio' || sameName > 1)) {
    return `${input.type}:${input.name}:${input.form?.id ?? ''}`;
  }
  return input.closest('fieldset, [role="radiogroup"], [role="group"]') ?? input;
}

function choiceVisible(input: HTMLInputElement, checker: VisibilityChecker): boolean {
  // Styled radios often hide the native input and show the label instead.
  if (checker.isVisible(input)) return true;
  return Array.from(input.labels ?? []).some((l) => checker.isVisible(l));
}

function choiceRect(input: HTMLInputElement): Rect {
  const rects = [elementRect(input), ...Array.from(input.labels ?? [], elementRect)].filter(
    (r) => r.w > 0 && r.h > 0,
  );
  return union(rects) ?? elementRect(input);
}

export function collectFillable(doc: Document, checker: VisibilityChecker): Fillable[] {
  const found: Fillable[] = [];
  const groups = new Map<Element | string, HTMLInputElement[]>();
  const nameCounts = new Map<string, number>();
  const all = queryAllDeep(doc, 'input, textarea, select, [contenteditable], [role="textbox"]');

  for (const el of all) {
    if (
      el instanceof HTMLInputElement &&
      (el.type === 'radio' || el.type === 'checkbox') &&
      el.name
    ) {
      const k = `${el.type}:${el.name}`;
      nameCounts.set(k, (nameCounts.get(k) ?? 0) + 1);
    }
  }

  for (const el of all) {
    if (isDisabled(el)) continue;
    if (el instanceof HTMLInputElement && (el.type === 'radio' || el.type === 'checkbox')) {
      if (!choiceVisible(el, checker)) continue;
      const key = groupKey(el, nameCounts.get(`${el.type}:${el.name}`) ?? 0);
      const list = groups.get(key) ?? [];
      list.push(el);
      groups.set(key, list);
      continue;
    }
    const kind = textKind(el);
    if (!kind || !checker.isVisible(el)) continue;
    found.push({ el, kind, members: [], rect: elementRect(el) });
  }

  for (const frame of queryAllDeep(doc, 'iframe, frame')) {
    const rect = elementRect(frame);
    if (rect.w < MIN_IFRAME_W || rect.h < MIN_IFRAME_H || !checker.isVisible(frame)) continue;
    found.push({ el: frame, kind: 'textarea', members: [], rect, inIframe: true });
  }

  for (const members of groups.values()) {
    const first = members[0]!;
    found.push({
      el: first,
      kind: first.type === 'radio' ? 'radio-group' : 'checkbox-group',
      members,
      rect: union(members.map(choiceRect))!,
    });
  }
  return found;
}

// ---------------------------------------------------------------------------------------------
// Scoring (spec 9.7): focused 1000, inside 500 - center distance, below 300 - gap, right 200 - gap.

export interface Score {
  score: number;
  confidence: FieldInfo['confidence'];
}

export function scoreField(field: Rect, sel: Rect, focused: boolean): Score | null {
  if (focused) return { score: 1000, confidence: 'focused' };
  if (intersects(field, sel)) {
    return { score: 500 - distance(center(field), center(sel)), confidence: 'inside' };
  }
  const selBottom = sel.y + sel.h;
  const selRight = sel.x + sel.w;
  const hOverlap = Math.min(field.x + field.w, selRight) - Math.max(field.x, sel.x);
  const vOverlap = Math.min(field.y + field.h, selBottom) - Math.max(field.y, sel.y);
  const below = field.y - selBottom;
  if (below >= 0 && below <= 300 && hOverlap > 0)
    return { score: 300 - below, confidence: 'below' };
  const right = field.x - selRight;
  if (right >= 0 && right < 400 && vOverlap > 0) return { score: 200 - right, confidence: 'right' };
  return null;
}

function isFocusedField(f: Fillable, active: Element | null): boolean {
  if (!active) return false;
  if (f.members.length) return f.members.includes(active as HTMLInputElement);
  return f.el === active || (f.kind === 'contenteditable' && f.el.contains(active));
}

function groupContainer(members: HTMLInputElement[]): Element {
  let c: Element | null = members[0]!.parentElement;
  while (c && !members.every((m) => c!.contains(m))) c = c.parentElement;
  return c ?? members[0]!;
}

export function choiceLabel(input: HTMLInputElement, checker: VisibilityChecker): string {
  const t = Array.from(input.labels ?? [], (l) => visibleTextOf(l, checker)).find(Boolean);
  return (
    t ||
    collapse(input.getAttribute('aria-label') ?? '') ||
    (input.value !== 'on' ? input.value : '')
  );
}

export function describeField(
  f: Fillable,
  confidence: FieldInfo['confidence'],
  checker: VisibilityChecker,
): FieldInfo {
  const info: FieldInfo = { targetId: registerElement(f.el), kind: f.kind, confidence };
  if (f.members.length) {
    const container =
      f.el.closest('fieldset, [role="radiogroup"], [role="group"]') ?? groupContainer(f.members);
    info.label = labelFor(container, checker);
    info.options = f.members.map((m) => choiceLabel(m, checker)).filter(Boolean);
    const checked = f.members.filter((m) => m.checked).map((m) => choiceLabel(m, checker));
    if (checked.length) info.currentValue = checked.join(', ');
    info.required = f.members.some((m) => m.required) || undefined;
    return info;
  }

  const el = f.el;
  if (f.inIframe) {
    info.inIframe = true;
    info.label = el.getAttribute('title') || labelFor(el, checker);
    if (!info.label) delete info.label;
    return info;
  }
  info.label = labelFor(el, checker);
  info.hint = hintFor(el, checker);
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    if (el instanceof HTMLInputElement) info.inputType = el.type || 'text';
    if (el.maxLength > 0) info.maxLength = el.maxLength;
    if (el.minLength > 0) info.minLength = el.minLength;
    if (el.placeholder) info.placeholder = collapse(el.placeholder);
    if (el.value) info.currentValue = el.value.slice(0, CURRENT_VALUE_CAP);
    if (el.required) info.required = true;
  } else if (el instanceof HTMLSelectElement) {
    info.options = Array.from(el.options, (o) => collapse(o.text)).filter(Boolean);
    const selected = el.selectedOptions[0];
    if (selected?.value) info.currentValue = collapse(selected.text);
    if (el.required) info.required = true;
  } else {
    const text = collapse((el as HTMLElement).innerText ?? el.textContent ?? '');
    if (text) info.currentValue = text.slice(0, CURRENT_VALUE_CAP);
    const placeholder = el.getAttribute('aria-placeholder') ?? el.getAttribute('data-placeholder');
    if (placeholder) info.placeholder = collapse(placeholder);
  }
  // Drop undefined keys so messages and snapshots stay tidy.
  for (const k of Object.keys(info) as (keyof FieldInfo)[])
    if (info[k] === undefined) delete info[k];
  return info;
}

/** Ranked field candidates for a selection, best first (max 5). */
export function findCandidates(
  sel: Rect,
  activeAtStart: Element | null,
  checker: VisibilityChecker,
  doc: Document = document,
): FieldInfo[] {
  const scored: { f: Fillable; s: Score }[] = [];
  for (const f of collectFillable(doc, checker)) {
    const s = scoreField(f.rect, sel, isFocusedField(f, activeAtStart));
    if (s) scored.push({ f, s });
  }
  scored.sort((a, b) => b.s.score - a.s.score);
  return scored.slice(0, MAX_CANDIDATES).map(({ f, s }) => describeField(f, s.confidence, checker));
}
