import type { Rect, Size } from '@/storage/schema';

export function toRect(r: { left: number; top: number; width: number; height: number }): Rect {
  return { x: r.left, y: r.top, w: r.width, h: r.height };
}

export function area(r: Rect): number {
  return Math.max(0, r.w) * Math.max(0, r.h);
}

export function intersection(a: Rect, b: Rect): Rect | null {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.w, b.x + b.w);
  const bottom = Math.min(a.y + a.h, b.y + b.h);
  if (right <= x || bottom <= y) return null;
  return { x, y, w: right - x, h: bottom - y };
}

export function intersects(a: Rect, b: Rect): boolean {
  return intersection(a, b) !== null;
}

/** True when at least `ratio` of `r`'s own area lies inside `sel`. */
export function mostlyInside(r: Rect, sel: Rect, ratio = 0.5): boolean {
  const a = area(r);
  if (a === 0) return false;
  const i = intersection(r, sel);
  return i !== null && area(i) >= a * ratio;
}

export function union(rects: Rect[]): Rect | null {
  if (rects.length === 0) return null;
  let x = Infinity;
  let y = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const r of rects) {
    x = Math.min(x, r.x);
    y = Math.min(y, r.y);
    right = Math.max(right, r.x + r.w);
    bottom = Math.max(bottom, r.y + r.h);
  }
  return { x, y, w: right - x, h: bottom - y };
}

export function center(r: Rect): { x: number; y: number } {
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
}

export function distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function elementRect(el: Element): Rect {
  return toRect(el.getBoundingClientRect());
}

export function clampRect(r: Rect, viewport: Size): Rect {
  const x = Math.max(0, Math.min(r.x, viewport.w));
  const y = Math.max(0, Math.min(r.y, viewport.h));
  const right = Math.max(x, Math.min(r.x + r.w, viewport.w));
  const bottom = Math.max(y, Math.min(r.y + r.h, viewport.h));
  return { x, y, w: right - x, h: bottom - y };
}
