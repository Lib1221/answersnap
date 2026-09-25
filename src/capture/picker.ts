import { BRAND } from '@/config/brand';
import type { FieldInfo, Rect } from '@/storage/schema';
import { collectFillable, describeField, resolveTarget, type Fillable } from './fields';
import { elementRect } from './geometry';
import { createVisibilityChecker } from './hiddenText';

// Field highlight, the insert flash, and "Pick another field" (spec 9.7, 12). Each draws in
// its own closed shadow root and never changes the page's elements.

const INK = '#2447B8';
const HOST_TAG = `${BRAND.overlayTag}-marker`;

function reducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

interface Marker {
  show(rect: Rect | null): void;
  remove(): void;
  hint(text: string): void;
}

function createMarker(): Marker {
  const host = document.createElement(HOST_TAG);
  for (const [k, v] of Object.entries({
    position: 'fixed',
    inset: '0',
    'z-index': '2147483646',
    'pointer-events': 'none',
    display: 'block',
  })) {
    host.style.setProperty(k, v, 'important');
  }
  const shadow = host.attachShadow({ mode: 'closed' });
  const box = document.createElement('div');
  Object.assign(box.style, {
    position: 'fixed',
    display: 'none',
    outline: `2px solid ${INK}`,
    outlineOffset: '2px',
    borderRadius: '4px',
    background: 'rgba(36, 71, 184, 0.08)',
  });
  const pill = document.createElement('div');
  pill.setAttribute('role', 'status');
  Object.assign(pill.style, {
    position: 'fixed',
    top: '16px',
    left: '50%',
    transform: 'translateX(-50%)',
    display: 'none',
    padding: '8px 14px',
    borderRadius: '999px',
    background: '#FFFFFF',
    color: '#23262B',
    font: '500 13px system-ui, sans-serif',
    boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
  });
  shadow.append(box, pill);
  document.documentElement.appendChild(host);
  return {
    show(rect) {
      if (!rect) return void (box.style.display = 'none');
      Object.assign(box.style, {
        display: 'block',
        left: `${rect.x}px`,
        top: `${rect.y}px`,
        width: `${rect.w}px`,
        height: `${rect.h}px`,
      });
    },
    hint(text) {
      pill.textContent = text;
      pill.style.display = text ? 'block' : 'none';
    },
    remove() {
      host.remove();
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Highlight while the panel hovers the target line.

let highlight: { marker: Marker; el: Element; frame: number } | null = null;

export function setHighlight(targetId: string, on: boolean): void {
  if (highlight) {
    cancelAnimationFrame(highlight.frame);
    highlight.marker.remove();
    highlight = null;
  }
  const el = on ? resolveTarget(targetId) : null;
  if (!el) return;
  const marker = createMarker();
  const follow = () => {
    marker.show(elementRect(el));
    if (highlight) highlight.frame = requestAnimationFrame(follow);
  };
  highlight = { marker, el, frame: 0 };
  el.scrollIntoView({ block: 'nearest' });
  follow();
}

/** One ink-blue flash after a successful insert (skipped under reduced motion). */
export function flash(el: Element): void {
  if (reducedMotion()) return;
  const marker = createMarker();
  marker.show(elementRect(el));
  setTimeout(() => marker.remove(), 600);
}

// ---------------------------------------------------------------------------------------------
// "Pick another field": hover highlights fillable elements, click picks, Esc cancels.

let activePick: (() => void) | null = null;

function fillableAt(list: Fillable[], x: number, y: number): Fillable | null {
  const hit = document.elementFromPoint(x, y);
  if (hit) {
    const direct = list.find(
      (f) => f.el === hit || f.el.contains(hit) || f.members.includes(hit as HTMLInputElement),
    );
    if (direct) return direct;
  }
  const inside = list.filter(
    (f) => x >= f.rect.x && x <= f.rect.x + f.rect.w && y >= f.rect.y && y <= f.rect.y + f.rect.h,
  );
  inside.sort((a, b) => a.rect.w * a.rect.h - b.rect.w * b.rect.h);
  return inside[0] ?? null;
}

export function pickField(): Promise<FieldInfo | null> {
  activePick?.();
  return new Promise((resolve) => {
    const checker = createVisibilityChecker();
    const list = collectFillable(document, checker);
    const marker = createMarker();
    marker.hint('Click the field to fill. Esc cancels.');

    const onMove = (e: MouseEvent) => {
      const current = fillableAt(list, e.clientX, e.clientY);
      marker.show(
        current ? (current.members.length ? current.rect : elementRect(current.el)) : null,
      );
    };
    const onClick = (e: MouseEvent) => {
      const picked = fillableAt(list, e.clientX, e.clientY);
      if (!picked) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      done(describeField(picked, 'picked', checker));
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopImmediatePropagation();
      done(null);
    };
    const swallow = (e: Event) => {
      if (fillableAt(list, (e as MouseEvent).clientX, (e as MouseEvent).clientY)) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    };
    function done(result: FieldInfo | null) {
      document.removeEventListener('mousemove', onMove, true);
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('mousedown', swallow, true);
      document.removeEventListener('mouseup', swallow, true);
      window.removeEventListener('keydown', onKey, true);
      marker.remove();
      activePick = null;
      resolve(result);
    }
    activePick = () => done(null);
    document.addEventListener('mousemove', onMove, true);
    document.addEventListener('mousedown', swallow, true);
    document.addEventListener('mouseup', swallow, true);
    document.addEventListener('click', onClick, true);
    window.addEventListener('keydown', onKey, true);
  });
}
