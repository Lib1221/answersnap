// Visibility checks (spec 9.6). Some job posts hide text meant to trap AI tools, so text
// that a person can't see must never reach the model.

export interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

const WHITE: Rgba = { r: 255, g: 255, b: 255, a: 1 };
const NAMED: Record<string, Rgba> = {
  white: WHITE,
  black: { r: 0, g: 0, b: 0, a: 1 },
  transparent: { r: 0, g: 0, b: 0, a: 0 },
};

/** Parses the color formats getComputedStyle returns (rgb/rgba), plus hex and a few names. */
export function parseColor(value: string | null | undefined): Rgba | null {
  if (!value) return null;
  const v = value.trim().toLowerCase();
  if (v in NAMED) return NAMED[v]!;
  const m = v.match(
    /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+)(%?))?\s*\)$/,
  );
  if (m) {
    let a = m[4] === undefined ? 1 : parseFloat(m[4]);
    if (m[5] === '%') a /= 100;
    return { r: +m[1]!, g: +m[2]!, b: +m[3]!, a };
  }
  const hex = v.match(/^#([0-9a-f]{3,8})$/)?.[1];
  if (hex && (hex.length === 3 || hex.length === 6)) {
    const full = hex.length === 3 ? [...hex].map((c) => c + c).join('') : hex;
    return {
      r: parseInt(full.slice(0, 2), 16),
      g: parseInt(full.slice(2, 4), 16),
      b: parseInt(full.slice(4, 6), 16),
      a: 1,
    };
  }
  return null;
}

/** Composite `top` over an opaque `bottom`. */
export function blend(top: Rgba, bottom: Rgba): Rgba {
  const a = top.a;
  return {
    r: top.r * a + bottom.r * (1 - a),
    g: top.g * a + bottom.g * (1 - a),
    b: top.b * a + bottom.b * (1 - a),
    a: 1,
  };
}

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function luminance(c: Rgba): number {
  return 0.2126 * channel(c.r) + 0.7152 * channel(c.g) + 0.0722 * channel(c.b);
}

export function contrastRatio(a: Rgba, b: Rgba): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

export const MIN_CONTRAST = 1.3;
export const MIN_FONT_PX = 4;
export const MIN_OPACITY = 0.1;

function isClippedAway(el: Element, s: CSSStyleDeclaration): boolean {
  const clip = s.clip?.replace(/\s|px/g, '');
  if (clip === 'rect(0,0,0,0)' || clip === 'rect(0000)') return true;
  const clipPath = s.clipPath?.replace(/\s/g, '');
  if (clipPath === 'inset(50%)' || clipPath === 'inset(100%)') return true;
  if (s.overflow === 'hidden' || s.overflow === 'clip') {
    const r = el.getBoundingClientRect();
    if (r.width <= 1 || r.height <= 1) return true;
  }
  return false;
}

interface ChainState {
  hidden: boolean;
  opacity: number;
}

export interface VisibilityChecker {
  isVisible(el: Element): boolean;
}

/** One checker per extraction pass; results are cached per element. */
export function createVisibilityChecker(win: Window = window): VisibilityChecker {
  const chain = new Map<Element, ChainState>();
  const visible = new Map<Element, boolean>();
  const backgrounds = new Map<Element, Rgba | null>();
  const style = (el: Element) => win.getComputedStyle(el);

  // Ancestor-inherited state: display none, clipping, and multiplied opacity.
  function chainState(el: Element): ChainState {
    const cached = chain.get(el);
    if (cached) return cached;
    const s = style(el);
    const parent = el.parentElement;
    const up = parent ? chainState(parent) : { hidden: false, opacity: 1 };
    const own = parseFloat(s.opacity);
    const state = {
      hidden: up.hidden || s.display === 'none' || isClippedAway(el, s),
      opacity: up.opacity * (Number.isFinite(own) ? own : 1),
    };
    chain.set(el, state);
    return state;
  }

  // First non-transparent background, or null when a background image makes contrast unknowable.
  function background(el: Element | null): Rgba | null {
    if (!el) return WHITE;
    if (backgrounds.has(el)) return backgrounds.get(el)!;
    const s = style(el);
    let result: Rgba | null;
    if (s.backgroundImage && s.backgroundImage !== 'none') result = null;
    else {
      const c = parseColor(s.backgroundColor);
      result =
        c && c.a > 0
          ? c.a < 1
            ? blend(c, background(el.parentElement) ?? WHITE)
            : c
          : background(el.parentElement);
    }
    backgrounds.set(el, result);
    return result;
  }

  function compute(el: Element): boolean {
    const withCheck = el as Element & { checkVisibility?: (o: object) => boolean };
    if (
      typeof withCheck.checkVisibility === 'function' &&
      !withCheck.checkVisibility({
        opacityProperty: true,
        visibilityProperty: true,
        contentVisibilityAuto: true,
      })
    ) {
      return false;
    }
    const s = style(el);
    if (s.visibility === 'hidden' || s.visibility === 'collapse') return false;
    const state = chainState(el);
    if (state.hidden || state.opacity < MIN_OPACITY) return false;
    const fontSize = parseFloat(s.fontSize);
    if (Number.isFinite(fontSize) && fontSize < MIN_FONT_PX) return false;

    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return false;
    const doc = el.ownerDocument;
    const scrollW = Math.max(doc.documentElement.scrollWidth, win.innerWidth);
    if (
      r.right + win.scrollX <= 0 ||
      r.bottom + win.scrollY <= 0 ||
      r.left + win.scrollX >= scrollW
    ) {
      return false;
    }

    const color = parseColor(s.color);
    if (color && color.a === 0) return false;
    const bg = background(el);
    if (color && bg && contrastRatio(blend(color, bg), bg) < MIN_CONTRAST) return false;
    return true;
  }

  return {
    isVisible(el) {
      let v = visible.get(el);
      if (v === undefined) {
        v = compute(el);
        visible.set(el, v);
      }
      return v;
    },
  };
}
