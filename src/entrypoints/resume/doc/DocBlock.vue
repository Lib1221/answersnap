<script setup lang="ts">
import { computed, h, type FunctionalComponent } from 'vue';
import { formatDates, formatPlace } from '@/kb/resume/format';
import { DOC_STRINGS } from '@/kb/resume/docLang';
import { PHOTO_DATA_URL, sectionTitle, type Entry, type Resume } from '@/kb/resume/model';
import { safeUrl } from '@/kb/richText';
import RichText from '@/ui/RichText';
import { hasGroups, levelStyle, listLayout, type Block } from './blocks';
import { contactItems } from './contacts';
import DocIcon from './DocIcon';

const props = defineProps<{ block: Block; resume: Resume }>();
const d = computed(() => props.resume.design);
const p = computed(() => props.resume.personal);

/** Contact line items: email, phone, location, then the extra details in order. */
const contacts = computed(() => contactItems(p.value, d.value.contactStyle));

const title = computed(() =>
  'section' in props.block ? sectionTitle(props.block.section, d.value.docLang) : '',
);

function dates(e: Entry) {
  return formatDates(e, d.value);
}
function meta(e: Entry) {
  const place = formatPlace(e);
  const date = dates(e);
  return d.value.locationWithDate ? [date, place].filter(Boolean) : [date].filter(Boolean);
}
/** FlowCV's level words: skills and languages have their own scales, in the resume language. */
function levelText(n: number) {
  const strings = DOC_STRINGS[d.value.docLang];
  const scale =
    'section' in props.block && props.block.section.type === 'languages'
      ? strings.languageLevels
      : strings.skillLevels;
  return scale[n - 1] ?? '';
}
const entryLink = (e: Entry) => safeUrl(e.link);

/**
 * Which line carries the entry's link. FlowCV links the employer or school on jobs and degrees
 * ("Ledgerly ↗"), and the name itself on projects, certificates, and the rest.
 */
const LINK_ON_SUBTITLE = new Set(['experience', 'education', 'organisations', 'volunteering']);
function linkPart(e: Entry): 'main' | 'second' | null {
  if (!entryLink(e)) return null;
  const type = 'section' in props.block ? props.block.section.type : '';
  if (!LINK_ON_SUBTITLE.has(type) || !e.subtitle) return 'main';
  return d.value.entryOrder === 'subtitle-first' ? 'main' : 'second';
}

/**
 * A line of an entry, as a link (with the design's icon) when it carries the entry's link. The
 * icon stays on the line of the last word.
 */
const Linked: FunctionalComponent<{ text: string; href: string | null; cls?: unknown }> = (p) => {
  if (!p.href) return h('span', { class: p.cls }, p.text);
  const at = p.text.lastIndexOf(' ') + 1;
  return h(
    'a',
    {
      href: p.href,
      target: '_blank',
      rel: 'noopener noreferrer',
      class: [p.cls, 'rd-entry-link', { 'rd-accent': d.value.accentOn.links }],
    },
    d.value.linkStyle === 'icon'
      ? [
          p.text.slice(0, at),
          h('span', { class: 'rd-nowrap' }, [
            p.text.slice(at),
            h(DocIcon, {
              name: d.value.linkIcon === 'arrow' ? 'external' : 'link',
              class: 'rd-link-icon',
            }),
          ]),
        ]
      : p.text,
  );
};
Linked.props = ['text', 'href', 'cls'];

/** The bold line and the line under it: title first, or employer and school first. */
function lines(e: Entry): { main: string; second: string } {
  return d.value.entryOrder === 'subtitle-first' && e.subtitle
    ? { main: e.subtitle, second: e.title }
    : { main: e.title, second: e.subtitle };
}

/** The bold line, with the subtitle after a comma when the design puts it on the same line. */
const EntryTitle: FunctionalComponent<{ entry: Entry }> = ({ entry }) => {
  const { main, second } = lines(entry);
  const part = linkPart(entry);
  const href = entryLink(entry);
  return h('p', { class: 'rd-entry-title' }, [
    h(Linked, { text: main, href: part === 'main' ? href : null, cls: 'rd-strong' }),
    ...(d.value.subtitlePlacement === 'same-line' && second
      ? [
          h('span', { class: 'rd-strong' }, ', '),
          h(Linked, {
            text: second,
            href: part === 'second' ? href : null,
            cls: [
              'rd-subtitle',
              `rd-sub-${d.value.subtitleStyle}`,
              { 'rd-accent': d.value.accentOn.subtitle },
            ],
          }),
        ]
      : []),
  ]);
};
EntryTitle.props = ['entry'];

/**
 * FlowCV's layout: dates and place in a column of their own beside an entry that has them, so
 * the title and text wrap before it. The next bullets of the entry keep the column free.
 */
function sideColumn(e: Entry | null): boolean {
  return !!e && d.value.datePlacement === 'right-column' && meta(e).length > 0;
}

/** Only a data URL ever reaches <img>: the page never loads a remote image. */
const photo = computed(() => (PHOTO_DATA_URL.test(p.value.photo) ? p.value.photo : ''));

/** A declaration's signature line goes under its last piece of text. */
const signature = computed(() => {
  const b = props.block;
  if (!('section' in b) || b.section.type !== 'declaration') return null;
  if (!((b.kind === 'text' || b.kind === 'more') && b.last)) return null;
  const sig = b.section.signature;
  return sig.name || sig.place || sig.date ? sig : null;
});

/** Inline lists show a level as words in brackets when there's no info text. */
function inlineNote(e: Entry): string {
  if (e.info) return e.info;
  return e.level && levels.value !== 'none' ? levelText(e.level) : '';
}

/** The photo's crop: a zoom around the focus point the user dragged to. */
const photoStyle = computed(() => {
  const at = `${p.value.photoX}% ${p.value.photoY}%`;
  return {
    objectPosition: at,
    transformOrigin: at,
    transform: p.value.photoZoom > 1 ? `scale(${p.value.photoZoom})` : undefined,
    filter: d.value.photoGrayscale ? 'grayscale(1)' : undefined,
  };
});

const layout = computed(() =>
  'section' in props.block ? listLayout(props.block.section, d.value) : d.value.skillsLayout,
);
const levels = computed(() =>
  'section' in props.block ? levelStyle(props.block.section, d.value) : d.value.levelStyle,
);
/** Skill groups in columns (grid) or one under another (list); other layouts show titles. */
const groups = computed(
  () =>
    props.block.kind === 'list' &&
    (layout.value === 'grid' || layout.value === 'list') &&
    hasGroups(props.block.section),
);
const groupStyle = computed(() =>
  props.block.kind === 'list' && layout.value === 'grid'
    ? { '--rd-cols': String(props.block.section.gridColumns) }
    : { '--rd-cols': '1' },
);

const gridStyle = computed(() =>
  'section' in props.block && layout.value === 'grid'
    ? { '--rd-cols': String(props.block.section.gridColumns) }
    : undefined,
);
</script>

<template>
  <!-- Header -->
  <header
    v-if="block.kind === 'header'"
    class="rd-header"
    :class="[
      `rd-align-${d.headerAlign}`,
      { 'rd-header-fill': d.fill === 'header' && block.column === 'full' },
    ]"
  >
    <span v-if="photo && d.photo !== 'none'" class="rd-photo" :class="`rd-photo-${d.photo}`">
      <img :src="photo" alt="" :style="photoStyle" />
    </span>
    <div class="rd-header-text">
      <h1 class="rd-name" :class="{ 'rd-accent': d.accentOn.name && d.fill !== 'header' }">
        {{ p.fullName || 'Your name' }}
      </h1>
      <p
        v-if="p.jobTitle"
        class="rd-jobtitle"
        :class="{ 'rd-accent': d.accentOn.jobTitle && d.fill !== 'header' }"
      >
        {{ p.jobTitle }}
      </p>
      <ul v-if="contacts.length" class="rd-contacts" :class="`rd-contacts-${d.contactStyle}`">
        <li v-for="(c, i) in contacts" :key="i">
          <DocIcon
            v-if="d.contactStyle === 'icons'"
            :name="c.icon"
            :solid="d.contactIcons === 'solid'"
            :class="{ 'rd-accent': d.accentOn.icons && d.fill !== 'header' }"
          />
          <a v-if="c.href" :href="c.href" target="_blank" rel="noopener noreferrer">{{ c.text }}</a>
          <span v-else>{{ c.text }}</span>
        </li>
      </ul>
    </div>
  </header>

  <section
    v-else
    class="rd-block"
    :class="{
      'rd-section-start': block.withHeading,
      'rd-more-li': block.kind === 'more' && block.join === 'li',
      'rd-more-p': block.kind === 'more' && block.join === 'p',
      'rd-more-row': block.kind === 'list' && !block.withHeading,
    }"
  >
    <h2
      v-if="block.withHeading && block.section.showHeading"
      class="rd-heading"
      :class="`rd-heading-${d.headingStyle}`"
    >
      <span
        ><DocIcon v-if="d.headingIcons" :name="`section-${block.section.type}`" />{{ title }}</span
      >
    </h2>

    <!-- Profile, declaration -->
    <RichText v-if="block.kind === 'text'" :text="block.text" class="rd-desc" />

    <!-- The next bullet or paragraph of an entry or a text section -->
    <div
      v-else-if="block.kind === 'more'"
      :class="{ 'rd-entry': block.entry, 'rd-side-column': sideColumn(block.entry) }"
    >
      <div v-if="block.entry && d.datePlacement === 'left'" class="rd-entry-left" />
      <div :class="{ 'rd-entry-main': block.entry }">
        <RichText
          :text="block.text"
          class="rd-desc"
          :class="{ 'rd-indent': block.entry && d.indentDescription }"
        />
      </div>
    </div>

    <!-- Skill groups: a bold group name and its list, flowing down the columns -->
    <div
      v-else-if="block.kind === 'list' && groups"
      class="rd-list rd-list-groups"
      :style="groupStyle"
    >
      <div v-for="e in block.entries" :key="e.id" class="rd-group">
        <div class="rd-list-item">
          <span class="rd-strong">{{ e.title }}</span>
          <span v-if="e.info" class="rd-muted">{{ e.info }}</span>
          <span v-if="e.level && levels === 'dots'" class="rd-dots" :aria-label="`${e.level} of 5`">
            <i v-for="n in 5" :key="n" :class="{ on: n <= e.level }" />
          </span>
          <span
            v-else-if="e.level && levels === 'bar'"
            class="rd-bar"
            :aria-label="`${e.level} of 5`"
            ><i :style="{ width: `${e.level * 20}%` }"
          /></span>
          <span v-else-if="e.level && levels === 'text'" class="rd-muted">{{
            levelText(e.level)
          }}</span>
        </div>
        <RichText v-if="e.description.trim()" :text="e.description" class="rd-desc" />
      </div>
    </div>

    <!-- Skills, languages, interests as one compact block -->
    <div
      v-else-if="block.kind === 'list'"
      class="rd-list"
      :class="`rd-list-${layout}`"
      :style="gridStyle"
    >
      <template v-if="layout === 'inline'">
        <p>
          <template v-for="(e, i) in block.entries" :key="e.id">
            <span class="rd-strong">{{ e.title }}</span
            ><span v-if="inlineNote(e)" class="rd-muted"> ({{ inlineNote(e) }})</span
            ><span v-if="i < block.entries.length - 1">, </span>
          </template>
        </p>
      </template>
      <template v-else>
        <div v-for="e in block.entries" :key="e.id" class="rd-list-item">
          <span class="rd-strong">{{ e.title }}</span>
          <span v-if="e.info && layout !== 'bubbles'" class="rd-muted">{{ e.info }}</span>
          <span v-if="e.level && levels === 'dots'" class="rd-dots" :aria-label="`${e.level} of 5`">
            <i v-for="n in 5" :key="n" :class="{ on: n <= e.level }" />
          </span>
          <span
            v-else-if="e.level && levels === 'bar'"
            class="rd-bar"
            :aria-label="`${e.level} of 5`"
            ><i :style="{ width: `${e.level * 20}%` }"
          /></span>
          <span v-else-if="e.level && levels === 'text'" class="rd-muted">{{
            levelText(e.level)
          }}</span>
        </div>
      </template>
    </div>

    <!-- One entry with its dates and place in a column on the right. They follow the title in
         the page's text, so an ATS reads them together. -->
    <article
      v-else-if="block.kind === 'entry' && sideColumn(block.entry)"
      class="rd-entry rd-side-column"
    >
      <EntryTitle :entry="block.entry" />
      <p
        v-for="(m, i) in meta(block.entry)"
        :key="i"
        class="rd-meta rd-side-meta"
        :class="[
          `rd-side-${i + 1}`,
          { 'rd-accent': d.accentOn.dates && i === 0 && dates(block.entry) },
        ]"
      >
        {{ m }}
      </p>
      <p
        v-if="d.subtitlePlacement === 'next-line' && lines(block.entry).second"
        class="rd-subtitle"
        :class="[`rd-sub-${d.subtitleStyle}`, { 'rd-accent': d.accentOn.subtitle }]"
      >
        <Linked
          :text="lines(block.entry).second"
          :href="linkPart(block.entry) === 'second' ? entryLink(block.entry) : null"
        />
      </p>
      <p v-if="block.entry.info" class="rd-muted">{{ block.entry.info }}</p>
      <p v-if="block.entry.email || block.entry.phone" class="rd-muted">
        {{ [block.entry.email, block.entry.phone].filter(Boolean).join(' | ') }}
      </p>
      <RichText
        v-if="block.desc"
        :text="block.desc"
        class="rd-desc"
        :class="{ 'rd-indent': d.indentDescription }"
      />
    </article>

    <!-- One entry -->
    <article
      v-else-if="block.kind === 'entry'"
      class="rd-entry"
      :class="`rd-dates-${d.datePlacement}`"
    >
      <div
        v-if="d.datePlacement === 'left'"
        class="rd-entry-left rd-meta"
        :class="{ 'rd-accent': d.accentOn.dates }"
      >
        <div v-for="m in meta(block.entry)" :key="m">{{ m }}</div>
      </div>
      <div class="rd-entry-main">
        <div class="rd-entry-row">
          <EntryTitle :entry="block.entry" />
          <p
            v-if="d.datePlacement === 'right' && dates(block.entry)"
            class="rd-meta"
            :class="{ 'rd-accent': d.accentOn.dates }"
          >
            {{ dates(block.entry) }}
          </p>
        </div>
        <div
          v-if="
            (d.subtitlePlacement === 'next-line' && lines(block.entry).second) ||
            (d.datePlacement === 'right' && d.locationWithDate && formatPlace(block.entry))
          "
          class="rd-entry-row"
        >
          <p
            class="rd-subtitle"
            :class="[`rd-sub-${d.subtitleStyle}`, { 'rd-accent': d.accentOn.subtitle }]"
          >
            <Linked
              v-if="d.subtitlePlacement === 'next-line' && lines(block.entry).second"
              :text="lines(block.entry).second"
              :href="linkPart(block.entry) === 'second' ? entryLink(block.entry) : null"
            />
          </p>
          <p v-if="d.datePlacement === 'right' && d.locationWithDate" class="rd-meta">
            {{ formatPlace(block.entry) }}
          </p>
        </div>
        <p
          v-if="d.datePlacement === 'below' && meta(block.entry).length"
          class="rd-meta"
          :class="{ 'rd-accent': d.accentOn.dates }"
        >
          {{ meta(block.entry).join(' | ') }}
        </p>
        <p v-if="block.entry.info" class="rd-muted">{{ block.entry.info }}</p>
        <p v-if="block.entry.email || block.entry.phone" class="rd-muted">
          {{ [block.entry.email, block.entry.phone].filter(Boolean).join(' | ') }}
        </p>
        <RichText
          v-if="block.desc"
          :text="block.desc"
          class="rd-desc"
          :class="{ 'rd-indent': d.indentDescription }"
        />
      </div>
    </article>

    <div v-if="signature" class="rd-signature">
      <span>{{ [signature.place, signature.date].filter(Boolean).join(', ') }}</span>
      <span class="rd-signature-name">{{ signature.name }}</span>
    </div>
  </section>
</template>
