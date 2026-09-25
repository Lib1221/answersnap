import { describe, expect, it } from 'vitest';
import { itemsToText, looksScanned, normalizeText, stripRepeatedLines } from '@/kb/normalize';

describe('itemsToText', () => {
  it('breaks lines on hasEOL and on baseline changes', () => {
    const items = [
      { str: 'Jamie', transform: [1, 0, 0, 1, 0, 700] },
      { str: ' Park', transform: [1, 0, 0, 1, 40, 700] },
      { str: 'Backend Engineer', transform: [1, 0, 0, 1, 0, 680], hasEOL: true },
      { str: 'Lisbon', transform: [1, 0, 0, 1, 0, 660] },
    ];
    expect(itemsToText(items)).toBe('Jamie Park\nBackend Engineer\nLisbon');
  });
});

describe('stripRepeatedLines', () => {
  // Digits are masked when comparing lines, so each page needs different words.
  const WORDS = ['alpha', 'bravo', 'charlie'];
  const body = (n: number) =>
    [
      `Section ${WORDS[n - 1]}`,
      `Role at ${WORDS[n - 1]} co`,
      'Built APIs.',
      'Led a team.',
      `Shipped ${WORDS[n - 1]} reports.`,
      `Tech for ${WORDS[n - 1]}`,
    ].join('\n');

  it('removes print headers and footers repeated on every page', () => {
    const pages = [1, 2, 3].map(
      (n) =>
        `9/25/26, 1:40 PM Resume | Jamie Park\n${body(n)}\nhttps://jamiepark.example/resume ${n}/3`,
    );
    expect(stripRepeatedLines(pages)).toEqual([1, 2, 3].map(body));
  });

  it('handles a short last page where the header sits mid-page', () => {
    const pages = [
      `Jamie Park\n${body(1)}\n9/25/26, 1:40 PM Resume | Jamie Park\nhttps://jamiepark.example/resume 1/2`,
      'References available on request.\n9/25/26, 1:40 PM Resume | Jamie Park\nhttps://jamiepark.example/resume 2/2',
    ];
    expect(stripRepeatedLines(pages)).toEqual([
      `Jamie Park\n${body(1)}`,
      'References available on request.',
    ]);
  });

  it('keeps lines repeated away from the page edges, and single pages', () => {
    const pages = [1, 2].map(
      (n) =>
        `Header ${WORDS[n - 1]}\nTop ${WORDS[n - 1]}\nMore ${WORDS[n - 1]}\n${body(n)}\nFooter ${WORDS[n - 1]}`,
    );
    expect(
      stripRepeatedLines(pages).every(
        (p) => p.includes('Built APIs.') && p.includes('Led a team.'),
      ),
    ).toBe(true);
    expect(stripRepeatedLines(['Header\nOnly page'])).toEqual(['Header\nOnly page']);
  });
});

describe('normalizeText', () => {
  it('turns bullets into "- ", collapses spaces, and trims blank runs', () => {
    expect(normalizeText('•  Built   APIs\r\n● Led team\n\n\n\n▪ Shipped')).toBe(
      '- Built APIs\n- Led team\n\n- Shipped',
    );
  });
});

describe('looksScanned', () => {
  it('flags too little text or mostly non-letters', () => {
    expect(looksScanned('')).toBe(true);
    expect(looksScanned('a'.repeat(150))).toBe(true);
    expect(looksScanned('1234 5678 '.repeat(40))).toBe(true);
    expect(looksScanned('Backend engineer with five years of Python. '.repeat(10))).toBe(false);
  });
});
