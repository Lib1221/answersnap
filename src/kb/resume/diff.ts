import type { Resume } from './model';
import { sectionTitle } from './model';
import { joinUnits } from './tailorApply';
import { plainText, splitRich, type Unit } from '../richText';

// "What changed": a tailored copy against the master it was made from, change by change, with
// an undo for each. A copy keeps the master's section and entry ids, so entries pair up by id.

export interface Piece {
  kind: 'same' | 'del' | 'ins';
  text: string;
}

/** Word-level difference of two texts: kept, removed, and added runs, spaces included. */
export function wordDiff(before: string, after: string): Piece[] {
  const a = before.match(/\s+|[^\s]+/g) ?? [];
  const b = after.match(/\s+|[^\s]+/g) ?? [];
  // Longest common subsequence over tokens. Lines are short, so O(n·m) is fine.
  const lcs = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--)
      lcs[i]![j] =
        a[i] === b[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
  const out: Piece[] = [];
  const push = (kind: Piece['kind'], text: string) => {
    const last = out.at(-1);
    if (last?.kind === kind) last.text += text;
    else out.push({ kind, text });
  };
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      push('same', a[i]!);
      i++;
      j++;
    } else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) push('del', a[i++]!);
    else push('ins', b[j++]!);
  }
  while (i < a.length) push('del', a[i++]!);
  while (j < b.length) push('ins', b[j++]!);
  // A lone space between two changes reads as part of them.
  return out.filter((p) => p.text.length);
}

export type ChangeKind =
  'headline' | 'summary' | 'line-changed' | 'line-added' | 'line-removed' | 'hidden' | 'order';

export interface Change {
  /** Stable for one pair of resumes: where and what. */
  id: string;
  kind: ChangeKind;
  /** "Title line", "Experience: Ledgerly". */
  where: string;
  before: string;
  after: string;
  sectionId: string | null;
  entryId: string | null;
  /** The line's place in the master's and the copy's description (-1 when it has none). */
  from: number;
  to: number;
}

const words = (t: string) =>
  new Set(
    plainText(t)
      .toLowerCase()
      .split(/[^\p{L}\p{N}+#.]+/u)
      .filter((w) => w.length > 2),
  );
/** How much two lines share: the reworded version of a line keeps most of its words. */
function overlap(a: string, b: string): number {
  const x = words(a);
  const y = words(b);
  if (!x.size || !y.size) return 0;
  let shared = 0;
  for (const w of x) if (y.has(w)) shared++;
  return shared / Math.min(x.size, y.size);
}
const bare = (u: Unit) => u.text.replace(/^(- |\d+\. )/, '').trim();

/** Master lines paired with the copy's: equal lines first, then the closest rewording. */
function pairLines(master: Unit[], copy: Unit[]): Map<number, number> {
  const pairs = new Map<number, number>();
  const taken = new Set<number>();
  master.forEach((u, i) => {
    const j = copy.findIndex((c, k) => !taken.has(k) && bare(c) === bare(u));
    if (j !== -1) {
      pairs.set(i, j);
      taken.add(j);
    }
  });
  const scored: [number, number, number][] = [];
  master.forEach((u, i) => {
    if (pairs.has(i)) return;
    copy.forEach((c, j) => {
      if (taken.has(j)) return;
      const s = overlap(bare(u), bare(c));
      if (s >= 0.4) scored.push([s, i, j]);
    });
  });
  for (const [, i, j] of scored.sort((x, y) => y[0] - x[0]))
    if (!pairs.has(i) && !taken.has(j)) {
      pairs.set(i, j);
      taken.add(j);
    }
  return pairs;
}

export function resumeChanges(master: Resume, copy: Resume): Change[] {
  const out: Change[] = [];
  const add = (c: Omit<Change, 'id'>) =>
    out.push({ ...c, id: `${c.kind}:${c.sectionId}:${c.entryId}:${c.from}:${c.to}` });
  const none = { sectionId: null, entryId: null, from: -1, to: -1 };

  if (master.personal.jobTitle.trim() !== copy.personal.jobTitle.trim())
    add({
      kind: 'headline',
      where: 'Title line',
      before: master.personal.jobTitle,
      after: copy.personal.jobTitle,
      ...none,
    });

  const summaryOf = (r: Resume) => r.sections.find((s) => s.type === 'profile' && !s.hidden);
  const ms = summaryOf(master);
  const cs = summaryOf(copy);
  if (cs && (ms?.text ?? '').trim() !== cs.text.trim())
    add({
      kind: 'summary',
      where: sectionTitle(cs),
      before: ms?.text ?? '',
      after: cs.text,
      ...none,
      sectionId: cs.id,
    });

  for (const sec of copy.sections) {
    const msec = master.sections.find((s) => s.id === sec.id);
    if (!msec || sec.hidden || SECTION_TEXT_ONLY.has(sec.type)) continue;
    const order = (list: { id: string; hidden: boolean }[]) =>
      list.filter((e) => !e.hidden).map((e) => e.id);
    const kept = order(sec.entries).filter((id) => msec.entries.some((e) => e.id === id));
    const was = order(msec.entries).filter((id) => kept.includes(id));
    if (kept.join() !== was.join())
      add({
        kind: 'order',
        where: sectionTitle(sec),
        before: 'Your order',
        after: 'Most relevant first',
        sectionId: sec.id,
        entryId: null,
        from: -1,
        to: -1,
      });
    for (const e of sec.entries) {
      const me = msec.entries.find((x) => x.id === e.id);
      if (!me) continue;
      const where = `${sectionTitle(sec)}: ${e.subtitle || e.title}`;
      const ids = { sectionId: sec.id, entryId: e.id };
      if (e.hidden && !me.hidden) {
        add({
          kind: 'hidden',
          where,
          before: e.title || e.subtitle,
          after: '',
          ...ids,
          from: -1,
          to: -1,
        });
        continue;
      }
      const mu = splitRich(me.description);
      const cu = splitRich(e.description);
      const pairs = pairLines(mu, cu);
      const paired = new Set(pairs.values());
      mu.forEach((u, i) => {
        const j = pairs.get(i);
        if (j === undefined)
          add({ kind: 'line-removed', where, before: bare(u), after: '', ...ids, from: i, to: -1 });
        else if (bare(u) !== bare(cu[j]!))
          add({
            kind: 'line-changed',
            where,
            before: bare(u),
            after: bare(cu[j]!),
            ...ids,
            from: i,
            to: j,
          });
      });
      cu.forEach((u, j) => {
        if (!paired.has(j))
          add({ kind: 'line-added', where, before: '', after: bare(u), ...ids, from: -1, to: j });
      });
    }
  }
  return out;
}

const SECTION_TEXT_ONLY = new Set(['profile', 'declaration']);

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

/** Put the master's version back for one change. */
export function undoChange(copy: Resume, master: Resume, c: Change): Resume {
  const r = clone(copy);
  if (c.kind === 'headline') {
    r.personal.jobTitle = master.personal.jobTitle;
    return r;
  }
  const sec = r.sections.find((s) => s.id === c.sectionId);
  if (!sec) return r;
  if (c.kind === 'summary') {
    const ms = master.sections.find((s) => s.type === 'profile' && !s.hidden);
    if (ms) sec.text = ms.text;
    else r.sections = r.sections.filter((s) => s.id !== sec.id);
    return r;
  }
  const msec = master.sections.find((s) => s.id === c.sectionId);
  if (c.kind === 'order' && msec) {
    const rank = (id: string) => {
      const i = msec.entries.findIndex((e) => e.id === id);
      return i === -1 ? msec.entries.length : i;
    };
    sec.entries = [...sec.entries].sort((a, b) => rank(a.id) - rank(b.id));
    return r;
  }
  const entry = sec.entries.find((e) => e.id === c.entryId);
  const me = msec?.entries.find((e) => e.id === c.entryId);
  if (!entry || !me) return r;
  if (c.kind === 'hidden') {
    entry.hidden = false;
    return r;
  }
  const units = splitRich(entry.description);
  const mu = splitRich(me.description);
  if (c.kind === 'line-changed' && units[c.to] && mu[c.from]) units[c.to] = mu[c.from]!;
  else if (c.kind === 'line-added' && units[c.to]) {
    units.splice(c.to, 1);
    if (r.tailoring)
      r.tailoring.assumed = r.tailoring.assumed.filter(
        (a) => !(a.entryId === entry.id && a.text === c.after),
      );
  } else if (c.kind === 'line-removed' && mu[c.from]) {
    // Back after the copy's version of the master line before it, else at the top.
    const pairs = pairLines(mu, units);
    let at = 0;
    for (let i = c.from - 1; i >= 0; i--)
      if (pairs.has(i)) {
        at = pairs.get(i)! + 1;
        break;
      }
    units.splice(at, 0, mu[c.from]!);
  }
  entry.description = joinUnits(units);
  return r;
}
