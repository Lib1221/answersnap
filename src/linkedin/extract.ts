// Reading a LinkedIn job posting from the page, for the Tailor button. Signed-in LinkedIn shows one
// of two layouts, chosen per account: the new server-driven one ("SDUI": hashed class names, stable
// componentkey and data-testid attributes) or the classic one (job-details-* classes, #job-details).
// Logged-out visitors get the public job page. So: detect the layout, read it with the hooks that
// last, and fall back to the "About the job" heading, then the largest text block of the job pane
// (never the whole page: it holds the navigation and the job list). JSON-LD is used only when it's
// there and describes this job: LinkedIn serves it to crawlers, not people.
// Plain DOM reads only: no network, no storage, nothing written into the page.

export interface LinkedInJob {
  url: string;
  hostname: string;
  jobId: string;
  title: string;
  company: string;
  location: string;
  workplace: string;
  text: string;
}

export type Layout = 'sdui' | 'classic' | 'guest' | 'unknown';

/** Minimum text for a description: shorter is a teaser or a login wall. */
export const MIN_DESCRIPTION = 200;
/** Longest text sent: long enough for any real posting. */
export const MAX_TEXT = 20_000;

const VIEW = /^\/(?:comm\/)?jobs\/view\/(?:[^/?#]*-)?(\d{6,})(?:[/?#]|$)/;

/** The job being shown: /jobs/view/<id>/, or ?currentJobId=<id> on search and collections. */
export function jobIdFromUrl(href: string): string | null {
  try {
    const u = new URL(href);
    // LinkedIn, or the e2e fixture server standing in for it.
    const test = u.hostname === '127.0.0.1' && u.pathname.startsWith('/linkedin/');
    if (!/(^|\.)linkedin\.com$/.test(u.hostname) && !test) return null;
    const view = u.pathname.match(VIEW);
    if (view) return view[1]!;
    const current = u.searchParams.get('currentJobId');
    return current && /^\d{6,}$/.test(current) ? current : null;
  } catch {
    return null;
  }
}

const clean = (s: string | null | undefined) =>
  (s ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

/**
 * Text with line breaks where the blocks are, built from a copy (a detached copy or a parsed page
 * has no layout, so innerText would run paragraphs together). `drop` removes parts first.
 */
function blockText(el: Element, drop?: string): string {
  const copy = el.cloneNode(true) as Element;
  if (drop) for (const x of copy.querySelectorAll(drop)) x.remove();
  const doc = copy.ownerDocument;
  for (const br of copy.querySelectorAll('br')) br.replaceWith('\n');
  for (const li of copy.querySelectorAll('li')) li.prepend(doc.createTextNode('- '));
  for (const b of copy.querySelectorAll('p, li, div, h1, h2, h3, h4, ul, ol'))
    b.append(doc.createTextNode('\n'));
  return clean(copy.textContent);
}

/** innerText where layout exists (a real page), else the text with its block breaks rebuilt. */
function textOf(el: Element | null | undefined): string {
  if (!el) return '';
  const inner = (el as HTMLElement).innerText;
  return typeof inner === 'string' && inner.trim() ? clean(inner) : blockText(el);
}

/** Text of an element without some of its parts ("… more" buttons, its own heading). */
function textWithout(el: Element | null, drop: string): string {
  if (!el) return '';
  return el.querySelector(drop) ? blockText(el, drop) : textOf(el);
}

function first(root: ParentNode, selectors: string[]): Element | null {
  for (const s of selectors) for (const el of root.querySelectorAll(s)) if (textOf(el)) return el;
  return null;
}

export function detectLayout(doc: Document): Layout {
  const page = doc.querySelector('meta[name="pageKey"]')?.getAttribute('content') ?? '';
  if (page.startsWith('d_jobs_guest')) return 'guest';
  if (doc.querySelector('[data-sdui-component], [componentkey^="JobDetails_"]')) return 'sdui';
  if (doc.querySelector('#job-details, .job-details-jobs-unified-top-card__job-title'))
    return 'classic';
  if (doc.querySelector('.top-card-layout__title, .show-more-less-html__markup')) return 'guest';
  return 'unknown';
}

/** The job pane only: never the navigation or the job list. */
function paneRoot(doc: Document, layout: Layout): ParentNode {
  if (layout === 'sdui') {
    const screen = doc.querySelector(
      '[data-sdui-screen$=".SemanticJobDetails"], [data-sdui-screen$=".JobDetails"]',
    );
    if (screen) return screen;
    const parts = [...doc.querySelectorAll('[componentkey^="JobDetails_"]')];
    let root: Element | null = parts[0] ?? null;
    while (root && !parts.every((p) => root!.contains(p))) root = root.parentElement;
    if (root) return root;
  }
  if (layout === 'classic')
    return (
      doc.querySelector('.jobs-search__job-details') ??
      doc.querySelector('.scaffold-layout__detail') ??
      doc.querySelector('.job-view-layout') ??
      doc.querySelector('.jobs-details') ??
      doc
    );
  if (layout === 'guest') return doc.querySelector('.details-pane__content') ?? doc;
  return doc.querySelector('main') ?? doc;
}

/**
 * The job the pane is showing, when the page says: LinkedIn changes the URL before the pane, so a
 * read waits until the two agree.
 */
export function paneJobId(doc: Document): string | null {
  const layout = detectLayout(doc);
  if (layout === 'sdui') {
    const about = doc.querySelector('[componentkey^="JobDetails_AboutTheJob_"]');
    return about?.getAttribute('componentkey')?.match(/(\d{6,})$/)?.[1] ?? null;
  }
  if (layout === 'classic') {
    const link = doc.querySelector(
      '.job-details-jobs-unified-top-card__job-title a[href*="/jobs/view/"]',
    );
    const fromLink = link?.getAttribute('href')?.match(/\/jobs\/view\/(\d{6,})/)?.[1];
    if (fromLink) return fromLink;
    return (
      doc.querySelector('.jobs-apply-button[data-job-id]')?.getAttribute('data-job-id') ?? null
    );
  }
  return null;
}

/**
 * "(3) Senior Engineer | Northwind | LinkedIn" -> title and company. The company is the part before
 * "LinkedIn", since a title can have bars of its own ("ML Engineer | NLP | Remote").
 */
function fromDocTitle(doc: Document): { title: string; company: string } {
  const parts = doc.title.replace(/^\(\d+\)\s*/, '').split(' | ');
  if (parts.length < 3 || !/linkedin/i.test(parts.at(-1)!)) return { title: '', company: '' };
  return { title: parts.slice(0, -2).join(' | ').trim(), company: parts.at(-2)!.trim() };
}

function workplaceWord(text: string): string {
  const w = text.trim().toLowerCase();
  if (w === 'remote') return 'Remote';
  if (w === 'hybrid') return 'Hybrid';
  return w === 'on-site' || w === 'onsite' ? 'On-site' : '';
}

/** "About the job" in the languages LinkedIn's interface most often uses. */
const ABOUT =
  /^\s*(about the job|acerca del empleo|à propos de l[’']offre d[’']emploi|info zum job|über den job|informazioni sull[’']offerta di lavoro|sobre a vaga|over de vacature)\s*$/i;

/**
 * The description container found from its heading (the heading itself left out). The climb
 * stops before a container that also holds another section or the company blurb, so a short post
 * is refused rather than widened to the whole pane.
 */
function fromHeading(root: ParentNode): string {
  for (const h of root.querySelectorAll('h2, h3')) {
    if (!ABOUT.test(h.textContent ?? '')) continue;
    let el: Element | null = h.parentElement;
    for (let i = 0; el && i < 4; i++, el = el.parentElement) {
      if (el.querySelector(NOT_THE_POST) || el.querySelectorAll('h2, h3').length > 1) break;
      const text = textWithout(el, 'h2, h3');
      if (text.length >= MIN_DESCRIPTION) return text;
    }
  }
  return '';
}

/** Parts of the pane that aren't the posting: job cards, menus, dialogs, the company blurb. */
const NOT_THE_POST = [
  'nav',
  'header',
  'aside',
  'dialog',
  '[role="dialog"]',
  '#interop-outlet',
  '[componentkey^="job-card-component-ref-"]',
  'li[data-occludable-job-id]',
  '[componentkey^="JobDetails_AboutTheCompany_"]',
  '.jobs-company',
].join(', ');

/** The biggest block of text in the pane that isn't a card, a menu, or the company blurb. */
function largestBlock(root: ParentNode): string {
  let best = '';
  for (const el of root.querySelectorAll('div, section, article')) {
    if (el.closest(NOT_THE_POST) || el.querySelector(NOT_THE_POST)) continue;
    const text = textOf(el);
    if (text.length > best.length) best = text;
  }
  return best.length >= MIN_DESCRIPTION ? best : '';
}

/** JSON-LD JobPosting, only when present and about this job. */
function fromJsonLd(doc: Document, jobId: string): Partial<LinkedInJob> | null {
  for (const script of doc.querySelectorAll('script[type="application/ld+json"]')) {
    let data: unknown;
    try {
      data = JSON.parse(script.textContent ?? '');
    } catch {
      continue;
    }
    for (const item of Array.isArray(data) ? data : [data]) {
      const post = item as Record<string, unknown>;
      if (post?.['@type'] !== 'JobPosting') continue;
      // A posting that names another job (a stale pane, a recommendation) isn't this one.
      const names = `${JSON.stringify(post.identifier ?? '')} ${String(post.url ?? '')}`;
      if (jobId && /\d{6,}/.test(names) && !names.includes(jobId)) continue;
      const org = post.hiringOrganization as Record<string, unknown> | undefined;
      const place = post.jobLocation as
        { address?: Record<string, unknown> } | { address?: Record<string, unknown> }[] | undefined;
      const address = (Array.isArray(place) ? place[0] : place)?.address;
      const location = [address?.addressLocality, address?.addressRegion, address?.addressCountry]
        .filter((x) => typeof x === 'string' && x)
        .join(', ');
      return {
        title: typeof post.title === 'string' ? post.title : '',
        company: typeof org?.name === 'string' ? org.name : '',
        location,
        workplace: post.jobLocationType === 'TELECOMMUTE' ? 'Remote' : '',
        text: htmlToText(typeof post.description === 'string' ? post.description : ''),
      };
    }
  }
  return null;
}

/**
 * Text of the posting's HTML (from JSON-LD). DOMParser documents are inert: nothing runs or loads,
 * and nothing from it is ever put into the page.
 */
function htmlToText(html: string): string {
  if (!html) return '';
  // LinkedIn's JSON-LD description is HTML escaped once more ("&lt;p&gt;"): decode that first.
  const source = /&lt;\/?[a-z]/i.test(html)
    ? (new DOMParser().parseFromString(html, 'text/html').body.textContent ?? '')
    : html;
  const parsed = new DOMParser().parseFromString(source, 'text/html');
  for (const br of parsed.querySelectorAll('br')) br.replaceWith('\n');
  for (const li of parsed.querySelectorAll('li')) li.prepend('- ');
  for (const b of parsed.querySelectorAll('p, li, h1, h2, h3, h4, div, ul, ol')) b.append('\n');
  return clean(parsed.body.textContent);
}

interface Fields {
  title: string;
  company: string;
  location: string;
  workplace: string;
  text: string;
}

function readSdui(doc: Document, root: ParentNode, jobId: string): Fields {
  const about =
    (jobId && root.querySelector(`[componentkey="JobDetails_AboutTheJob_${jobId}"]`)) ||
    root.querySelector('[componentkey^="JobDetails_AboutTheJob_"]') ||
    root.querySelector('[data-sdui-component$=".aboutTheJob"]');
  let box = about?.querySelector('[data-testid="expandable-text-box"]') ?? null;
  if (!box) {
    // The longest expandable text in the pane that isn't about the company.
    let len = 0;
    for (const b of root.querySelectorAll('[data-testid="expandable-text-box"]')) {
      if (b.closest('[componentkey^="JobDetails_AboutTheCompany_"]')) continue;
      const l = textOf(b).length;
      if (l > len) {
        box = b;
        len = l;
      }
    }
  }
  const byTitle = fromDocTitle(doc);
  const companyLabel =
    root
      .querySelector('[aria-label^="Company, "]')
      ?.getAttribute('aria-label')
      ?.replace(/^Company,\s*/, '')
      .replace(/\.$/, '') ?? '';
  let companyLink = '';
  for (const a of root.querySelectorAll('a[href*="/company/"]'))
    if (!a.closest('[data-sdui-component]') && textOf(a)) {
      companyLink = textOf(a);
      break;
    }
  let location = '';
  for (const p of root.querySelectorAll('p')) {
    const t = textOf(p);
    if (t.includes(' · ')) {
      location = t.split(' · ')[0]!.trim();
      break;
    }
  }
  let workplace = '';
  for (const el of root.querySelectorAll('a, span, button'))
    if ((workplace = workplaceWord(textOf(el)))) break;
  return {
    title: byTitle.title,
    // The page's own company name first: the tab title is only a fallback.
    company: companyLabel || companyLink || byTitle.company,
    location,
    workplace,
    text: textWithout(box, '[data-testid="expandable-text-button"]'),
  };
}

function readClassic(root: ParentNode): Fields {
  const location = textOf(
    first(root, [
      '.job-details-jobs-unified-top-card__primary-description-container .tvm__text',
      '.job-details-jobs-unified-top-card__tertiary-description-container .tvm__text',
      '.job-details-jobs-unified-top-card__bullet',
    ]),
  );
  let workplace = '';
  for (const el of root.querySelectorAll(
    '.job-details-fit-level-preferences button strong, .job-details-fit-level-preferences button span, .job-details-preferences-and-skills span',
  ))
    if ((workplace = workplaceWord(textOf(el)))) break;
  return {
    title: textOf(
      first(root, ['.job-details-jobs-unified-top-card__job-title h1', 'h1.t-24', 'h1']),
    ),
    company: textOf(first(root, ['.job-details-jobs-unified-top-card__company-name a'])),
    location: location.split(/\s+·\s+/)[0] ?? '',
    workplace,
    text: textWithout(
      first(root, [
        '#job-details',
        '.jobs-description__content .jobs-box__html-content',
        '.jobs-box__html-content',
      ]),
      'h2',
    ),
  };
}

function readGuest(root: ParentNode): Fields {
  return {
    title: textOf(first(root, ['h1.top-card-layout__title', '.topcard__title'])),
    company: textOf(first(root, ['a.topcard__org-name-link', '.topcard__org-name-link'])),
    location: textOf(first(root, ['span.topcard__flavor--bullet'])),
    workplace: '',
    text: textOf(
      first(root, [
        '.description__text .show-more-less-html__markup',
        '.show-more-less-html__markup',
      ]),
    ),
  };
}

const EMPTY: Fields = { title: '', company: '', location: '', workplace: '', text: '' };

export function extractLinkedInJob(doc: Document, href: string): LinkedInJob | null {
  const jobId = jobIdFromUrl(href) ?? '';
  const url = jobId ? `https://www.linkedin.com/jobs/view/${jobId}/` : href.split('#')[0]!;
  const layout = detectLayout(doc);
  const root = paneRoot(doc, layout);
  const f =
    layout === 'sdui'
      ? readSdui(doc, root, jobId)
      : layout === 'classic'
        ? readClassic(root)
        : layout === 'guest'
          ? readGuest(root)
          : EMPTY;

  const ld = fromJsonLd(doc, jobId);
  let text = f.text;
  if (text.length < MIN_DESCRIPTION) text = fromHeading(root) || text;
  if (text.length < MIN_DESCRIPTION && ld?.text) text = ld.text;
  if (text.length < MIN_DESCRIPTION) text = largestBlock(root) || text;
  if (text.length < MIN_DESCRIPTION) return null;

  const byTitle = fromDocTitle(doc);
  return {
    url,
    hostname: 'www.linkedin.com',
    jobId,
    title: (f.title || ld?.title || byTitle.title).slice(0, 300),
    company: (f.company || ld?.company || byTitle.company).slice(0, 300),
    location: (f.location || ld?.location || '').slice(0, 300),
    workplace: f.workplace || ld?.workplace || '',
    text: text.replace(/^about the job\s*\n/i, '').slice(0, MAX_TEXT),
  };
}
