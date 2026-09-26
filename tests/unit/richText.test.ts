import { describe, expect, it } from 'vitest';
import { createApp } from 'vue';
import {
  insertLink,
  parseInline,
  parseRich,
  plainText,
  safeUrl,
  toggleList,
  toggleMark,
} from '@/kb/richText';
import RichText from '@/ui/RichText';

describe('resume rich text', () => {
  it('parses marks, links, and lists', () => {
    expect(parseInline('Cut **p95 latency** by *70%* at __Ledgerly__')).toEqual([
      { kind: 'text', text: 'Cut ' },
      { kind: 'bold', children: [{ kind: 'text', text: 'p95 latency' }] },
      { kind: 'text', text: ' by ' },
      { kind: 'italic', children: [{ kind: 'text', text: '70%' }] },
      { kind: 'text', text: ' at ' },
      { kind: 'underline', children: [{ kind: 'text', text: 'Ledgerly' }] },
    ]);
    expect(parseInline('see [my site](jamie.dev)')[1]).toEqual({
      kind: 'link',
      href: 'https://jamie.dev',
      children: [{ kind: 'text', text: 'my site' }],
    });
    const blocks = parseRich('Intro line\n- one\n- **two**\n\n1. first\n2. second\nOutro');
    expect(blocks.map((b) => b.kind)).toEqual(['paragraph', 'bullets', 'numbered', 'paragraph']);
    expect(plainText('- a\n- b')).toBe('- a\n- b');
  });

  it('never makes unsafe links or broken marks', () => {
    expect(safeUrl('javascript:alert(1)')).toBeNull();
    expect(safeUrl('data:text/html,x')).toBeNull();
    expect(safeUrl('jamie@example.com')).toBe('mailto:jamie@example.com');
    expect(parseInline('[x](javascript:alert(1))')).toEqual([
      { kind: 'text', text: '[x](javascript:alert(1))' },
    ]);
    expect(parseInline('2 * 3 * 4')).toEqual([{ kind: 'text', text: '2 * 3 * 4' }]);
    expect(parseInline('**open')).toEqual([{ kind: 'text', text: '**open' }]);
  });

  it('toolbar edits wrap, unwrap, list, and link', () => {
    const e = { value: 'hello world', start: 6, end: 11 };
    const bold = toggleMark(e, '**');
    expect(bold.value).toBe('hello **world**');
    expect(toggleMark(bold, '**').value).toBe('hello world');
    const listed = toggleList({ value: 'a\nb\nc', start: 0, end: 3 }, 'bullets');
    expect(listed.value).toBe('- a\n- b\nc');
    expect(toggleList({ ...listed, start: 0, end: 7 }, 'bullets').value).toBe('a\nb\nc');
    expect(toggleList({ value: 'a\nb', start: 0, end: 3 }, 'numbered').value).toBe('1. a\n2. b');
    expect(insertLink({ value: 'my site', start: 0, end: 7 }, 'https://x.dev').value).toBe(
      '[my site](https://x.dev)',
    );
  });

  it('bold and italic on one selection, in either order, with no stray stars', () => {
    const boldItalic = [
      { kind: 'italic', children: [{ kind: 'bold', children: [{ kind: 'text', text: 'word' }] }] },
    ];
    const plain = { value: 'hello word', start: 6, end: 10 };
    const italic = toggleMark(plain, '*');
    expect(italic).toEqual({ value: 'hello *word*', start: 7, end: 11 });
    const both = toggleMark(italic, '**');
    expect(both).toEqual({ value: 'hello ***word***', start: 9, end: 13 });
    expect(parseInline(both.value)).toEqual([{ kind: 'text', text: 'hello ' }, ...boldItalic]);

    // Other order: bold first, then italic, gives the same text.
    const bold = toggleMark(plain, '**');
    expect(toggleMark(bold, '*')).toEqual(both);

    // Unwrapping one mark keeps the other.
    expect(toggleMark(both, '**')).toEqual(italic);
    expect(toggleMark(both, '*')).toEqual(bold);

    // Typed by hand.
    expect(parseInline('***word***')).toEqual(boldItalic);
    expect(plainText('I ***really*** mean it')).toBe('I really mean it');
  });

  it('parses marks nested at the edge of other marks', () => {
    // "big" italic inside a bold "big word", and the reverse.
    expect(parseInline('**big *word***')).toEqual([
      {
        kind: 'bold',
        children: [
          { kind: 'text', text: 'big ' },
          { kind: 'italic', children: [{ kind: 'text', text: 'word' }] },
        ],
      },
    ]);
    expect(parseInline('***big* word**')).toEqual([
      {
        kind: 'bold',
        children: [
          { kind: 'italic', children: [{ kind: 'text', text: 'big' }] },
          { kind: 'text', text: ' word' },
        ],
      },
    ]);
    expect(parseInline('*a **b** c*')).toEqual([
      {
        kind: 'italic',
        children: [
          { kind: 'text', text: 'a ' },
          { kind: 'bold', children: [{ kind: 'text', text: 'b' }] },
          { kind: 'text', text: ' c' },
        ],
      },
    ]);
    expect(parseInline('**__Ledgerly__**')).toEqual([
      {
        kind: 'bold',
        children: [{ kind: 'underline', children: [{ kind: 'text', text: 'Ledgerly' }] }],
      },
    ]);
    // Toggling underline still wraps and unwraps.
    const u = toggleMark({ value: 'at Ledgerly', start: 3, end: 11 }, '__');
    expect(u.value).toBe('at __Ledgerly__');
    expect(toggleMark(u, '__').value).toBe('at Ledgerly');
    // Plain stars and underscores stay text.
    expect(parseInline('snake_case_name and a * b')).toEqual([
      { kind: 'text', text: 'snake_case_name and a * b' },
    ]);
    expect(parseInline('*a *')).toEqual([{ kind: 'text', text: '*a *' }]);
  });

  it('a bracket before a link is text, not part of the link', () => {
    expect(parseInline('Lead author [2023] of [the paper](https://doi.org/x)')).toEqual([
      { kind: 'text', text: 'Lead author [2023] of ' },
      { kind: 'link', href: 'https://doi.org/x', children: [{ kind: 'text', text: 'the paper' }] },
    ]);
    expect(parseInline('[a [b](https://x.dev)')).toEqual([
      { kind: 'text', text: '[a ' },
      { kind: 'link', href: 'https://x.dev', children: [{ kind: 'text', text: 'b' }] },
    ]);
  });

  it('numbered lists start at the typed number', () => {
    const blocks = parseRich('3. Platz beim Hackathon\n7. Finale');
    expect(blocks).toEqual([
      {
        kind: 'numbered',
        start: 3,
        items: [
          [{ kind: 'text', text: 'Platz beim Hackathon' }],
          [{ kind: 'text', text: 'Finale' }],
        ],
      },
    ]);
    expect(plainText('3. Platz beim Hackathon\n7. Finale')).toBe(
      '3. Platz beim Hackathon\n4. Finale',
    );
    expect(plainText('2019. Promoted to lead')).toBe('2019. Promoted to lead');
    expect(plainText('1. a\n2. b')).toBe('1. a\n2. b');
    // Toggling numbers off still strips the number.
    expect(toggleList({ value: '3. a\n4. b', start: 0, end: 9 }, 'numbered').value).toBe('a\nb');

    const el = document.createElement('div');
    const app = createApp(RichText, { text: '3. Platz beim Hackathon\n4. Finale\n\n- x\n\n1. y' });
    app.mount(el);
    const lists = [...el.querySelectorAll('ol')];
    expect(lists.map((ol) => ol.start)).toEqual([3, 1]);
    expect(lists[0]!.querySelectorAll('li')).toHaveLength(2);
    expect(el.querySelector('ul')?.hasAttribute('start')).toBe(false);
    app.unmount();
  });

  it('links keep parentheses in their URL', () => {
    const wiki = 'https://en.wikipedia.org/wiki/Foo_(bar)';
    const linked = insertLink({ value: 'wiki', start: 0, end: 4 }, wiki);
    expect(linked.value).toBe('[wiki](https://en.wikipedia.org/wiki/Foo_%28bar%29)');
    expect(parseInline(linked.value)).toEqual([
      {
        kind: 'link',
        href: 'https://en.wikipedia.org/wiki/Foo_%28bar%29',
        children: [{ kind: 'text', text: 'wiki' }],
      },
    ]);
    // Typed by hand with balanced parentheses, then more text in parentheses.
    expect(parseInline(`see [wiki](${wiki}) (2020)`)).toEqual([
      { kind: 'text', text: 'see ' },
      { kind: 'link', href: wiki, children: [{ kind: 'text', text: 'wiki' }] },
      { kind: 'text', text: ' (2020)' },
    ]);
    // No selection: the readable URL is the text.
    const bare = insertLink({ value: '', start: 0, end: 0 }, wiki).value;
    expect(bare).toBe(`[${wiki}](https://en.wikipedia.org/wiki/Foo_%28bar%29)`);
    expect(parseInline(bare)).toEqual([
      {
        kind: 'link',
        href: 'https://en.wikipedia.org/wiki/Foo_%28bar%29',
        children: [{ kind: 'text', text: wiki }],
      },
    ]);
  });
});
