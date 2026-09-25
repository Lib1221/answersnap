import type { Rect, Size } from '@/storage/schema';
import { elementRect } from './geometry';
import type { VisibilityChecker } from './hiddenText';

export const CLICK_TOLERANCE = 4;
export const MIN_SELECTION = 12;
export const PICK_MIN_W = 60;
export const PICK_MIN_H = 16;

export interface Point {
  x: number;
  y: number;
}

export function clampPoint(p: Point, viewport: Size): Point {
  return { x: Math.max(0, Math.min(p.x, viewport.w)), y: Math.max(0, Math.min(p.y, viewport.h)) };
}

export function rectFromPoints(a: Point, b: Point, viewport: Size): Rect {
  const p = clampPoint(a, viewport);
  const q = clampPoint(b, viewport);
  return {
    x: Math.min(p.x, q.x),
    y: Math.min(p.y, q.y),
    w: Math.abs(p.x - q.x),
    h: Math.abs(p.y - q.y),
  };
}

export function isClick(a: Point, b: Point): boolean {
  return Math.abs(a.x - b.x) < CLICK_TOLERANCE && Math.abs(a.y - b.y) < CLICK_TOLERANCE;
}

export function isBigEnough(r: Rect): boolean {
  return r.w >= MIN_SELECTION && r.h >= MIN_SELECTION;
}

function hasVisibleText(el: Element, checker: VisibilityChecker): boolean {
  if (!(el.textContent ?? '').trim()) return false;
  // Any direct or nested text whose parent is visible counts.
  const doc = el.ownerDocument;
  const tw = doc.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let n = tw.nextNode(); n; n = tw.nextNode()) {
    if (n.nodeValue?.trim() && n.parentElement && checker.isVisible(n.parentElement)) return true;
  }
  return false;
}

/**
 * Block under the cursor for click-to-pick: walk up from the hit element to the first one
 * with visible text that is at least 60 x 16 px (spec 9.3).
 */
export function pickBlock(hit: Element | null, checker: VisibilityChecker): Element | null {
  const doc = hit?.ownerDocument;
  for (let el = hit; el && el !== doc?.body && el !== doc?.documentElement; el = el.parentElement) {
    const r = elementRect(el);
    if (r.w >= PICK_MIN_W && r.h >= PICK_MIN_H && hasVisibleText(el, checker)) return el;
  }
  return null;
}
