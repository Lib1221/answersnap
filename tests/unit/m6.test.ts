import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { applyChoice, matchOption } from '@/capture/choice';
import { planCrop } from '@/background/crop';
import { enforceCap, getLibrary, pruneLibrary, upsertEntry, type LibraryEntry } from '@/kb/library';
import {
  normalizeQuestion,
  rankMatches,
  ratio,
  similarity,
  STRONG_MATCH,
  EXAMPLE_MATCH,
} from '@/kb/similarity';
import { buildExport, describeImport, parseImport } from '@/storage/exportImport';
import { saveSources } from '@/storage/items';
import { installLayout, setBody } from './helpers/layout';

beforeEach(() => fakeBrowser.reset());

const entry = (question: string, extra: Partial<LibraryEntry> = {}): LibraryEntry => ({
  id: question,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
  hostname: 'jobs.example.com',
  pageTitle: 'Apply',
  question,
  questionType: 'long_text',
  answer: `Answer to ${question}`,
  model: 'm',
  pinned: false,
  uses: 1,
  ...extra,
});

describe('similarity', () => {
  it('drops punctuation, case, stopwords, and filler', () => {
    expect(normalizeQuestion('Please describe: Why do YOU want to join us?')).toEqual([
      'want',
      'join',
    ]);
  });

  it('scores rephrasings high and different questions low', () => {
    const a = 'Why do you want to work at Acme?';
    expect(similarity(a, 'Why do you want to work at Acme?')).toBe(1);
    expect(similarity(a, 'Why do you want to work with Acme')).toBeGreaterThanOrEqual(STRONG_MATCH);
    expect(
      similarity(
        'Describe a project you are proud of.',
        'Tell us about a project you are proud of',
      ),
    ).toBeGreaterThanOrEqual(STRONG_MATCH);
    expect(similarity(a, 'What is your expected hourly rate?')).toBeLessThan(EXAMPLE_MATCH);
  });

  it('breaks ties by pinned, then uses, then recency', () => {
    const q = 'Why do you want to join us?';
    const ranked = rankMatches(q, [
      entry(q, { id: 'plain' }),
      entry(q, { id: 'used', uses: 5 }),
      entry(q, { id: 'pinned', pinned: true }),
      entry(q, { id: 'recent', updatedAt: '2026-09-20T00:00:00.000Z' }),
    ]);
    expect(ranked.map((m) => m.entry.id)).toEqual(['pinned', 'used', 'recent', 'plain']);
  });

  it('fuzzy ratio for option labels', () => {
    expect(ratio('Fluent', 'fluent')).toBe(1);
    expect(ratio('Conversational', 'Conversation')).toBeGreaterThanOrEqual(0.8);
    expect(ratio('Basic', 'Native')).toBeLessThan(0.8);
  });
});

describe('library', () => {
  it('upserts by site and question, counting uses', async () => {
    const input = {
      hostname: 'h',
      pageTitle: 't',
      question: 'Why us?',
      questionType: 'long_text',
      answer: 'A',
      model: 'm',
    };
    await upsertEntry(input);
    await upsertEntry({ ...input, answer: 'B' });
    const lib = await getLibrary();
    expect(lib).toHaveLength(1);
    expect(lib[0]).toMatchObject({ answer: 'B', uses: 2 });
  });

  it('caps at 1,000 by dropping the oldest unpinned first', () => {
    const many = Array.from({ length: 5 }, (_, i) =>
      entry(`q${i}`, { updatedAt: `2026-09-0${i + 1}T00:00:00.000Z`, pinned: i === 0 }),
    );
    expect(enforceCap(many, 3).map((e) => e.id)).toEqual(['q0', 'q3', 'q4']);
  });

  it('prunes unpinned entries past the retention window', async () => {
    await fakeBrowser.storage.local.set({
      library: [
        entry('old'),
        entry('pinned old', { pinned: true }),
        entry('new', { updatedAt: '2026-09-24T00:00:00.000Z' }),
      ],
    });
    const removed = await pruneLibrary(10, Date.parse('2026-09-25T00:00:00.000Z'));
    expect(removed).toBe(1);
    expect((await getLibrary()).map((e) => e.id)).toEqual(['pinned old', 'new']);
  });
});

describe('choice fields', () => {
  it('matches options exactly, then fuzzily at 0.8', () => {
    const opts = ['Choose one', 'UTC+00:00 London, Lisbon', 'UTC+01:00 Berlin, Paris'];
    expect(matchOption(opts, 'utc+00:00 london lisbon')).toBe(1);
    expect(matchOption(['Basic', 'Conversational', 'Fluent'], 'Conversation')).toBe(1);
    expect(matchOption(['Basic', 'Fluent'], 'Native')).toBe(-1);
  });

  it('selects a native select option and fires change', () => {
    setBody('<select id="s"><option>A</option><option>Fluent</option></select>');
    const sel = document.getElementById('s') as HTMLSelectElement;
    let changed = 0;
    sel.addEventListener('change', () => changed++);
    expect(applyChoice(sel, ['fluent'])).toEqual({ ok: true, method: 'choice' });
    expect(sel.selectedIndex).toBe(1);
    expect(changed).toBe(1);
  });

  it('clicks the matching radio and sets checkboxes to exactly the picks', () => {
    const restore = installLayout();
    setBody(`<div data-rect="0,0,400,200">
      <input type="radio" name="e" id="r1"><label for="r1">Basic</label>
      <input type="radio" name="e" id="r2"><label for="r2">Fluent</label>
      <input type="checkbox" name="f" id="c1" checked><label for="c1">Spring</label>
      <input type="checkbox" name="f" id="c2"><label for="c2">Django</label>
      <input type="checkbox" name="f" id="c3"><label for="c3">Flask</label></div>`);
    expect(applyChoice(document.getElementById('r1'), ['Fluent']).ok).toBe(true);
    expect((document.getElementById('r2') as HTMLInputElement).checked).toBe(true);
    expect(applyChoice(document.getElementById('c1'), ['Django', 'Flask']).ok).toBe(true);
    expect(
      ['c1', 'c2', 'c3'].map((id) => (document.getElementById(id) as HTMLInputElement).checked),
    ).toEqual([false, true, true]);
    expect(applyChoice(document.getElementById('r1'), ['Klingon'])).toEqual({
      ok: false,
      reason: 'NO_MATCH',
    });
    restore();
  });
});

describe('export and import', () => {
  it('round-trips without API keys and rejects foreign files', async () => {
    await fakeBrowser.storage.local.set({ 'apiKey:anthropic': 'sk-ant-secret' });
    await saveSources([
      {
        id: 's',
        kind: 'note',
        label: 'Note',
        text: 'Jamie',
        chars: 5,
        importedAt: '',
        enabled: true,
      },
    ]);
    const data = await buildExport();
    const text = JSON.stringify(data);
    expect(text).not.toContain('sk-ant-secret');
    const parsed = parseImport(text);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(describeImport(parsed.data)[0]).toBe('1 source (1 in use)');
    expect(parseImport('{"hello":1}')).toMatchObject({ ok: false });
    expect(parseImport('not json')).toEqual({ ok: false, error: "That file isn't valid JSON." });
  });
});

describe('crop outline for "Answer this field"', () => {
  it('outlines the given field rect inside an unpadded region', () => {
    const plan = planCrop(
      { w: 1280, h: 800 },
      { x: 100, y: 100, w: 400, h: 300 },
      { w: 1280, h: 800 },
      { pad: false, outline: { x: 140, y: 300, w: 320, h: 40 } },
    );
    expect(plan.outline).toEqual({ x: 40, y: 200, w: 320, h: 40 });
  });
});
