import { clampRect } from '@/capture/geometry';
import type { CapturedImage, Rect, Size } from '@/storage/schema';

/** CSS px of context kept around the user's selection when padding is on. */
export const CONTEXT_PAD = 48;
/** Target minimum short edge in device px (smaller images hurt vision accuracy). */
export const MIN_SHORT_EDGE = 200;
/** Anthropic resizes past 1568 px on the long edge or about 1.15 MP, so never send more. */
export const MAX_LONG_EDGE = 1568;
export const MAX_PIXELS = 1_150_000;
export const JPEG_FALLBACK_BYTES = 1_500_000;
export const OUTLINE_COLOR = '#2447B8';

export interface CropPlan {
  /** Source rectangle in bitmap (device) px. */
  src: Rect;
  /** Output canvas size. */
  out: Size;
  /** The user's exact selection in output px, when padding is on. */
  outline: Rect | null;
}

/** Grow one axis around its center to at least `min`, shifting to stay inside [0, limit]. */
function growAxis(start: number, len: number, min: number, limit: number): [number, number] {
  if (len >= min) return [start, len];
  const target = Math.min(min, limit);
  let s = start - (target - len) / 2;
  s = Math.max(0, Math.min(s, limit - target));
  return [s, target];
}

/** Aim for at least `minCss` CSS px on the short edge (both edges, if both are short). */
export function growShortEdge(r: Rect, minCss: number, viewport: Size): Rect {
  const [x, w] = growAxis(r.x, r.w, minCss, viewport.w);
  const [y, h] = growAxis(r.y, r.h, minCss, viewport.h);
  return { x, y, w, h };
}

/**
 * Plan the crop. Scale comes from the bitmap, not devicePixelRatio, so HiDPI screens and
 * page zoom are both handled by the same ratio.
 */
export function planCrop(
  bitmap: Size,
  sel: Rect,
  viewport: Size,
  opts: { pad: boolean },
): CropPlan {
  const sx = bitmap.w / viewport.w;
  const sy = bitmap.h / viewport.h;
  const selection = clampRect(sel, viewport);
  const pad = opts.pad ? CONTEXT_PAD : 0;

  let r = clampRect(
    {
      x: selection.x - pad,
      y: selection.y - pad,
      w: selection.w + pad * 2,
      h: selection.h + pad * 2,
    },
    viewport,
  );
  r = growShortEdge(r, MIN_SHORT_EDGE / Math.min(sx, sy), viewport);

  const src = { x: r.x * sx, y: r.y * sy, w: r.w * sx, h: r.h * sy };
  const k = Math.min(
    1,
    MAX_LONG_EDGE / Math.max(src.w, src.h),
    Math.sqrt(MAX_PIXELS / (src.w * src.h)),
  );
  const out = { w: Math.max(1, Math.round(src.w * k)), h: Math.max(1, Math.round(src.h * k)) };

  const outline = opts.pad
    ? {
        x: (selection.x - r.x) * sx * k,
        y: (selection.y - r.y) * sy * k,
        w: selection.w * sx * k,
        h: selection.h * sy * k,
      }
    : null;

  return { src, out, outline };
}

export async function blobToDataUrl(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return `data:${blob.type};base64,${btoa(binary)}`;
}

/** Crop a captureVisibleTab screenshot. Runs in the service worker (OffscreenCanvas). */
export async function cropCapture(
  dataUrl: string,
  sel: Rect,
  viewport: Size,
  opts: { pad: boolean },
): Promise<CapturedImage> {
  const bmp = await createImageBitmap(await (await fetch(dataUrl)).blob());
  try {
    const { src, out, outline } = planCrop({ w: bmp.width, h: bmp.height }, sel, viewport, opts);

    const canvas = new OffscreenCanvas(out.w, out.h);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('No 2D context');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bmp, src.x, src.y, src.w, src.h, 0, 0, out.w, out.h);

    if (outline) {
      // Outline the user's exact selection so the model knows where the question is.
      ctx.strokeStyle = OUTLINE_COLOR;
      ctx.lineWidth = 3;
      ctx.strokeRect(outline.x, outline.y, outline.w, outline.h);
    }

    let blob = await canvas.convertToBlob({ type: 'image/png' });
    if (blob.size > JPEG_FALLBACK_BYTES) {
      blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.9 });
    }
    return {
      dataUrl: await blobToDataUrl(blob),
      mediaType: blob.type as 'image/png' | 'image/jpeg',
      width: out.w,
      height: out.h,
      outlined: outline !== null,
    };
  } finally {
    bmp.close();
  }
}
