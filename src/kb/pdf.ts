import {
  itemsToText,
  looksScanned,
  normalizeText,
  stripRepeatedLines,
  type PdfTextItem,
} from './normalize';

// PDF import (spec 10.2). Options page only; pdf.js is loaded on demand so it never lands in
// the side panel bundle. pdf.js 6 has no eval code path (the old isEvalSupported option is gone).

async function loadPdfJs() {
  const pdfjs = await import('pdfjs-dist');
  const { default: workerUrl } = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  return pdfjs;
}

export interface PdfExtract {
  text: string;
  pages: number;
  /** Too little text, or mostly non-letters: offer "Read with AI". */
  looksScanned: boolean;
}

export async function extractPdfText(data: ArrayBuffer): Promise<PdfExtract> {
  const pdfjs = await loadPdfJs();
  const task = pdfjs.getDocument({ data: new Uint8Array(data) });
  const doc = await task.promise;
  try {
    const pages: string[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      pages.push(
        itemsToText(content.items.filter((it): it is PdfTextItem & typeof it => 'str' in it)),
      );
      page.cleanup();
    }
    const text = normalizeText(stripRepeatedLines(pages).join('\n\n'));
    return { text, pages: doc.numPages, looksScanned: looksScanned(text) };
  } finally {
    await task.destroy();
  }
}

/** Render pages as images (max 1568 px long edge) for vision transcription. */
export async function renderPdfPages(
  data: ArrayBuffer,
  maxEdge = 1568,
  maxPages = 10,
): Promise<string[]> {
  const pdfjs = await loadPdfJs();
  const task = pdfjs.getDocument({ data: new Uint8Array(data) });
  const doc = await task.promise;
  try {
    const images: string[] = [];
    for (let i = 1; i <= Math.min(doc.numPages, maxPages); i++) {
      const page = await doc.getPage(i);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: maxEdge / Math.max(base.width, base.height) });
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      await page.render({ canvas, viewport }).promise;
      images.push(canvas.toDataURL('image/jpeg', 0.9));
      page.cleanup();
    }
    return images;
  } finally {
    await task.destroy();
  }
}
