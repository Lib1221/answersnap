import { defineComponent, h, type VNode } from 'vue';
import { parseRich, type Inline } from '@/kb/richText';

// Renders resume rich text as real elements. No HTML strings anywhere (hard rule 4).

function inline(x: Inline, key: number): VNode | string {
  switch (x.kind) {
    case 'text':
      return x.text;
    case 'bold':
      return h('strong', { key }, x.children.map(inline));
    case 'italic':
      return h('em', { key }, x.children.map(inline));
    case 'underline':
      return h('u', { key }, x.children.map(inline));
    case 'link':
      return h(
        'a',
        { key, href: x.href, target: '_blank', rel: 'noopener noreferrer' },
        x.children.map(inline),
      );
  }
}

export default defineComponent({
  name: 'RichText',
  props: { text: { type: String, required: true } },
  setup(props) {
    return () =>
      h(
        'div',
        { class: 'rich' },
        parseRich(props.text).map((b, i) => {
          if (b.kind === 'paragraph') return h('p', { key: i }, b.inlines.map(inline));
          const items = b.items.map((item, j) => h('li', { key: j }, item.map(inline)));
          if (b.kind === 'bullets') return h('ul', { key: i }, items);
          // "3. Won" shows 3, not 1.
          return h('ol', { key: i, start: b.start ?? 1 }, items);
        }),
      );
  },
});
