import { Readability } from '@mozilla/readability';
import { normalizeText, realTextLength } from './normalize';

// Website import (spec 3.7, 10.2). Runs in the options page: DOMParser doesn't exist in the
// service worker. Host permission for the origin is requested in the click handler first.

/** Below this much real text, say so and offer "Import from open tab" (spec 3.7). */
export const MIN_SITE_TEXT = 400;
export const MAX_PAGES = 10;
const ASSET_EXT =
  /\.(png|jpe?g|gif|svg|webp|ico|css|js|mjs|json|xml|txt|zip|mp4|webm|woff2?|ttf|pdf)$/i;
const RESUME_NAME = /(resume|résumé|cv|curriculum)/i;

export interface ParsedPage {
  url: string;
  title: string;
  /** Readable article text, plus meta description and JSON-LD Person facts. */
  text: string;
  links: string[];
  /** Linked PDFs named like a resume or CV (downloaded only if the user says so). */
  resumeLinks: string[];
}

/** Origin pattern for chrome.permissions, e.g. https://jamiepark.example/* */
export function originPattern(url: string): string {
  const u = new URL(url);
  return `${u.protocol}//${u.host}/*`;
}

/**
 * The site's origin plus its www/apex twin. Many sites redirect one to the other, and a
 * permission for only one of them makes the redirected fetch fail.
 */
export function originPatterns(url: string): string[] {
  const u = new URL(url);
  const twin = u.hostname.startsWith('www.') ? u.hostname.slice(4) : `www.${u.hostname}`;
  const port = u.port ? `:${u.port}` : '';
  const isIp = /^[\d.]+$/.test(u.hostname) || u.hostname === 'localhost';
  return isIp ? [originPattern(url)] : [originPattern(url), `${u.protocol}//${twin}${port}/*`];
}

export function normalizeUrl(input: string): string {
  const trimmed = input.trim();
  const url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
  url.hash = '';
  return url.toString();
}

type JsonLd = Record<string, unknown>;

function flattenJsonLd(value: unknown): JsonLd[] {
  if (Array.isArray(value)) return value.flatMap(flattenJsonLd);
  if (value && typeof value === 'object') {
    const obj = value as JsonLd;
    return [obj, ...flattenJsonLd(obj['@graph'])];
  }
  return [];
}

function isPerson(node: JsonLd): boolean {
  const type = node['@type'];
  return type === 'Person' || (Array.isArray(type) && type.includes('Person'));
}

function asText(value: unknown): string {
  if (typeof value === 'string') return value.replace(/^mailto:/, '');
  if (Array.isArray(value)) return value.map(asText).filter(Boolean).join(', ');
  if (value && typeof value === 'object') {
    const o = value as JsonLd;
    return asText(o.name ?? o['@id'] ?? '');
  }
  return value == null ? '' : String(value);
}

const PERSON_FIELDS: [string, string][] = [
  ['name', 'Name'],
  ['jobTitle', 'Job title'],
  ['description', 'Description'],
  ['email', 'Email'],
  ['address', 'Location'],
  ['homeLocation', 'Location'],
  ['worksFor', 'Works for'],
  ['alumniOf', 'Education'],
  ['knowsAbout', 'Knows about'],
  ['sameAs', 'Profiles'],
];

/** Facts from JSON-LD Person data, including Person nodes inside @graph. */
export function jsonLdPersonText(doc: Document): string {
  const lines: string[] = [];
  for (const script of doc.querySelectorAll('script[type="application/ld+json"]')) {
    let data: unknown;
    try {
      data = JSON.parse(script.textContent ?? '');
    } catch {
      continue;
    }
    for (const node of flattenJsonLd(data).filter(isPerson)) {
      for (const [key, label] of PERSON_FIELDS) {
        const v = asText(node[key]);
        if (v) lines.push(`${label}: ${v}`);
      }
    }
  }
  return [...new Set(lines)].join('\n');
}

export function sameOriginLinks(
  doc: Document,
  pageUrl: string,
): { pages: string[]; resumes: string[] } {
  const base = new URL(pageUrl);
  const pages = new Set<string>();
  const resumes = new Set<string>();
  for (const a of doc.querySelectorAll('a[href]')) {
    let u: URL;
    try {
      u = new URL(a.getAttribute('href')!, base);
    } catch {
      continue;
    }
    if (u.host !== base.host || !/^https?:$/.test(u.protocol)) continue;
    const label = `${a.textContent ?? ''} ${u.pathname}`;
    if (/\.pdf$/i.test(u.pathname)) {
      if (RESUME_NAME.test(label)) resumes.add(u.toString());
      continue;
    }
    if (ASSET_EXT.test(u.pathname)) continue;
    u.hash = '';
    u.search = '';
    if (u.toString() === new URL(base.pathname, base).toString()) continue;
    pages.add(u.toString());
  }
  return { pages: [...pages].slice(0, MAX_PAGES), resumes: [...resumes] };
}

/** Parse one fetched HTML page into readable text (spec 10.2). */
export function parseHtmlPage(html: string, url: string): ParsedPage {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const title = doc.title.trim();
  const description =
    doc.querySelector('meta[name="description"]')?.getAttribute('content')?.trim() ?? '';
  const person = jsonLdPersonText(doc);
  const { pages, resumes } = sameOriginLinks(doc, url);

  for (const el of doc.querySelectorAll(
    'nav, footer, script, style, noscript, template, [aria-hidden="true"]',
  )) {
    el.remove();
  }
  const article = new Readability(doc, { charThreshold: 100 }).parse();
  const body = normalizeText(article?.textContent ?? '');

  const parts = [description, person, body].filter((p) => p && realTextLength(p) > 0);
  return {
    url,
    title,
    text: normalizeText([...new Set(parts)].join('\n\n')),
    links: pages,
    resumeLinks: resumes,
  };
}

export class FetchError extends Error {
  constructor(
    readonly url: string,
    readonly status: number,
  ) {
    super(`${url} returned ${status}`);
  }
}

export async function fetchText(
  url: string,
  signal?: AbortSignal,
): Promise<{ text: string; type: string }> {
  const res = await fetch(url, { signal, credentials: 'omit', redirect: 'follow' });
  if (!res.ok) throw new FetchError(url, res.status);
  return { text: await res.text(), type: res.headers.get('content-type') ?? '' };
}

export async function fetchPage(url: string, signal?: AbortSignal): Promise<ParsedPage> {
  const { text } = await fetchText(url, signal);
  return parseHtmlPage(text, url);
}

/** /llms.txt, if the site publishes one as plain text. */
export async function fetchLlmsTxt(url: string, signal?: AbortSignal): Promise<string | null> {
  try {
    const { text, type } = await fetchText(new URL('/llms.txt', url).toString(), signal);
    return /text\/(plain|markdown)/i.test(type) && text.trim() ? normalizeText(text) : null;
  } catch {
    return null;
  }
}

/** Fetch pages at most `limit` at a time; failures come back as errors, not exceptions. */
export async function fetchPages(
  urls: string[],
  limit = 2,
  signal?: AbortSignal,
): Promise<(ParsedPage | { url: string; error: string })[]> {
  const results: (ParsedPage | { url: string; error: string })[] = new Array(urls.length);
  let next = 0;
  const worker = async () => {
    while (next < urls.length) {
      const i = next++;
      const url = urls[i]!;
      try {
        results[i] = await fetchPage(url, signal);
      } catch (err) {
        results[i] = {
          url,
          error: err instanceof FetchError ? `Returned ${err.status}` : "Couldn't load",
        };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, urls.length) }, worker));
  return results;
}
