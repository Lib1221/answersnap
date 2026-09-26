import { DETAIL_LABELS, type Design, type DetailKind, type Personal } from '@/kb/resume/model';
import { safeUrl } from '@/kb/richText';

// The resume header's contact line: email, phone, location, then the extra details in the order
// the user put them. Web and mail addresses become links (http, https, mailto only).

export interface ContactItem {
  /** DocIcon name. */
  icon: string;
  text: string;
  href: string | null;
}

/** Details that hold a profile or contact address rather than a personal fact. */
export const LINK_KINDS: ReadonlySet<DetailKind> = new Set<DetailKind>([
  'website',
  'linkedin',
  'github',
  'portfolio',
  'gitlab',
  'stackoverflow',
  'orcid',
  'scholar',
  'researchgate',
  'behance',
  'dribbble',
  'medium',
  'x',
  'youtube',
  'instagram',
  'telegram',
  'whatsapp',
  'skype',
]);

/** Handles ("jamie.park", "@jamie", a phone number) that are often written without an address. */
export const HANDLE_KINDS: ReadonlySet<DetailKind> = new Set<DetailKind>([
  'telegram',
  'whatsapp',
  'skype',
]);

/** Personal facts (date of birth, visa...) never link, whatever they look like. */
const FACT_KINDS: ReadonlySet<DetailKind> = new Set<DetailKind>([
  'dateOfBirth',
  'placeOfBirth',
  'nationality',
  'passport',
  'visa',
  'drivingLicence',
  'gender',
  'maritalStatus',
]);

/**
 * The link for a detail, or null. A value links when it is written with http, https, or mailto,
 * or is a bare email address or domain with a real top-level domain ("3.8" and "v1.2" are not
 * links). A handle such as a Skype name ("jamie.park") links only with a path (t.me/jamie).
 */
export function detailHref(kind: DetailKind, value: string): string | null {
  if (FACT_KINDS.has(kind)) return null;
  const v = value.trim();
  const href = safeUrl(v);
  if (!href) return null;
  if (/^(https?:\/\/|mailto:)/i.test(v) || href.startsWith('mailto:')) return href;
  const host = v.split('/')[0]!;
  if (!/\.[a-z]{2,}$/i.test(host)) return null;
  if (HANDLE_KINDS.has(kind) && !v.includes('/')) return null;
  return href;
}

/** An address as shown on the page: without "https://", "www.", "mailto:", or a trailing slash. */
export function cleanUrl(value: string): string {
  return value
    .trim()
    .replace(/^mailto:/i, '')
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .replace(/\/+$/, '');
}

export function contactItems(
  personal: Personal,
  contactStyle: Design['contactStyle'],
): ContactItem[] {
  const items: ContactItem[] = [];
  const { email, phone, location } = personal;
  if (email) items.push({ icon: 'email', text: email, href: `mailto:${email}` });
  if (phone)
    items.push({ icon: 'phone', text: phone, href: `tel:${phone.replace(/[^\d+]/g, '')}` });
  if (location) items.push({ icon: 'location', text: location, href: null });
  for (const det of personal.details) {
    const value = det.value.trim();
    if (!value) continue;
    const href = detailHref(det.kind, value);
    const label = (det.kind === 'other' ? det.label : DETAIL_LABELS[det.kind]).trim();
    // Icons say what a line is; the other styles need the label, except a platform's own address.
    const withLabel = (text: string) =>
      contactStyle === 'icons' || !label ? text : `${label}: ${text}`;
    if (href && LINK_KINDS.has(det.kind)) {
      items.push({ icon: det.kind, text: cleanUrl(value), href });
    } else if (href) {
      const icon = href.startsWith('mailto:') ? 'email' : 'link';
      items.push({ icon, text: withLabel(cleanUrl(value)), href });
    } else {
      items.push({ icon: det.kind, text: withLabel(value), href: null });
    }
  }
  return items;
}
