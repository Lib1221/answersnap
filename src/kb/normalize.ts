// Text cleanup for imported sources (spec 10.2). Pure functions so they can be unit tested
// without pdf.js or a browser.

export interface PdfTextItem {
  str: string;
  hasEOL?: boolean;
  /** pdf.js transform matrix; [5] is the baseline y. */
  transform?: number[];
}

/** Join pdf.js text items into lines: break on hasEOL or when the baseline moves. */
export function itemsToText(items: PdfTextItem[]): string {
  let out = '';
  let lastY: number | null = null;
  for (const item of items) {
    const y = item.transform?.[5] ?? null;
    if (lastY !== null && y !== null && Math.abs(y - lastY) > 2 && !out.endsWith('\n')) out += '\n';
    out += item.str;
    if (item.hasEOL) out += '\n';
    if (y !== null) lastY = y;
  }
  return out;
}

const BULLETS = /^[\s]*[•●▪◦‣∙·*]\s*/;

/** Collapse whitespace inside lines, keep bullets as "- ", and drop runs of blank lines. */
export function normalizeText(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/\u00a0/g, ' ')
    .split('\n')
    .map((line) =>
      line
        .replace(BULLETS, '- ')
        .replace(/[ \t]+/g, ' ')
        .trim(),
    )
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Page numbers and dates vary per page; compare lines with digits masked. */
function signature(line: string): string {
  return line.replace(/\d+/g, '#').replace(/\s+/g, ' ').trim().toLowerCase();
}

const EDGE_LINES = 3;

/**
 * Remove header and footer lines repeated on most pages, such as a browser's print header
 * ("9/25/26, 1:40 PM Resume | Name") or "https://site/resume 1/5".
 */
export function stripRepeatedLines(pages: string[]): string[] {
  if (pages.length < 2) return pages;
  const split = pages.map((p) => p.split('\n'));
  const counts = new Map<string, number>();
  for (const lines of split) {
    const nonEmpty = lines.filter((l) => l.trim());
    const edges = new Set(
      [...nonEmpty.slice(0, EDGE_LINES), ...nonEmpty.slice(-EDGE_LINES)].map(signature),
    );
    for (const sig of edges) if (sig) counts.set(sig, (counts.get(sig) ?? 0) + 1);
  }
  const threshold = Math.max(2, Math.ceil(pages.length * 0.6));
  const repeated = new Set([...counts].filter(([, n]) => n >= threshold).map(([sig]) => sig));
  return split.map((lines) => {
    const nonEmptyIdx = lines.map((l, i) => (l.trim() ? i : -1)).filter((i) => i >= 0);
    const edgeIdx = new Set([
      ...nonEmptyIdx.slice(0, EDGE_LINES),
      ...nonEmptyIdx.slice(-EDGE_LINES),
    ]);
    return lines.filter((l, i) => !(edgeIdx.has(i) && repeated.has(signature(l)))).join('\n');
  });
}

/** Scanned or broken PDF: under 200 characters, or under 60% letters (spec 10.2). */
export function looksScanned(text: string): boolean {
  const compact = text.replace(/\s+/g, '');
  if (compact.length < 200) return true;
  const letters = compact.match(/\p{L}/gu)?.length ?? 0;
  return letters / compact.length < 0.6;
}

/** "Real text" length used by the website fallback check (spec 3.7). */
export function realTextLength(text: string): number {
  return text.replace(/\s+/g, ' ').trim().length;
}
