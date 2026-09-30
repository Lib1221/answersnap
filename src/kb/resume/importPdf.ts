import { looksScanned, normalizeText } from '../normalize';
import { FONT_KEYS, type FontKey } from './fontKeys';

// Resume import, step 1: the text of a resume file, for the model to copy into the builder. A
// plain text dump loses what a faithful copy needs, so a PDF becomes "rich lines":
// - **bold** and *italic* runs, from the font names;
// - [text](url) links, from the link annotations;
// - "- " bullets, from bullet glyphs or the small dots a browser draws for list items;
// - " || " between parts of a line printed far apart (a right-aligned date or location, another
//   column). Builders like FlowCV write an entry's date column after its text, so those pieces
//   are moved back next to the line they sit on; a real second column (skills in two columns)
//   stays whole, after the column on its left;
// - a wrapped bullet or paragraph joined back into one line when that is certain.
// The layout code works on plain positioned items, so it is unit tested without pdf.js.

export interface TextItem {
  str: string;
  /** Left edge and baseline in PDF points (y grows up the page). */
  x: number;
  y: number;
  width: number;
  /** Font size in points. */
  size: number;
  bold?: boolean;
  italic?: boolean;
  /** The PDF font name ("AAAAAA+SourceSansPro-Bold"), for the design's font. */
  font?: string;
}

export interface LinkArea {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  url: string;
}

export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface PageContent {
  /** Text items in content-stream order, which is reading order in most PDFs. */
  items: TextItem[];
  links?: LinkArea[];
  /** Small drawn shapes: candidates for list bullets. */
  shapes?: Box[];
}

// ---------------------------------------------------------------------------------------------
// Fonts

/** Bold and italic from a PDF font name: "Arial-BoldMT", "SourceSansPro-It", "CMBX12"... */
export function fontStyle(name: string): { bold: boolean; italic: boolean } {
  const n = name.replace(/^[A-Z]{6}\+/, '');
  const bold =
    /bold|black|heavy|demi|extrab|ultrab/i.test(n) ||
    /(^|[-_,])bd(it)?$/i.test(n) ||
    /^(cmbx|cmb\d|cmssbx|sfbx|sfsx|ptmb|phvb)/i.test(n);
  const italic =
    /italic|oblique|kursiv|slanted/i.test(n) ||
    /(^|[-_,]|[a-z])It$/.test(n) ||
    /^(cmti|cmsl|cmbxti|sfti|sfsl|sfbi|ptmri|phvro)/i.test(n);
  return { bold, italic };
}

const FONT_ALIASES: Record<string, FontKey> = {
  sourcesanspro: 'source-sans-3',
  sourceserifpro: 'source-serif-4',
  sourcecodepro: 'source-code-pro',
  arial: 'helvetica',
  helvetica: 'helvetica',
  helveticaneue: 'helvetica',
  liberationsans: 'helvetica',
  nimbussans: 'helvetica',
  nimbussansl: 'helvetica',
  arimo: 'helvetica',
  times: 'times',
  timesroman: 'times',
  timesnewroman: 'times',
  liberationserif: 'times',
  nimbusroman: 'times',
  nimbusromno: 'times',
  tinos: 'times',
  palatinolinotype: 'palatino',
  bookantiqua: 'palatino',
  trebuchetms: 'trebuchet',
  couriernew: 'courier',
  liberationmono: 'courier',
};

/** The builder font for a PDF font name, when the builder has it. */
export function fontKeyFor(name: string): FontKey | null {
  const family = (name.replace(/^[A-Z]{6}\+/, '').split(/[-,]/)[0] ?? '')
    .replace(/(PSMT|PS|MT)$/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
  for (const f of [family, family.replace(/\d+$/, '')]) {
    if (!f) continue;
    const alias = FONT_ALIASES[f];
    if (alias) return alias;
    const key = FONT_KEYS.find((k) => k.replace(/-/g, '') === f);
    if (key) return key;
  }
  return null;
}

// ---------------------------------------------------------------------------------------------
// Rich lines

/** Text under this size is not part of the resume (hidden keywords, tagging artifacts). */
const MIN_SIZE = 2.5;
const ZERO_WIDTH = /[\u200b-\u200d\u2060\ufeff\u00ad]/g;
const ODD_SPACE = /[\u00a0\u2000-\u200a\u202f\u205f\u3000\t]/g;
const GLYPHS = '•●○◦▪▫■□◆◇►▸▹▶➢➤➔→✓✔❖⦿◉∙·‣⁃';
const BULLET_GLYPH = new RegExp(`^[${GLYPHS}]$`, 'u');
const BULLET_START = new RegExp(`^(?:[${GLYPHS}]\\s*|[-–*]\\s+)`, 'u');
/** Only these links are kept: they're the ones rich text can show. */
const LINK_URL = /^(https?:\/\/|mailto:)\S+$/i;

interface Piece {
  text: string;
  x0: number;
  x1: number;
  y: number;
  /** 0 for a tiny bullet glyph, so it never sets a line's size. */
  size: number;
  bold: boolean;
  italic: boolean;
  url: string | null;
  /** A bullet glyph on its own. */
  glyph: boolean;
  /** First piece of a line joined onto the line above: what goes between them. */
  join?: '' | ' ';
}

interface Line {
  y: number;
  size: number;
  pieces: Piece[];
  bullet: boolean;
  /** The line split at wide gaps; the first part is the main text. */
  parts: Piece[][];
  /** Right-aligned text moved here from later in the stream (an entry's dates). */
  extras: Piece[][];
  /** Right-aligned text with nothing on its left. */
  alone: boolean;
  /** First and last line of a column printed beside the text before it. */
  columnStart: boolean;
  columnEnd: boolean;
  /** A wider gap than usual above the line (a new paragraph, entry, or section). */
  gapBefore: boolean;
  /** Left edge of the text, after any bullet. */
  x: number;
  /** The last visual line of a joined line: baseline, right edge, and whether all of it is styled. */
  lastY: number;
  lastRight: number;
  lastStyled: boolean;
  block: number;
}

/** Right edge of a piece's ink: trailing spaces don't count. */
function inkRight(p: Piece): number {
  const trail = p.text.length - p.text.trimEnd().length;
  return trail && p.text.length ? p.x1 - ((p.x1 - p.x0) * trail) / p.text.length : p.x1;
}

function lineLeft(l: Line): number {
  return l.parts[0]?.[0]?.x0 ?? l.x;
}

function partRight(part: Piece[]): number {
  return Math.max(...part.map(inkRight));
}

function lineRight(l: Line): number {
  return Math.max(...[...l.parts, ...l.extras].map(partRight));
}

function spread(values: number[]): number {
  return Math.max(...values) - Math.min(...values);
}

/**
 * Split an item into pieces by the links over it. Characters are placed proportionally across
 * the item's width, and a link boundary inside a word moves to the word's edge.
 */
function splitByLinks(
  text: string,
  it: TextItem,
  links: LinkArea[],
): { text: string; x0: number; x1: number; url: string | null }[] {
  const w = Math.max(it.width, 0);
  const whole = [{ text, x0: it.x, x1: it.x + w, url: null }];
  const size = Math.max(it.size, 1);
  const band0 = it.y - 0.25 * size;
  const band1 = it.y + 0.85 * size;
  const over = links.filter(
    (l) =>
      Math.min(l.y1, band1) - Math.max(l.y0, band0) >= 0.3 * size && l.x1 > it.x && l.x0 < it.x + w,
  );
  if (!over.length || !text.length) return whole;
  const n = text.length;
  const at = (i: number) => it.x + (w * i) / n;
  const urls = [...text].map((_, i) => {
    const cx = at(i + 0.5);
    return over.find((l) => cx >= l.x0 - 0.5 && cx <= l.x1 + 0.5)?.url ?? null;
  });
  // A link that starts or ends a few characters inside a word takes the whole word.
  const isWord = (i: number) => i >= 0 && i < n && !/\s/.test(text[i]!);
  for (let i = 1; i < n; i++) {
    if (urls[i] === urls[i - 1] || !isWord(i) || !isWord(i - 1)) continue;
    const url = urls[i] ?? urls[i - 1]!;
    let a = i;
    while (isWord(a - 1) && i - a < 3) a--;
    let b = i;
    while (isWord(b) && b - i < 3) b++;
    if (!isWord(a - 1)) for (let k = a; k < i; k++) urls[k] = url;
    else if (!isWord(b)) for (let k = i; k < b; k++) urls[k] = url;
  }
  const out: { text: string; x0: number; x1: number; url: string | null }[] = [];
  let start = 0;
  for (let i = 1; i <= n; i++) {
    if (i < n && urls[i] === urls[start]) continue;
    out.push({ text: text.slice(start, i), x0: at(start), x1: at(i), url: urls[start] ?? null });
    start = i;
  }
  return out;
}

function toPieces(items: TextItem[], links: LinkArea[]): Piece[] {
  const safeLinks = links.filter((l) => LINK_URL.test(l.url.trim()));
  const out: Piece[] = [];
  for (const it of items) {
    const text = it.str.replace(ZERO_WIDTH, '').replace(ODD_SPACE, ' ');
    if (!text.trim()) continue;
    const glyph = BULLET_GLYPH.test(text.trim());
    if (it.size < MIN_SIZE && !glyph) continue;
    const base = {
      y: it.y,
      size: it.size < MIN_SIZE ? 0 : it.size,
      bold: !!it.bold,
      italic: !!it.italic,
      glyph,
    };
    for (const part of splitByLinks(text, it, safeLinks)) {
      if (part.text.trim()) out.push({ ...base, ...part, url: part.url?.trim() ?? null });
    }
  }
  return out;
}

function newLine(p: Piece): Line {
  return {
    y: p.y,
    size: p.size,
    pieces: [p],
    bullet: false,
    parts: [],
    extras: [],
    alone: false,
    columnStart: false,
    columnEnd: false,
    gapBefore: false,
    x: p.x0,
    lastY: p.y,
    lastRight: p.x1,
    lastStyled: false,
    block: 0,
  };
}

/** Consecutive pieces on one baseline form a line, wherever they sit across the page. */
function streamLines(pieces: Piece[]): Line[] {
  const lines: Line[] = [];
  let cur: Line | undefined;
  for (const p of pieces) {
    const tol = 0.4 * Math.max(cur?.size ?? 0, p.size, 1);
    if (cur && Math.abs(p.y - cur.y) <= tol) {
      // A line started by a tiny glyph takes its baseline from the text.
      if (cur.size === 0 && p.size > 0) cur.y = p.y;
      cur.size = Math.max(cur.size, p.size);
      cur.pieces.push(p);
    } else {
      cur = newLine(p);
      lines.push(cur);
    }
  }
  // A bullet glyph on a baseline of its own belongs to the text line right after it.
  for (let i = lines.length - 2; i >= 0; i--) {
    const l = lines[i]!;
    const next = lines[i + 1]!;
    if (
      l.pieces.every((p) => p.glyph) &&
      Math.abs(l.y - next.y) <= 0.8 * Math.max(next.size, 1) &&
      l.pieces[0]!.x0 < next.pieces[0]!.x0
    ) {
      next.pieces.unshift(...l.pieces);
      lines.splice(i, 1);
    }
  }
  return lines;
}

/** Pieces top to bottom and left to right: for PDFs whose stream order is not reading order. */
function byPosition(pieces: Piece[]): Piece[] {
  const sorted = [...pieces].sort((a, b) => b.y - a.y);
  const rows: Piece[][] = [];
  for (const p of sorted) {
    const row = rows.at(-1);
    const tol = 0.4 * Math.max(p.size, row?.[0]?.size ?? 0, 1);
    if (row && Math.abs(row[0]!.y - p.y) <= tol) row.push(p);
    else rows.push([p]);
  }
  return rows.flatMap((r) => r.sort((a, b) => a.x0 - b.x0));
}

/** More upward jumps than a date column or a second column explain: the stream is scrambled. */
function scrambled(lines: Line[]): boolean {
  let jumps = 0;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i]!.y > lines[i - 1]!.y + 0.5 * Math.max(lines[i]!.size, 1)) jumps++;
  }
  return jumps > 6 && jumps > lines.length * 0.35;
}

/** Drawn dots used as bullets: small, round or square, alone, and repeated down the page. */
function bulletDots(shapes: Box[]): Box[] {
  const same = (a: Box, b: Box) =>
    Math.abs(a.x0 - b.x0) < 0.3 &&
    Math.abs(a.x1 - b.x1) < 0.3 &&
    Math.abs(a.y0 - b.y0) < 0.3 &&
    Math.abs(a.y1 - b.y1) < 0.3;
  const touches = (a: Box, b: Box) =>
    a.x0 - 1 < b.x1 && b.x0 < a.x1 + 1 && a.y0 - 1 < b.y1 && b.y0 < a.y1 + 1;
  const small = shapes.filter((s) => {
    const w = s.x1 - s.x0;
    const h = s.y1 - s.y0;
    return w >= 0.8 && h >= 0.8 && w <= 8 && h <= 8 && w / h <= 1.8 && h / w <= 1.8;
  });
  // Icons are drawn from several overlapping shapes; a bullet is one (a fill and a clip of it
  // count as one).
  const alone = small.filter((s) => shapes.every((o) => o === s || same(o, s) || !touches(o, s)));
  return alone.filter((s) =>
    alone.some((o) => o !== s && !same(o, s) && Math.abs(o.x0 - s.x0) < 1),
  );
}

function isDotFor(d: Box, l: Line, left: number): boolean {
  const size = Math.max(l.size, 1);
  const w = d.x1 - d.x0;
  const h = d.y1 - d.y0;
  if (w > 0.6 * size || h > 0.6 * size) return false;
  const cy = (d.y0 + d.y1) / 2;
  if (cy < l.y - 0.15 * size || cy > l.y + 0.75 * size) return false;
  const gap = left - d.x1;
  return gap > 0.05 * size && gap < 2.2 * size;
}

/** Order the pieces, find the bullet, and split the line at wide gaps. */
function finish(l: Line, dots: Box[]): void {
  l.pieces.sort((a, b) =>
    Math.abs(a.x0 - b.x0) < 0.5 ? Number(b.glyph) - Number(a.glyph) : a.x0 - b.x0,
  );
  const first = l.pieces[0]!;
  const mark = first.glyph || /^[-–*]$/.test(first.text.trim());
  if (mark && l.pieces.some((p) => p !== first && !p.glyph)) {
    l.pieces.shift();
    l.bullet = true;
  } else if (!mark && BULLET_START.test(first.text.trimStart())) {
    first.text = first.text.trimStart().replace(BULLET_START, '');
    l.bullet = true;
  }
  // Leftover tiny glyphs are tagging artifacts, not text.
  l.pieces = l.pieces.filter((p) => !(p.glyph && p.size === 0));
  if (!l.pieces.length) return;
  l.x = l.pieces[0]!.x0;
  if (!l.bullet && dots.some((d) => isDotFor(d, l, l.x))) l.bullet = true;
  const gap = 1.6 * Math.max(l.size, 1);
  l.parts = [[l.pieces[0]!]];
  for (const p of l.pieces.slice(1)) {
    const part = l.parts.at(-1)!;
    if (p.x0 - partRight(part) > gap) l.parts.push([p]);
    else part.push(p);
  }
  l.lastY = l.y;
  l.lastRight = partRight(l.parts[0]!);
  l.lastStyled = l.parts[0]!.every((p) => p.bold || p.italic);
}

interface Extent {
  left: number;
  right: number;
}

/**
 * A run of lines the stream went back up for is either an entry's right-aligned dates and place
 * (short, right edges aligned, left edges ragged) or a column of its own.
 */
function isDateColumn(run: Line[], page: Extent): boolean {
  const width = Math.max(page.right - page.left, 1);
  return (
    run.every(
      (l) => lineRight(l) - lineLeft(l) <= 0.45 * width && lineLeft(l) >= page.left + 0.4 * width,
    ) &&
    spread(run.map(lineRight)) <= 3 &&
    (run.length <= 2 || spread(run.map(lineLeft)) > 3)
  );
}

function place(run: Line[], out: Line[], page: Extent): void {
  if (!isDateColumn(run, page)) {
    run[0]!.columnStart = true;
    run.at(-1)!.columnEnd = true;
    out.push(...run);
    return;
  }
  for (const r of run) {
    const tol = 0.4 * Math.max(r.size, 1);
    let partner: Line | undefined;
    for (let i = out.length - 1; i >= 0 && i >= out.length - 200; i--) {
      const c = out[i]!;
      if (c.alone || Math.abs(c.y - r.y) > tol || lineRight(c) > lineLeft(r) + 1) continue;
      if (!partner || lineRight(c) > lineRight(partner)) partner = c;
    }
    if (partner) partner.extras.push(...r.parts, ...r.extras);
    else {
      r.alone = true;
      out.push(r);
    }
  }
}

/**
 * Reading order from stream order. When the stream goes back up the page, the lines above the
 * lowest point so far were printed beside earlier text: an entry's dates, or another column.
 */
function arrange(lines: Line[], page: Extent): Line[] {
  const out: Line[] = [];
  let low = Infinity;
  let i = 0;
  while (i < lines.length) {
    const l = lines[i]!;
    const prev = lines[i - 1];
    const tol = 0.5 * Math.max(l.size, 1);
    if (prev && l.y > prev.y + tol) {
      let j = i;
      while (j < lines.length && lines[j]!.y > low + tol) j++;
      place(arrange(lines.slice(i, j), page), out, page);
      i = j;
      continue;
    }
    out.push(l);
    low = Math.min(low, l.y);
    i++;
  }
  return out;
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)]! : 0;
}

/** Blank lines where the page leaves more room than between the lines of a paragraph. */
function markGaps(lines: Line[]): void {
  const steps = lines
    .slice(1)
    .map((l, i) => lines[i]!.y - l.y)
    .filter((d, i) => d > 0 && d < 3 * Math.max(lines[i + 1]!.size, 1));
  const step = median(steps) || 1.25 * median(lines.map((l) => l.size));
  let block = 0;
  lines.forEach((l, i) => {
    const prev = lines[i - 1];
    if (l.columnStart || prev?.columnEnd) block++;
    l.block = block;
    l.gapBefore = !!prev && (l.columnStart || prev.columnEnd || prev.y - l.y > 1.6 * step);
  });
}

const firstWord = (p: Piece) => p.text.trimStart().split(/\s/)[0] ?? '';

/** How wide the first word of a line is, measured on its piece. */
function firstWordWidth(l: Line): number {
  const p = l.parts[0]![0]!;
  const t = p.text.trimStart();
  return t.length ? ((p.x1 - p.x0) * firstWord(p).length) / t.length : 0;
}

function plainOf(part: Piece[]): string {
  return part.map((p) => p.text).join('');
}

/**
 * Whether `b` continues the bullet or paragraph of `a` after a wrap. Only certain cases join; the
 * model is told to join the rest.
 */
function continues(a: Line, b: Line, wrapRight: number): boolean {
  if (a.alone || b.alone || b.bullet || b.gapBefore || b.columnStart) return false;
  if (a.parts.length !== 1 || b.parts.length !== 1 || !b.parts[0]!.length) return false;
  const size = Math.max(a.size, 1);
  if (Math.abs(a.size - b.size) > 0.5) return false;
  const step = a.lastY - b.y;
  if (step <= 0 || step > 1.6 * size) return false;
  if (Math.abs(b.x - a.x) > Math.max(2, 0.2 * size)) return false;
  // The first word of b would have fit at the end of a: a ended there on purpose.
  if (a.lastRight + 0.25 * size + firstWordWidth(b) <= wrapRight + 1) return false;
  // A heading or title line (all bold or italic) over plain text.
  const head = b.parts[0]![0]!;
  if (a.lastStyled && !(head.bold || head.italic)) return false;
  const end = plainOf(a.parts[0]!).trimEnd();
  const start = plainOf(b.parts[0]!).trimStart();
  if (/[\p{L}\p{N}][-/]$/u.test(end)) return true;
  if (/^[\p{Ll}\d~(&%+,.;:)\]]/u.test(start)) return true;
  // Inside a bullet, a line without a bullet of its own continues it.
  return a.bullet && !/[.!?]$/.test(end);
}

function joinInto(a: Line, b: Line): void {
  const end = plainOf(a.parts[0]!).trimEnd();
  const pieces = b.parts[0]!.map((p, i) =>
    i === 0 ? { ...p, join: /[\p{L}\p{N}][-/]$/u.test(end) ? ('' as const) : (' ' as const) } : p,
  );
  a.parts[0]!.push(...pieces);
  a.extras.push(...b.extras);
  a.lastY = b.lastY;
  a.lastRight = b.lastRight;
  a.lastStyled = b.lastStyled;
}

/**
 * Where lines wrap: the widest line of the paragraph (consecutive lines on one left edge), or
 * for a paragraph of one or two lines, the widest line on that edge in the same column.
 */
function wrapWidths(lines: Line[]): Map<Line, number> {
  const inBlock: { block: number; x: number; right: number }[] = [];
  const edge = (l: Line) => inBlock.find((e) => e.block === l.block && Math.abs(e.x - l.x) <= 2);
  for (const l of lines) {
    if (l.alone) continue;
    const right = partRight(l.parts[0]!);
    const e = edge(l);
    if (e) e.right = Math.max(e.right, right);
    else inBlock.push({ block: l.block, x: l.x, right });
  }
  const out = new Map<Line, number>();
  let para: Line[] = [];
  const flush = () => {
    const local = Math.max(...para.map((l) => partRight(l.parts[0]!)));
    for (const l of para) out.set(l, para.length >= 3 ? local : (edge(l)?.right ?? local));
    para = [];
  };
  for (const l of lines) {
    if (l.alone) continue;
    const prev = para.at(-1);
    if (prev && (l.block !== prev.block || Math.abs(l.x - prev.x) > 2 || l.gapBefore)) flush();
    para.push(l);
  }
  if (para.length) flush();
  return out;
}

function unwrap(lines: Line[]): Line[] {
  const wrap = wrapWidths(lines);
  const out: Line[] = [];
  for (const l of lines) {
    const a = out.at(-1);
    const width = a && wrap.get(a);
    if (a && width !== undefined && continues(a, l, width)) joinInto(a, l);
    else out.push(l);
  }
  return out;
}

interface Run {
  text: string;
  bold: boolean;
  italic: boolean;
  url: string | null;
}

/** Wrap text in marks, keeping its edge spaces outside them (as markdown requires). */
function wrapText(text: string, open: string, close = open): string {
  const core = text.trim();
  if (!core) return text;
  const lead = text.slice(0, text.length - text.trimStart().length);
  const trail = text.slice(text.trimEnd().length);
  return `${lead}${open}${core}${close}${trail}`;
}

function renderPart(part: Piece[]): string {
  const runs: Run[] = [];
  let prev: Piece | undefined;
  for (const p of part) {
    let text = p.text;
    if (prev) {
      const sep = p.join ?? (p.x0 - prev.x1 > 0.15 * Math.max(p.size, prev.size, 1) ? ' ' : '');
      const before = runs.at(-1)?.text ?? '';
      if (sep && !/\s$/.test(before) && !/^\s/.test(text)) text = sep + text;
    }
    const last = runs.at(-1);
    if (last && last.bold === p.bold && last.italic === p.italic && last.url === p.url) {
      last.text += text;
    } else {
      runs.push({ text, bold: p.bold, italic: p.italic, url: p.url });
    }
    prev = p;
  }
  let out = '';
  for (let i = 0; i < runs.length;) {
    const url = runs[i]!.url;
    let inner = '';
    for (; i < runs.length && runs[i]!.url === url; i++) {
      const r = runs[i]!;
      const mark = r.bold && r.italic ? '***' : r.bold ? '**' : r.italic ? '*' : '';
      inner += mark ? wrapText(r.text, mark) : r.text;
    }
    if (!url) out += inner;
    else if (/[[\]]/.test(inner)) out += `${inner} (${url})`;
    else out += wrapText(inner, '[', `](${url})`);
  }
  return out.replace(/\s+/g, ' ').trim();
}

function renderLine(l: Line): string {
  const text = [...l.parts, ...l.extras].map(renderPart).filter(Boolean).join(' || ');
  return `${l.alone ? '|| ' : ''}${l.bullet ? '- ' : ''}${text}`;
}

/** One page as rich lines; '' marks a wider gap (a new paragraph, entry, or section). */
export function pageLines(page: PageContent): string[] {
  const pieces = toPieces(page.items, page.links ?? []);
  if (!pieces.length) return [];
  let lines = streamLines(pieces);
  if (scrambled(lines)) lines = streamLines(byPosition(pieces));
  const dots = bulletDots(page.shapes ?? []);
  for (const l of lines) finish(l, dots);
  lines = lines.filter((l) => l.parts.length);
  if (!lines.length) return [];
  const extent = {
    left: Math.min(...lines.map(lineLeft)),
    right: Math.max(...lines.map(lineRight)),
  };
  const arranged = arrange(lines, extent);
  markGaps(arranged);
  const out: string[] = [];
  for (const l of unwrap(arranged)) {
    const text = renderLine(l);
    if (!text) continue;
    if (l.gapBefore && out.length && out.at(-1) !== '') out.push('');
    out.push(text);
  }
  return out;
}

/** Lines compared across pages: page counters and clock times masked, other digits kept. */
function edgeSignature(line: string): string {
  return line
    .replace(/\bpage\s+\d+(?:\s+of\s+\d+)?/gi, 'page #')
    .replace(/(?<![\d/])\d{1,3}\s*\/\s*\d{1,3}(?![\d/])/g, '#/#')
    .replace(/\b\d{1,2}:\d{2}\b/g, '#:#')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** Print chrome: a browser's date and time, a web address, or a page counter. */
const CHROME = /\b\d{1,2}:\d{2}\b|https?:\/\/|\bpage\s+\d+|(?:^|\s)\d{1,3}\s*\/\s*\d{1,3}\s*$/i;
const EDGE_LINES = 3;

/**
 * Headers and footers repeated at the edges of most pages go. Page 1 keeps its own lines unless
 * they're print chrome: a name and contact line repeated as a Word header stays once, and two
 * different date lines (dates differ in more than a page counter) are never taken for a footer.
 */
function stripPageChrome(pages: string[]): string[] {
  if (pages.length < 2) return pages;
  const split = pages.map((p) => p.split('\n'));
  const edges = (lines: string[]) => {
    const idx = lines.map((l, i) => (l.trim() ? i : -1)).filter((i) => i >= 0);
    return new Set([...idx.slice(0, EDGE_LINES), ...idx.slice(-EDGE_LINES)]);
  };
  const counts = new Map<string, number>();
  for (const lines of split)
    for (const sig of new Set([...edges(lines)].map((i) => edgeSignature(lines[i]!))))
      if (sig) counts.set(sig, (counts.get(sig) ?? 0) + 1);
  const threshold = Math.max(2, Math.ceil(pages.length * 0.6));
  const repeated = new Set([...counts].filter(([, n]) => n >= threshold).map(([sig]) => sig));
  return split.map((lines, page) => {
    const edge = edges(lines);
    return lines
      .filter(
        (l, i) => !(edge.has(i) && repeated.has(edgeSignature(l)) && (page > 0 || CHROME.test(l))),
      )
      .join('\n');
  });
}

/** Rich text of a whole document: pages without repeated headers and footers, marked "[page N]". */
export function richText(pages: PageContent[]): string {
  const texts = stripPageChrome(pages.map((p) => pageLines(p).join('\n')));
  return texts
    .map((t, i) => (i === 0 || !t.trim() ? t : `[page ${i + 1}]\n${t}`))
    .join('\n\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** The builder font most of the text is set in, when the builder has it. */
export function mainFont(pages: PageContent[]): FontKey | null {
  const chars = new Map<FontKey | null, number>();
  for (const p of pages)
    for (const it of p.items) {
      if (!it.font || it.size < MIN_SIZE) continue;
      const key = fontKeyFor(it.font);
      chars.set(key, (chars.get(key) ?? 0) + it.str.trim().length);
    }
  const [best] = [...chars].sort((a, b) => b[1] - a[1])[0] ?? [null];
  return best ?? null;
}

// ---------------------------------------------------------------------------------------------
// Reading files

export type ResumeImportErrorCode =
  'unsupported' | 'too-large' | 'unreadable' | 'empty' | 'scanned';

export class ResumeImportError extends Error {
  constructor(
    readonly code: ResumeImportErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ResumeImportError';
  }
}

export const MAX_RESUME_BYTES = 5 * 1024 * 1024;
const MAX_PAGES = 10;

export interface ExtractedResume {
  /** Rich lines for a PDF; plain text for DOCX and TXT. */
  text: string;
  kind: 'pdf' | 'docx' | 'txt';
  pages: number;
  /** Too little real text: a scan or a picture of a resume. */
  looksScanned: boolean;
  /** PDF only: the page size and the builder font closest to the file's. */
  page?: 'A4' | 'Letter';
  font?: FontKey;
}

type PdfJs = typeof import('pdfjs-dist');

async function loadPdfJs(): Promise<PdfJs> {
  const pdfjs = await import('pdfjs-dist');
  const { default: workerUrl } = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  return pdfjs;
}

type Matrix = [number, number, number, number, number, number];

function multiply(m: Matrix, n: number[]): Matrix {
  const [a = 1, b = 0, c = 0, d = 1, e = 0, f = 0] = n;
  return [
    m[0] * a + m[2] * b,
    m[1] * a + m[3] * b,
    m[0] * c + m[2] * d,
    m[1] * c + m[3] * d,
    m[0] * e + m[2] * f + m[4],
    m[1] * e + m[3] * f + m[5],
  ];
}

/** Small drawn shapes on a page, in page coordinates, from pdf.js's operator list. */
export function smallShapes(
  ops: { fnArray: number[]; argsArray: unknown[] },
  OPS: Record<string, number>,
): Box[] {
  const out: Box[] = [];
  let ctm: Matrix = [1, 0, 0, 1, 0, 0];
  const stack: Matrix[] = [];
  for (let i = 0; i < ops.fnArray.length; i++) {
    const fn = ops.fnArray[i];
    const args = ops.argsArray[i] as unknown[] | null;
    if (fn === OPS.save) stack.push(ctm);
    else if (fn === OPS.restore) ctm = stack.pop() ?? ctm;
    else if (fn === OPS.transform && Array.isArray(args)) ctm = multiply(ctm, args as number[]);
    else if (fn === OPS.paintFormXObjectBegin) {
      stack.push(ctm);
      const m = args?.[0];
      if (m && typeof m === 'object' && 'length' in m)
        ctm = multiply(ctm, Array.from(m as number[]));
    } else if (fn === OPS.paintFormXObjectEnd) ctm = stack.pop() ?? ctm;
    else if (fn === OPS.constructPath) {
      // pdf.js gives the path's bounding box in the current coordinates as the third argument.
      const mm = args?.[2];
      if (!mm || typeof mm !== 'object' || !('length' in mm)) continue;
      const [x0, y0, x1, y1] = Array.from(mm as number[]);
      if (![x0, y0, x1, y1].every((v) => typeof v === 'number' && Number.isFinite(v))) continue;
      const pts = [
        [x0!, y0!],
        [x1!, y1!],
        [x0!, y1!],
        [x1!, y0!],
      ].map(([x, y]) => [ctm[0] * x! + ctm[2] * y! + ctm[4], ctm[1] * x! + ctm[3] * y! + ctm[5]]);
      const xs = pts.map((p) => p[0]!);
      const ys = pts.map((p) => p[1]!);
      const box = {
        x0: Math.min(...xs),
        y0: Math.min(...ys),
        x1: Math.max(...xs),
        y1: Math.max(...ys),
      };
      if (box.x1 - box.x0 <= 12 && box.y1 - box.y0 <= 12) out.push(box);
    }
  }
  return out;
}

interface PdfFont {
  name?: string;
  bold?: boolean;
  italic?: boolean;
  black?: boolean;
}

/**
 * A PDF's rich lines. Fonts (for bold and italic) and drawn bullets need the page's operator list;
 * when that fails the text still comes through, plain.
 */
export async function extractPdfResume(
  data: ArrayBuffer,
  load: () => Promise<PdfJs> = loadPdfJs,
): Promise<ExtractedResume> {
  const pdfjs = await load();
  // disableFontFace: fonts are read for their names only, never added to the page.
  const task = pdfjs.getDocument({ data: new Uint8Array(data), disableFontFace: true });
  const doc = await task.promise;
  try {
    const pages: PageContent[] = [];
    let size: 'A4' | 'Letter' | undefined;
    for (let n = 1; n <= Math.min(doc.numPages, MAX_PAGES); n++) {
      const page = await doc.getPage(n);
      if (n === 1) {
        const [x0 = 0, y0 = 0, x1 = 0, y1 = 0] = page.view;
        const w = Math.abs(x1 - x0);
        const h = Math.abs(y1 - y0);
        size = Math.abs(w - 612) < 4 && Math.abs(h - 792) < 4 ? 'Letter' : 'A4';
      }
      let shapes: Box[] = [];
      let fontsReady = false;
      try {
        const ops = await page.getOperatorList();
        fontsReady = true;
        shapes = smallShapes(ops, pdfjs.OPS as unknown as Record<string, number>);
      } catch {
        // No styles or drawn bullets for this page.
      }
      const fonts = new Map<string, { name: string; bold: boolean; italic: boolean }>();
      const fontOf = (id: string) => {
        let f = fonts.get(id);
        if (!f) {
          f = { name: '', bold: false, italic: false };
          if (fontsReady) {
            try {
              const obj = page.commonObjs.get(id) as PdfFont | null;
              const style = fontStyle(obj?.name ?? '');
              f = {
                name: obj?.name ?? '',
                bold: style.bold || !!obj?.bold || !!obj?.black,
                italic: style.italic || !!obj?.italic,
              };
            } catch {
              // Font not loaded: plain text.
            }
          }
          fonts.set(id, f);
        }
        return f;
      };
      const content = await page.getTextContent();
      const items: TextItem[] = [];
      for (const it of content.items) {
        if (!('str' in it) || !it.str) continue;
        const [a = 1, b = 0, c = 0, d = 1, e = 0, f = 0] = it.transform as number[];
        // Rotated text (a margin note, a watermark) is not part of the resume's lines.
        if (Math.abs(b) > 0.05 * Math.abs(a) || Math.abs(c) > 0.05 * Math.abs(d)) continue;
        const font = fontOf(it.fontName);
        items.push({
          str: it.str,
          x: e,
          y: f,
          width: it.width,
          size: Math.hypot(c, d) || it.height,
          bold: font.bold,
          italic: font.italic,
          font: font.name,
        });
      }
      let links: LinkArea[] = [];
      try {
        const annotations = (await page.getAnnotations()) as {
          subtype?: string;
          rect?: number[];
          url?: string;
          unsafeUrl?: string;
        }[];
        links = annotations.flatMap((an) => {
          const url = an.url ?? an.unsafeUrl;
          const [x0, y0, x1, y1] = an.rect ?? [];
          if (an.subtype !== 'Link' || !url || x0 === undefined || y1 === undefined) return [];
          return [
            {
              x0: Math.min(x0, x1!),
              y0: Math.min(y0!, y1),
              x1: Math.max(x0, x1!),
              y1: Math.max(y0!, y1),
              url,
            },
          ];
        });
      } catch {
        // No links for this page.
      }
      pages.push({ items, links, shapes });
      page.cleanup();
    }
    const plain = pages.flatMap((p) => p.items.map((it) => it.str)).join(' ');
    return {
      text: richText(pages),
      kind: 'pdf',
      pages: doc.numPages,
      looksScanned: looksScanned(plain),
      page: size,
      font: mainFont(pages) ?? undefined,
    };
  } finally {
    await task.destroy();
  }
}

/**
 * A DOCX resume as rich lines, like a PDF's: a paragraph or heading per line (a blank line after
 * it), list items as "- " bullets, table rows with " || " between cells, and bold, italics, and
 * links kept. Read from mammoth's HTML with DOMParser, which never runs or loads anything.
 */
export async function docxRichText(data: ArrayBuffer): Promise<string> {
  const mammoth = await import('mammoth');
  // The browser build reads `arrayBuffer`; Node's (unit tests) reads `buffer`.
  const input = { arrayBuffer: data, buffer: data } as unknown as { arrayBuffer: ArrayBuffer };
  const { value } = await mammoth.convertToHtml(input);
  const doc = new DOMParser().parseFromString(value, 'text/html');
  const out: string[] = [];
  const flat = (x: string) => x.replace(/\s+/g, ' ').trim();
  const inline = (node: Node): string => {
    if (node.nodeType === 3) return node.textContent ?? '';
    if (node.nodeType !== 1) return '';
    const el = node as Element;
    const tag = el.tagName.toLowerCase();
    // Nested lists are read as lines of their own.
    if (tag === 'ul' || tag === 'ol') return '';
    if (tag === 'br') return ' ';
    const inner = [...el.childNodes].map(inline).join('');
    if (!inner.trim()) return tag === 'p' ? ' ' : inner;
    if (tag === 'strong' || tag === 'b') return wrapText(inner, '**');
    if (tag === 'em' || tag === 'i') return wrapText(inner, '*');
    if (tag === 'a') {
      const href = el.getAttribute('href') ?? '';
      return /^(https?:\/\/|mailto:)\S+$/i.test(href) ? wrapText(inner, '[', `](${href})`) : inner;
    }
    return /^(p|div|h[1-6]|li|td|th)$/.test(tag) ? `${inner} ` : inner;
  };
  const blocks = (el: Element) => {
    for (const child of el.children) {
      const tag = child.tagName.toLowerCase();
      if (tag === 'p' || /^h[1-6]$/.test(tag)) {
        const text = flat(inline(child));
        if (text) out.push(text, '');
      } else if (tag === 'ul' || tag === 'ol') {
        for (const li of child.children) {
          if (li.tagName.toLowerCase() !== 'li') continue;
          const text = flat(inline(li));
          if (text) out.push(`- ${text}`);
          blocks(li);
        }
        out.push('');
      } else if (tag === 'table') {
        for (const tr of child.querySelectorAll('tr')) {
          const cells = [...tr.children].map((c) => flat(inline(c))).filter(Boolean);
          if (cells.length) out.push(cells.join(' || '));
        }
        out.push('');
      } else blocks(child);
    }
  };
  blocks(doc.body);
  // Typed bullet characters become "- "; "**" at a line's start is bold, not a bullet.
  return out
    .map((l) =>
      l
        .replace(/^(?:[•●▪◦‣∙·]|\*(?=\s))\s*/, '- ')
        .replace(/[ \t]+/g, ' ')
        .trim(),
    )
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Text of a resume file: PDF and DOCX as rich lines, TXT as plain text. */
export async function extractResumeFile(file: File): Promise<ExtractedResume> {
  const ext = file.name.toLowerCase().split('.').pop();
  if (ext !== 'pdf' && ext !== 'docx' && ext !== 'txt') {
    throw new ResumeImportError('unsupported', 'Use a PDF, DOCX, or TXT file.');
  }
  if (file.size > MAX_RESUME_BYTES) {
    throw new ResumeImportError(
      'too-large',
      'That file is over 5 MB. Try a smaller export of your resume.',
    );
  }
  let result: ExtractedResume;
  try {
    if (ext === 'pdf') result = await extractPdfResume(await file.arrayBuffer());
    else if (ext === 'docx') {
      const text = await docxRichText(await file.arrayBuffer());
      result = { text, kind: 'docx', pages: 1, looksScanned: false };
    } else {
      const text = normalizeText(await file.text());
      result = { text, kind: 'txt', pages: 1, looksScanned: false };
    }
  } catch (err) {
    console.warn('[AnswerSnap] resume import: could not read the file', err);
    throw new ResumeImportError('unreadable', "Couldn't read that file. Try a PDF, DOCX, or TXT.");
  }
  if (result.kind === 'pdf' && result.looksScanned) {
    throw new ResumeImportError(
      'scanned',
      'This PDF has no readable text. It may be a scan or a photo of your resume. Import the original PDF, or a DOCX or TXT copy.',
    );
  }
  if (result.text.replace(/\s+/g, '').length < 40) {
    throw new ResumeImportError('empty', 'That file has no text to import.');
  }
  return result;
}
