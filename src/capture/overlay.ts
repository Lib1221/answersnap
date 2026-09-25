import { BRAND } from '@/config/brand';
import type { Rect, SnipMode } from '@/storage/schema';
import { clampRect, elementRect } from './geometry';
import type { VisibilityChecker } from './hiddenText';
import { OVERLAY_CSS } from './overlay.css';
import { isBigEnough, isClick, pickBlock, rectFromPoints, type Point } from './selection';

const HINTS: Record<SnipMode, string> = {
  question: 'Drag around the question. Click a block to pick it. Esc cancels.',
  field: 'Drag around the question. Click a block to pick it. Esc cancels.',
  job: 'Drag around the job post.',
  import: 'Drag around the text to import.',
};

export interface OverlayCallbacks {
  onSelect(rect: Rect): void;
  onCancel(): void;
}

export interface OverlayHandle {
  host: HTMLElement;
  unmount(): void;
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  parent: Node,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  parent.appendChild(node);
  return node;
}

function applyStyles(shadow: ShadowRoot): void {
  try {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(OVERLAY_CSS);
    shadow.adoptedStyleSheets = [sheet];
  } catch {
    el('style', '', shadow).textContent = OVERLAY_CSS;
  }
}

/** Full-viewport selection overlay in a closed shadow root (spec 9.3). */
export function mountOverlay(
  mode: SnipMode,
  checker: VisibilityChecker,
  cb: OverlayCallbacks,
): OverlayHandle {
  const host = document.createElement(BRAND.overlayTag);
  const hostStyle: Record<string, string> = {
    position: 'fixed',
    inset: '0',
    'z-index': '2147483647',
    display: 'block',
    margin: '0',
    padding: '0',
    border: '0',
    'pointer-events': 'auto',
  };
  for (const [k, v] of Object.entries(hostStyle)) host.style.setProperty(k, v, 'important');

  const shadow = host.attachShadow({ mode: 'closed' });
  applyStyles(shadow);
  const layer = el('div', 'layer', shadow);
  const box = el('div', 'box', layer);
  for (const corner of ['tl', 'tr', 'bl', 'br']) el('span', `mark ${corner}`, box);
  const size = el('span', 'size', box);
  const hint = el('div', 'hint', layer);
  hint.setAttribute('role', 'status');
  hint.textContent = HINTS[mode];

  let start: Point | null = null;
  let dragging = false;
  let hoverFrame = 0;
  let done = false;

  const viewport = () => ({ w: window.innerWidth, h: window.innerHeight });

  function showBox(r: Rect | null, preview: boolean) {
    layer.classList.toggle('has-box', r !== null);
    if (!r) return;
    box.classList.toggle('preview', preview);
    Object.assign(box.style, {
      left: `${r.x}px`,
      top: `${r.y}px`,
      width: `${r.w}px`,
      height: `${r.h}px`,
    });
    size.textContent = `${Math.round(r.w)} x ${Math.round(r.h)}`;
  }

  function hitTest(p: Point): Element | null {
    host.style.setProperty('pointer-events', 'none', 'important');
    const hit = document.elementFromPoint(p.x, p.y);
    host.style.setProperty('pointer-events', 'auto', 'important');
    return hit === host ? null : hit;
  }

  function blockRect(p: Point): Rect | null {
    const block = pickBlock(hitTest(p), checker);
    return block ? clampRect(elementRect(block), viewport()) : null;
  }

  function finish(r: Rect) {
    if (done) return;
    done = true;
    cb.onSelect(r);
  }

  function cancel() {
    if (done) return;
    done = true;
    cb.onCancel();
  }

  const point = (e: PointerEvent | MouseEvent): Point => ({ x: e.clientX, y: e.clientY });

  function onPointerDown(e: PointerEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (e.button === 2) return cancel();
    if (e.button !== 0) return;
    start = point(e);
    dragging = false;
    layer.setPointerCapture?.(e.pointerId);
  }

  function onPointerMove(e: PointerEvent) {
    e.stopPropagation();
    const p = point(e);
    if (start) {
      if (!dragging && !isClick(start, p)) dragging = true;
      if (dragging) showBox(rectFromPoints(start, p, viewport()), false);
      return;
    }
    cancelAnimationFrame(hoverFrame);
    hoverFrame = requestAnimationFrame(() => showBox(blockRect(p), true));
  }

  function onPointerUp(e: PointerEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!start || e.button !== 0) return;
    const p = point(e);
    const r = dragging ? rectFromPoints(start, p, viewport()) : blockRect(p);
    start = null;
    dragging = false;
    if (r && isBigEnough(r)) finish(r);
    else showBox(null, false);
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    e.stopImmediatePropagation();
    cancel();
  }

  function onContextMenu(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    cancel();
  }

  function onWheel(e: WheelEvent) {
    if (dragging) e.preventDefault();
  }

  layer.addEventListener('pointerdown', onPointerDown);
  layer.addEventListener('pointermove', onPointerMove);
  layer.addEventListener('pointerup', onPointerUp);
  layer.addEventListener('contextmenu', onContextMenu);
  layer.addEventListener('wheel', onWheel, { passive: false });
  window.addEventListener('keydown', onKeyDown, true);

  document.documentElement.appendChild(host);

  return {
    host,
    unmount() {
      done = true;
      cancelAnimationFrame(hoverFrame);
      window.removeEventListener('keydown', onKeyDown, true);
      host.remove();
    },
  };
}
