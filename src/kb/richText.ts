// Rich text for resume descriptions, stored as a small markdown subset and rendered as Vue
// elements (never as HTML: hard rule 4). Supported: paragraphs, "- " bullets, "1. " numbered
// items, **bold**, *italic*, __underline__, and [text](url) links (http, https, mailto only).

export type Inline =
  | { kind: 'text'; text: string }
  | { kind: 'bold' | 'italic' | 'underline'; children: Inline[] }
  | { kind: 'link'; href: string; children: Inline[] };

export type Block =
  | { kind: 'paragraph'; inlines: Inline[] }
  | { kind: 'bullets'; items: Inline[][] }
  // start: the number typed on the first item ("3. Won" shows 3). Absent means 1.
  | { kind: 'numbered'; items: Inline[][]; start?: number };

const SAFE_URL = /^(https?:\/\/|mailto:)/i;

/** A URL safe to put in href, or null. Bare domains get https://. */
export function safeUrl(url: string): string | null {
  const u = url.trim();
  if (!u) return null;
  if (SAFE_URL.test(u)) return u;
  if (/^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(u)) return `https://${u}`;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(u)) return `mailto:${u}`;
  return null;
}

// Emphasis follows CommonMark's delimiter-run rules, cut down to what the toolbar writes: a run
// of "*" or "__" can open when the next character isn't a space and close when the previous one
// isn't, and each closer pairs with the nearest opener. So "***x***" is bold and italic, and
// "**a *b***" is bold with an italic end, with no stray stars. "_" alone is plain text.
interface Delim {
  kind: 'delim';
  ch: '*' | '_';
  /** Characters not yet used by a mark. */
  n: number;
  /** Run length as typed. */
  orig: number;
  open: boolean;
  close: boolean;
}

type Item = Inline | Delim;

const isSpace = (c: string | undefined) => c === undefined || /\s/.test(c);

/** The link starting at the "[" at src[i]: [text](url), with balanced parentheses in the url. */
function linkAt(src: string, i: number): { text: string; href: string; end: number } | null {
  const close = src.indexOf(']', i + 1);
  if (close === -1 || src[close + 1] !== '(') return null;
  const text = src.slice(i + 1, close);
  // "[2023] of [the paper](url)": the first "[" is literal, not the start of a link.
  if (text.includes('[')) return null;
  let depth = 0;
  for (let j = close + 2; j < src.length; j++) {
    if (src[j] === '(') depth++;
    else if (src[j] === ')') {
      if (depth > 0) {
        depth--;
        continue;
      }
      const href = safeUrl(src.slice(close + 2, j));
      return href ? { text, href, end: j + 1 } : null;
    }
  }
  return null;
}

function canPair(opener: Delim, closer: Delim): boolean {
  if (opener.ch === '_') return opener.n >= 2 && closer.n >= 2;
  // CommonMark's rule of 3, so "*a**b**c*" is italic around a bold "b".
  const both = opener.close || closer.open;
  const sum = opener.orig + closer.orig;
  return !(both && sum % 3 === 0 && (opener.orig % 3 !== 0 || closer.orig % 3 !== 0));
}

/** Items to inlines: leftover delimiters become text, and neighboring text merges. */
function toInlines(items: Item[]): Inline[] {
  const out: Inline[] = [];
  for (const it of items) {
    const x: Inline = it.kind === 'delim' ? { kind: 'text', text: it.ch.repeat(it.n) } : it;
    const last = out.at(-1);
    if (x.kind === 'text' && last?.kind === 'text') {
      out[out.length - 1] = { kind: 'text', text: last.text + x.text };
    } else if (x.kind !== 'text' || x.text) {
      out.push(x);
    }
  }
  return out;
}

function resolveMarks(items: Item[]): Inline[] {
  let c = 0;
  while (c < items.length) {
    const closer = items[c]!;
    if (closer.kind !== 'delim' || !closer.close) {
      c++;
      continue;
    }
    let o = c - 1;
    for (; o >= 0; o--) {
      const op = items[o]!;
      if (op.kind === 'delim' && op.ch === closer.ch && op.open && canPair(op, closer)) break;
    }
    if (o < 0) {
      c++;
      continue;
    }
    const opener = items[o] as Delim;
    const use = opener.ch === '_' || (opener.n >= 2 && closer.n >= 2) ? 2 : 1;
    const kind: 'bold' | 'italic' | 'underline' =
      opener.ch === '_' ? 'underline' : use === 2 ? 'bold' : 'italic';
    const node: Inline = { kind, children: toInlines(items.slice(o + 1, c)) };
    opener.n -= use;
    closer.n -= use;
    const keep: Item[] = [...(opener.n ? [opener] : []), node, ...(closer.n ? [closer] : [])];
    items.splice(o, c - o + 1, ...keep);
    // A closer with characters left ("***" after closing "*") goes round again.
    c = o + keep.length - (closer.n ? 1 : 0);
  }
  return toInlines(items);
}

/** Parse inline marks. Unclosed marks are kept as plain text. */
export function parseInline(src: string): Inline[] {
  const items: Item[] = [];
  let text = '';
  const flush = () => {
    if (text) items.push({ kind: 'text', text });
    text = '';
  };
  let i = 0;
  while (i < src.length) {
    const c = src[i]!;
    if (c === '[') {
      const link = linkAt(src, i);
      if (link) {
        flush();
        items.push({ kind: 'link', href: link.href, children: parseInline(link.text) });
        i = link.end;
        continue;
      }
    }
    if (c === '*' || c === '_') {
      let j = i;
      while (src[j] === c) j++;
      const n = j - i;
      // A mark needs content and no space right inside it ("* item" and "2 * 3" are not italic).
      const open = !isSpace(src[j]);
      const close = !isSpace(src[i - 1]);
      if ((open || close) && (c === '*' || n >= 2)) {
        flush();
        items.push({ kind: 'delim', ch: c, n, orig: n, open, close });
      } else {
        text += src.slice(i, j);
      }
      i = j;
      continue;
    }
    text += c;
    i++;
  }
  flush();
  return resolveMarks(items);
}

const BULLET = /^\s*[-•*]\s+(.*)$/;
// Up to 9 digits, as in CommonMark, so the number is a sane <ol start>.
const NUMBERED = /^\s*(\d{1,9})[.)]\s+(.*)$/;

export function parseRich(src: string): Block[] {
  const blocks: Block[] = [];
  const lines = src.replace(/\r\n?/g, '\n').split('\n');
  let para: string[] = [];
  const flushPara = () => {
    if (para.length) blocks.push({ kind: 'paragraph', inlines: parseInline(para.join(' ')) });
    para = [];
  };
  for (const line of lines) {
    const b = line.match(BULLET);
    const n = b ? null : line.match(NUMBERED);
    if (b) {
      flushPara();
      const item = parseInline(b[1]!);
      const last = blocks.at(-1);
      if (last?.kind === 'bullets') last.items.push(item);
      else blocks.push({ kind: 'bullets', items: [item] });
    } else if (n) {
      flushPara();
      const item = parseInline(n[2]!);
      const last = blocks.at(-1);
      // Later items count on from the first one, whatever number they were typed with.
      if (last?.kind === 'numbered') last.items.push(item);
      else blocks.push({ kind: 'numbered', items: [item], start: Number(n[1]) });
    } else if (!line.trim()) {
      flushPara();
    } else {
      para.push(line.trim());
    }
  }
  flushPara();
  return blocks;
}

/** Plain text of rich text: for search, ATS checks, and AI prompts. */
export function plainText(src: string): string {
  const walk = (xs: Inline[]): string =>
    xs.map((x) => (x.kind === 'text' ? x.text : walk(x.children))).join('');
  return parseRich(src)
    .map((b) => {
      if (b.kind === 'paragraph') return walk(b.inlines);
      const first = b.kind === 'numbered' ? (b.start ?? 1) : 0;
      return b.items
        .map((it, i) => `${b.kind === 'bullets' ? '-' : `${first + i}.`} ${walk(it)}`)
        .join('\n');
    })
    .join('\n');
}

// Editing helpers for the toolbar: they work on a textarea's value and selection.

export interface Edit {
  value: string;
  start: number;
  end: number;
}

/** How many `ch` characters end `s`, or start it when `atStart`. */
function runLength(s: string, ch: string, atStart: boolean): number {
  let n = 0;
  while (n < s.length && s[atStart ? n : s.length - 1 - n] === ch) n++;
  return n;
}

// Whether a run of mark characters beside the selection holds the mark: "***x***" is bold and
// italic, so a run of 3 holds both, while 2 is only bold and 1 only italic.
const HOLDS: Record<'**' | '*' | '__', (n: number) => boolean> = {
  '*': (n) => n === 1 || n === 3,
  '**': (n) => n === 2 || n === 3,
  __: (n) => n >= 2,
};

/** Wrap the selection in a mark; unwrap when it's already wrapped. */
export function toggleMark(e: Edit, mark: '**' | '*' | '__'): Edit {
  const before = e.value.slice(0, e.start);
  const sel = e.value.slice(e.start, e.end);
  const after = e.value.slice(e.end);
  const ch = mark[0]!;
  const holds = HOLDS[mark];
  if (holds(runLength(before, ch, false)) && holds(runLength(after, ch, true))) {
    return {
      value: before.slice(0, -mark.length) + sel + after.slice(mark.length),
      start: e.start - mark.length,
      end: e.end - mark.length,
    };
  }
  return {
    value: before + mark + sel + mark + after,
    start: e.start + mark.length,
    end: e.end + mark.length,
  };
}

/** Turn the selected lines into bullets or numbers, or back into plain lines. */
export function toggleList(e: Edit, kind: 'bullets' | 'numbered'): Edit {
  const lineStart = e.value.lastIndexOf('\n', e.start - 1) + 1;
  const nl = e.value.indexOf('\n', e.end);
  const lineEnd = nl === -1 ? e.value.length : nl;
  const lines = e.value.slice(lineStart, lineEnd).split('\n');
  const re = kind === 'bullets' ? BULLET : NUMBERED;
  const allListed = lines.every((l) => !l.trim() || re.test(l));
  const next = lines.map((l, i) => {
    if (!l.trim()) return l;
    const bare = l.replace(BULLET, '$1').replace(NUMBERED, '$2');
    if (allListed) return bare;
    return kind === 'bullets' ? `- ${bare}` : `${i + 1}. ${bare}`;
  });
  const block = next.join('\n');
  return {
    value: e.value.slice(0, lineStart) + block + e.value.slice(lineEnd),
    start: lineStart,
    end: lineStart + block.length,
  };
}

export function insertLink(e: Edit, url: string): Edit {
  const text = e.value.slice(e.start, e.end) || url;
  // Percent-encoded parentheses are the same URL and can't end the link early.
  const href = url.replace(/\(/g, '%28').replace(/\)/g, '%29');
  const link = `[${text}](${href})`;
  return {
    value: e.value.slice(0, e.start) + link + e.value.slice(e.end),
    start: e.start,
    end: e.start + link.length,
  };
}
