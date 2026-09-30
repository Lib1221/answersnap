import { FONTS, nameFontOf } from '@/kb/resume/fonts';
import { PAGE_MM } from '@/kb/resume/format';
import type { Design } from '@/kb/resume/model';

// The design as CSS variables and classes on a page. Shared by the resume pages and the cover
// letter, so both documents look like one set.

/** Bottom margin in mm: at least 12 mm when the footer is on, so it never covers text. */
export function bottomMarginMm(x: Design): number {
  return x.footer === 'none' ? x.marginY : Math.max(x.marginY, 12);
}

export function pageVars(x: Design): Record<string, string> {
  const page = PAGE_MM[x.page];
  const font = FONTS[x.font].stack;
  const headingFont = x.headingFont === 'same' ? font : FONTS[x.headingFont].stack;
  const name = FONTS[nameFontOf(x)];
  const muted = `color-mix(in srgb, ${x.text} 55%, #fff)`;
  return {
    '--rd-page-w': `${page.w}mm`,
    '--rd-page-h': `${page.h}mm`,
    '--rd-mx': `${x.marginX}mm`,
    '--rd-my': `${x.marginY}mm`,
    '--rd-mb': `${bottomMarginMm(x)}mm`,
    '--rd-side-w': `calc((${page.w}mm - ${2 * x.marginX}mm - 7mm) * ${x.sideWidth / 100})`,
    '--rd-font': font,
    '--rd-heading-font': headingFont,
    '--rd-name-font': name.stack,
    '--rd-size': `${x.fontSize}pt`,
    '--rd-lh': String(x.lineHeight),
    '--rd-name-size': `${x.nameSize}pt`,
    // A font without a real bold (most creative fonts) stays regular rather than smeared.
    '--rd-name-weight': x.nameBold && name.bold ? '700' : '400',
    '--rd-heading-size': `${x.headingSize}em`,
    '--rd-heading-case':
      x.headingCase === 'upper'
        ? 'uppercase'
        : x.headingCase === 'capitalize'
          ? 'capitalize'
          : 'none',
    '--rd-heading-spacing': x.headingCase === 'upper' ? `${x.headingSpacing}em` : '0',
    '--rd-jobtitle-size': `${x.jobTitleSize}em`,
    '--rd-desc-gap': `${x.descSpacing}pt`,
    '--rd-heading-color': x.accentOn.headings ? x.accent : x.text,
    '--rd-line-color': x.accentOn.headingLine ? x.accent : muted,
    '--rd-level-color': x.accentOn.levels ? x.accent : x.text,
    '--rd-accent': x.accent,
    '--rd-text': x.text,
    '--rd-tint': `color-mix(in srgb, ${x.accent} 12%, #fff)`,
    '--rd-entry-gap': `${x.entrySpacing}pt`,
    '--rd-section-gap': `${x.sectionSpacing}pt`,
    '--rd-photo-size': `${x.photoSize}px`,
  };
}

export function pageClasses(x: Design): (string | Record<string, boolean>)[] {
  return [
    `rd-sidebar-${x.sidebar}`,
    `rd-bullet-${x.bullet}`,
    `rd-links-${x.linkStyle}`,
    `rd-link-${x.linkIcon}`,
    `rd-dates-${x.dateStyle}`,
    `rd-header-${x.headerSpacing}`,
    {
      'rd-fill-sidebar': x.columns === 'two' && x.fill === 'sidebar',
      'rd-fill-border': x.fill === 'border',
    },
  ];
}
