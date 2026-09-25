import { describe, expect, it } from 'vitest';
import { growShortEdge, planCrop, MAX_LONG_EDGE, MAX_PIXELS } from '@/background/crop';
import { clampRect } from '@/capture/geometry';

const viewport = { w: 1280, h: 800 };
const sel = { x: 400, y: 300, w: 400, h: 100 };

/** Bitmap size for a given device pixel ratio and page zoom. */
function bitmapFor(dpr: number, zoom = 1) {
  // With page zoom, the page reports a viewport of (window px / zoom) CSS px.
  return {
    vp: { w: viewport.w / zoom, h: viewport.h / zoom },
    bmp: { w: viewport.w * dpr, h: viewport.h * dpr },
  };
}

describe('planCrop', () => {
  it.each([1, 1.25, 2])('maps the padded selection to device px at DPR %s', (dpr) => {
    const { src, out, outline } = planCrop({ w: 1280 * dpr, h: 800 * dpr }, sel, viewport, {
      pad: true,
    });
    expect(src.x).toBeCloseTo((400 - 48) * dpr);
    // At DPR 1 the 196 px short edge grows to 200, centered, so the top moves up by 2.
    const grow = dpr === 1 ? 4 : 0;
    expect(src.y).toBeCloseTo((300 - 48 - grow / 2) * dpr);
    expect(src.w).toBeCloseTo(496 * dpr);
    expect(src.h).toBeCloseTo((196 + grow) * dpr);
    expect(out.w).toBeLessThanOrEqual(MAX_LONG_EDGE);
    expect(outline).not.toBeNull();
  });

  it.each([0.8, 1.25])('uses the bitmap ratio at page zoom %s', (zoom) => {
    const { vp, bmp } = bitmapFor(1, zoom);
    const s = { x: 100, y: 100, w: 300, h: 300 };
    const { src } = planCrop(bmp, s, vp, { pad: false });
    expect(src.x).toBeCloseTo(100 * zoom);
    expect(src.w).toBeCloseTo(300 * zoom);
  });

  it('places the outline on the exact selection inside the padded crop', () => {
    const { outline } = planCrop({ w: 2560, h: 1600 }, sel, viewport, { pad: true });
    expect(outline).toEqual({ x: 48 * 2, y: 48 * 2, w: 800, h: 200 });
  });

  it('has no outline without padding', () => {
    expect(planCrop({ w: 1280, h: 800 }, sel, viewport, { pad: false }).outline).toBeNull();
  });

  it('clamps padding at the viewport edges and keeps the outline aligned', () => {
    const edge = { x: 0, y: 10, w: 300, h: 300 };
    const { src, outline } = planCrop({ w: 1280, h: 800 }, edge, viewport, { pad: true });
    expect(src.x).toBe(0);
    expect(src.y).toBe(0);
    expect(outline).toMatchObject({ x: 0, y: 10 });
  });

  it('clamps a selection that runs past the viewport', () => {
    const { src } = planCrop({ w: 1280, h: 800 }, { x: 1200, y: 700, w: 400, h: 400 }, viewport, {
      pad: false,
    });
    expect(src.x + src.w).toBeLessThanOrEqual(1280);
    expect(src.y + src.h).toBeLessThanOrEqual(800);
  });

  it('caps the long edge at 1568 px and the area near 1.15 MP', () => {
    const { out } = planCrop({ w: 3840, h: 2400 }, { x: 0, y: 0, w: 1280, h: 800 }, viewport, {
      pad: false,
    });
    expect(Math.max(out.w, out.h)).toBeLessThanOrEqual(MAX_LONG_EDGE);
    expect(out.w * out.h).toBeLessThanOrEqual(MAX_PIXELS * 1.01);
  });

  it('never upscales', () => {
    const { src, out } = planCrop({ w: 1280, h: 800 }, sel, viewport, { pad: false });
    expect(out.w).toBe(Math.round(src.w));
  });

  it('grows a thin selection to at least 200 device px on the short edge', () => {
    const thin = { x: 500, y: 400, w: 400, h: 20 };
    const { src } = planCrop({ w: 1280, h: 800 }, thin, viewport, { pad: false });
    expect(src.h).toBeCloseTo(200);
    // At DPR 2, 100 CSS px is enough.
    const hi = planCrop({ w: 2560, h: 1600 }, thin, viewport, { pad: false });
    expect(hi.src.h).toBeCloseTo(200);
  });
});

describe('growShortEdge', () => {
  it('shifts inward instead of leaving the viewport', () => {
    expect(growShortEdge({ x: 10, y: 790, w: 400, h: 10 }, 200, viewport)).toEqual({
      x: 10,
      y: 600,
      w: 400,
      h: 200,
    });
  });
});

describe('clampRect', () => {
  it('clips negative origins', () => {
    expect(clampRect({ x: -20, y: -10, w: 100, h: 50 }, viewport)).toEqual({
      x: 0,
      y: 0,
      w: 80,
      h: 40,
    });
  });
});
