// happy-dom has no layout engine. Tests describe boxes with data-rect="x,y,w,h" and these
// stubs answer getBoundingClientRect / Range.getClientRects from the nearest ancestor's box.

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

function parse(el: Element): Box | null {
  const v = el.getAttribute('data-rect');
  if (!v) return null;
  const [x, y, w, h] = v.split(',').map(Number) as [number, number, number, number];
  return { x, y, w, h };
}

function parentOf(a: Element): Element | null {
  if (a.parentElement) return a.parentElement;
  const root = a.getRootNode();
  return root instanceof ShadowRoot ? root.host : null;
}

function boxFor(el: Element | null): Box | null {
  for (let a = el; a; a = parentOf(a)) {
    const b = parse(a);
    if (b) return b;
  }
  return null;
}

function displayNone(el: Element | null): boolean {
  for (let a = el; a; a = a.parentElement) {
    if (getComputedStyle(a).display === 'none') return true;
  }
  return false;
}

function domRect(b: Box) {
  return {
    x: b.x,
    y: b.y,
    left: b.x,
    top: b.y,
    width: b.w,
    height: b.h,
    right: b.x + b.w,
    bottom: b.y + b.h,
    toJSON() {
      return this;
    },
  } as DOMRect;
}

const ZERO = { x: 0, y: 0, w: 0, h: 0 };

export function installLayout(viewport = { w: 1280, h: 800 }): () => void {
  const elProto = Element.prototype;
  const rangeProto = Range.prototype;
  const origEl = elProto.getBoundingClientRect;
  const origRange = rangeProto.getClientRects;
  const origW = window.innerWidth;
  const origH = window.innerHeight;

  elProto.getBoundingClientRect = function (this: Element) {
    return domRect(displayNone(this) ? ZERO : (boxFor(this) ?? ZERO));
  };
  rangeProto.getClientRects = function (this: Range) {
    const n = this.startContainer;
    const el = n.nodeType === Node.TEXT_NODE ? n.parentElement : (n as Element);
    if (displayNone(el)) return [] as unknown as DOMRectList;
    const b = boxFor(el);
    return (b ? [domRect(b)] : []) as unknown as DOMRectList;
  };
  Object.defineProperty(window, 'innerWidth', { value: viewport.w, configurable: true });
  Object.defineProperty(window, 'innerHeight', { value: viewport.h, configurable: true });

  return () => {
    elProto.getBoundingClientRect = origEl;
    rangeProto.getClientRects = origRange;
    Object.defineProperty(window, 'innerWidth', { value: origW, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: origH, configurable: true });
  };
}

/** Test-only DOM setup. Fixtures are static strings written in the test files. */
export function setBody(html: string): void {
  // eslint-disable-next-line no-restricted-properties
  document.body.innerHTML = html;
}
