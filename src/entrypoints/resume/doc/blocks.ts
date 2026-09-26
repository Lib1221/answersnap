import {
  LIST_TYPES,
  SECTION_SETUP,
  type Design,
  type Entry,
  type Resume,
  type Section,
} from '@/kb/resume/model';

// The document is a list of blocks that are measured and packed onto pages. Like FlowCV, a page
// can break between the bullets and paragraphs of an entry or a text section, and between the
// rows of a skills list, but never inside a line; a section heading always travels with its first
// block, and an entry's title with its first bullet. The same blocks render the preview and the
// PDF, so both paginate identically.

export type Column = 'main' | 'side' | 'full';

/** One piece of rich text that can start a page: a paragraph or a single list item. */
export interface Unit {
  /** Markdown source of just this piece (a numbered item keeps its real number). */
  text: string;
  kind: 'p' | 'li';
}

export type Block = (
  | { id: string; kind: 'header'; column: Column }
  | {
      id: string;
      kind: 'entry';
      column: Column;
      section: Section;
      entry: Entry;
      /** First entry of its section: the heading renders with it. */
      withHeading: boolean;
      /** The first piece of the description; the rest follow as 'more' blocks. */
      desc: string;
    }
  | {
      id: string;
      kind: 'text';
      column: Column;
      section: Section;
      withHeading: true;
      /** The first piece of the text; the rest follow as 'more' blocks. */
      text: string;
      /** Last piece of a declaration: the signature renders under it. */
      last: boolean;
    }
  | {
      id: string;
      kind: 'more';
      column: Column;
      section: Section;
      /** The entry this piece belongs to (none for profile and declaration text). */
      entry: Entry | null;
      withHeading: false;
      text: string;
      /** Spacing above: tight between list items, a little more before a paragraph. */
      join: 'li' | 'p';
      last: boolean;
    }
  | {
      id: string;
      kind: 'list';
      column: Column;
      section: Section;
      entries: Entry[];
      withHeading: boolean;
    }
) & {
  /** First block of a section set to start on a new page. */
  breakBefore?: boolean;
};

/** How a skills, languages, or interests section shows: its own choice or the design's. */
export function listLayout(s: Section, d: Design): Design['skillsLayout'] {
  return s.layout === 'design' ? d.skillsLayout : s.layout;
}
export function levelStyle(s: Section, d: Design): Design['levelStyle'] {
  return s.levelStyle === 'design' ? d.levelStyle : s.levelStyle;
}

export function visibleEntries(s: Section): Entry[] {
  return s.entries.filter(
    (e) => !e.hidden && (e.title.trim() || e.subtitle.trim() || e.description.trim()),
  );
}

// Same list markers as src/kb/richText.ts.
const BULLET = /^\s*[-•*]\s+/;
const NUMBERED = /^\s*(\d{1,9})[.)]\s+(.*)$/;

/**
 * Split rich text into pieces a page may break between: each paragraph, and each list item.
 * A numbered item gets its running number written out, so it shows the right number alone.
 */
export function splitRich(src: string): Unit[] {
  const units: Unit[] = [];
  let para: string[] = [];
  let lastList: 'bullets' | 'numbered' | null = null;
  let next = 1;
  const flush = () => {
    if (para.length) {
      units.push({ text: para.join('\n'), kind: 'p' });
      lastList = null;
    }
    para = [];
  };
  for (const line of src.replace(/\r\n?/g, '\n').split('\n')) {
    const n = line.match(NUMBERED);
    if (BULLET.test(line)) {
      flush();
      units.push({ text: line.trim(), kind: 'li' });
      lastList = 'bullets';
    } else if (n) {
      flush();
      // A run of numbered items counts on from its first number, like the renderer.
      const num = lastList === 'numbered' ? next : Number(n[1]);
      units.push({ text: `${num}. ${n[2]}`, kind: 'li' });
      lastList = 'numbered';
      next = num + 1;
    } else if (!line.trim()) {
      flush();
    } else {
      para.push(line.trim());
    }
  }
  flush();
  return units;
}

/** Items per row of a list layout, so long lists can break between rows. */
function rowSize(s: Section, d: Design, column: Column): number {
  const layout = listLayout(s, d);
  if (layout === 'list') return 1;
  if (layout === 'grid') return column === 'side' ? 1 : s.gridColumns;
  return Infinity; // bubbles and one-line lists wrap freely: one block
}

export function buildBlocks(r: Resume): Block[] {
  const d = r.design;
  const two = d.columns === 'two';
  const col = (s: Section): Column => (two ? s.column : 'main');
  const blocks: Block[] = [
    { id: 'header', kind: 'header', column: two && d.header === 'side' ? 'side' : 'full' },
  ];
  const more = (s: Section, entry: Entry | null, units: Unit[], prefix: string) =>
    units.slice(1).forEach((u, i) =>
      blocks.push({
        id: `${prefix}:m${i + 1}`,
        kind: 'more',
        column: col(s),
        section: s,
        entry,
        withHeading: false,
        text: u.text,
        join: u.kind === 'li' && units[i]!.kind === 'li' ? 'li' : 'p',
        last: i === units.length - 2,
      }),
    );

  for (const s of r.sections) {
    if (s.hidden) continue;
    const breakBefore = s.breakBefore || undefined;
    const setup = SECTION_SETUP[s.type];
    if (setup.textOnly) {
      const units = splitRich(s.text);
      const sig = s.signature;
      const signed = s.type === 'declaration' && Boolean(sig.name || sig.place || sig.date);
      if (!units.length && !signed) continue;
      blocks.push({
        id: `${s.id}:text`,
        kind: 'text',
        column: col(s),
        section: s,
        withHeading: true,
        text: units[0]?.text ?? '',
        last: units.length <= 1,
        breakBefore,
      });
      more(s, null, units, `${s.id}:text`);
      continue;
    }
    const entries = visibleEntries(s);
    if (!entries.length) continue;
    if (LIST_TYPES.has(s.type)) {
      const size = rowSize(s, d, col(s));
      for (let i = 0; i < entries.length; i += size)
        blocks.push({
          id: `${s.id}:list${i ? `:${i}` : ''}`,
          kind: 'list',
          column: col(s),
          section: s,
          entries: entries.slice(i, i + size),
          withHeading: i === 0,
          breakBefore: i === 0 ? breakBefore : undefined,
        });
      continue;
    }
    entries.forEach((entry, i) => {
      const units = splitRich(entry.description);
      const id = `${s.id}:${entry.id}`;
      blocks.push({
        id,
        kind: 'entry',
        column: col(s),
        section: s,
        entry,
        withHeading: i === 0,
        desc: units[0]?.text ?? '',
        breakBefore: i === 0 ? breakBefore : undefined,
      });
      more(s, entry, units, id);
    });
  }
  return blocks;
}

export interface Page {
  header: boolean;
  main: Block[];
  side: Block[];
}

/**
 * Pack measured blocks onto pages, column by column. `heights` are in px including the block's
 * own top spacing; a block that starts a page drops that spacing (`spacing` map).
 */
export function paginate(
  blocks: Block[],
  heights: Map<string, number>,
  spacing: Map<string, number>,
  capacity: number,
  headerHeight: number,
  headerInColumn: boolean,
): Page[] {
  const pages: Page[] = [{ header: true, main: [], side: [] }];
  const header = blocks.find((b) => b.kind === 'header');
  for (const column of ['main', 'side'] as const) {
    let p = 0;
    let used = headerInColumn ? 0 : headerHeight;
    // A header in the side column is the first block of that column.
    const list = blocks.filter((b) => b.kind !== 'header' && b.column === column);
    if (header && headerInColumn && column === 'side') list.unshift(header);
    for (const b of list) {
      const full = heights.get(b.id) ?? 0;
      const gap = spacing.get(b.id) ?? 0;
      const empty = pages[p]![column].length === 0;
      const need = empty ? full - gap : full;
      // Under the header, page 1 is not empty: a block that doesn't fit there moves on.
      const overflow = used + need > capacity && (!empty || used > 0);
      if ((!empty && b.breakBefore) || overflow) {
        p += 1;
        used = 0;
        pages[p] ??= { header: false, main: [], side: [] };
      }
      const firstOnPage = pages[p]![column].length === 0;
      pages[p]![column].push(b);
      used += firstOnPage ? full - gap : full;
    }
  }
  return pages;
}
