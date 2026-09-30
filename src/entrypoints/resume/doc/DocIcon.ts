import { defineComponent, h } from 'vue';

// Small stroke icons for the resume's contact line. Drawn here, no icon library.

const PATHS: Record<string, string[]> = {
  email: ['M3 6h18v12H3z', 'm3 7 9 6 9-6'],
  phone: [
    'M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2',
  ],
  location: [
    'M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z',
    'M12 7.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5',
  ],
  website: [
    'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18',
    'M3 12h18',
    'M12 3c2.5 2.7 3.5 5.7 3.5 9s-1 6.3-3.5 9c-2.5-2.7-3.5-5.7-3.5-9s1-6.3 3.5-9',
  ],
  linkedin: ['M4 4h16v16H4z', 'M8 10v6', 'M8 7.5v.01', 'M12 16v-3.5a2 2 0 0 1 4 0V16', 'M12 10v6'],
  github: [
    'M9 19c-4 1.3-4-2-6-2.5m12 5v-3.5a3 3 0 0 0-.8-2.3c2.7-.3 5.6-1.3 5.6-6a4.6 4.6 0 0 0-1.3-3.2 4.3 4.3 0 0 0-.1-3.2s-1-.3-3.4 1.3a11.7 11.7 0 0 0-6 0C6.6 2.9 5.6 3.2 5.6 3.2a4.3 4.3 0 0 0-.1 3.2A4.6 4.6 0 0 0 4.2 9.6c0 4.6 2.9 5.7 5.6 6a3 3 0 0 0-.8 2.3V22',
  ],
  portfolio: ['M4 7h16v12H4z', 'M9 7V5h6v2'],
  // Profile platforms: simple outlines of each mark, legible at the printed size (about 10 px).
  gitlab: ['M12 20.5 3 13.5 5.2 4l2.6 7h8.4L18.8 4l2.2 9.5z'],
  stackoverflow: [
    'M4 15v5h16v-5',
    'M8 17h8',
    'M8.5 13.5l7.5 1.2',
    'M9.8 9.6l6.8 3.2',
    'M12.5 5.5l5 5',
  ],
  orcid: [
    'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18',
    'M8.5 10.5V16',
    'M8.5 8v.01',
    'M11.5 10.5V16h1.2a2.75 2.75 0 0 0 0-5.5z',
  ],
  scholar: ['M2.5 9.5 12 3l9.5 6.5', 'M12 11a5 5 0 1 0 0 10 5 5 0 0 0 0-10'],
  researchgate: ['M4 4h16v16H4z', 'M9 16.5v-9h3.5a2.5 2.5 0 0 1 0 5H9', 'M12.5 12.5l3 4'],
  behance: [
    'M3 6v12h5a3 3 0 0 0 0-6H3',
    'M3 12h4.5a3 3 0 0 0 0-6H3',
    'M14 14.5h7a3.5 3.5 0 1 0-1.2 2.6',
    'M15 7.5h5',
  ],
  dribbble: [
    'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18',
    'M4 9.5c5 .6 10-.9 14.4-4.4',
    'M5.4 18.3c3.6-4 9-5.4 15.5-4.3',
    'M8.5 3.7c3 4 5.4 10 6.5 16.6',
  ],
  medium: [
    'M7 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10',
    'M16 7c-1.4 0-2.5 2.2-2.5 5s1.1 5 2.5 5 2.5-2.2 2.5-5-1.1-5-2.5-5',
    'M21 7.5v9',
  ],
  x: ['M4 4h4.5L20 20h-4.5z', 'M20 4l-6.6 7.3', 'M10.6 12.7 4 20'],
  youtube: [
    'M3 8a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3z',
    'M10 9l5 3-5 3z',
  ],
  instagram: [
    'M4 8a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v8a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4z',
    'M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7',
    'M17 7v.01',
  ],
  telegram: ['M21 4 3 11l6 2.5 2.5 6.5 3-4 4.5 3.5z', 'M9 13.5 21 4'],
  whatsapp: ['M3.5 20.5l1.4-4.2A8.5 8.5 0 1 1 8 19.3z', 'M9.5 9c.2 2.8 2.7 5.3 5.5 5.5'],
  skype: [
    'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18',
    'M15 9.5c-.5-1-1.6-1.5-3-1.5-1.7 0-3 .8-3 2s1.3 1.7 3 2 3 .8 3 2-1.3 2-3 2c-1.4 0-2.5-.5-3-1.5',
  ],
  dateOfBirth: ['M4 6h16v14H4z', 'M4 10h16', 'M8 3v4', 'M16 3v4'],
  placeOfBirth: ['M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z'],
  nationality: ['M5 21V4', 'M5 4h11l-2 4 2 4H5'],
  passport: ['M5 3h14v18H5z', 'M12 8a3 3 0 1 1 0 6 3 3 0 0 1 0-6', 'M9 17h6'],
  visa: ['M4 6h16v12H4z', 'M4 10h16', 'M7 15h4'],
  drivingLicence: ['M5 13l2-5h10l2 5', 'M4 13h16v4H4z', 'M7 17v2', 'M17 17v2'],
  gender: ['M12 12a4 4 0 1 1 0-8 4 4 0 0 1 0 8', 'M4 21a8 8 0 0 1 16 0'],
  maritalStatus: ['M9 14a4 4 0 1 1 0-8 4 4 0 0 1 0 8', 'M15 18a4 4 0 1 1 0-8 4 4 0 0 1 0 8'],
  other: ['M12 12h.01'],
  // Section headings
  'section-profile': ['M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8', 'M4 21a8 8 0 0 1 16 0'],
  'section-experience': ['M3 7h18v13H3z', 'M8 7V4h8v3', 'M3 12h18'],
  'section-education': ['m2 9 10-5 10 5-10 5z', 'M6 11v5c3 2 9 2 12 0v-5', 'M22 9v6'],
  'section-skills': ['m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z'],
  'section-languages': [
    'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18',
    'M3 12h18',
    'M12 3c2.5 2.7 3.5 5.7 3.5 9s-1 6.3-3.5 9c-2.5-2.7-3.5-5.7-3.5-9s1-6.3 3.5-9',
  ],
  'section-certificates': ['M12 15a6 6 0 1 0 0-12 6 6 0 0 0 0 12', 'm8.5 14-1.5 7 5-3 5 3-1.5-7'],
  'section-projects': ['M3 6h6l2 2h10v11H3z'],
  'section-courses': ['M4 5a2 2 0 0 1 2-2h14v16H6a2 2 0 0 0-2 2z', 'M4 19V5'],
  'section-awards': [
    'M8 4h8v5a4 4 0 0 1-8 0z',
    'M8 6H5a3 3 0 0 0 3 4',
    'M16 6h3a3 3 0 0 1-3 4',
    'M12 13v4',
    'M8 21h8',
    'M10 17h4v4h-4z',
  ],
  'section-organisations': [
    'M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6',
    'M3 20a6 6 0 0 1 12 0',
    'M16 5a3 3 0 0 1 0 6',
    'M18 14a6 6 0 0 1 3 6',
  ],
  'section-publications': ['M6 3h9l4 4v14H6z', 'M14 3v5h5', 'M9 13h7', 'M9 17h7'],
  'section-volunteering': [
    'M12 20s-8-4.6-8-10.2A4.5 4.5 0 0 1 12 7a4.5 4.5 0 0 1 8 2.8C20 15.4 12 20 12 20z',
  ],
  'section-references': ['M7 7h4v4c0 3-2 5-4 6', 'M15 7h4v4c0 3-2 5-4 6'],
  'section-interests': [
    'M12 3v4',
    'M12 17v4',
    'M3 12h4',
    'M17 12h4',
    'm6 6 2.5 2.5',
    'm15.5 15.5 2.5 2.5',
    'm6 18 2.5-2.5',
    'm15.5 8.5 2.5-2.5',
  ],
  'section-declaration': ['M4 20h4L19 9l-4-4L4 16z', 'M13 7l4 4'],
  'section-custom': ['M6 3h12v18l-6-4-6 4z'],
  link: [
    'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1',
    'M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  ],
  /** An arrow out of a box: a link that opens elsewhere. */
  external: ['M14 4h6v6', 'M20 4l-9 9', 'M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5'],
};

/**
 * Filled versions of the common contact icons (FlowCV's solid style). LinkedIn and GitHub are the
 * Simple Icons marks (CC0). Icons without a filled version draw their outline with a heavier line.
 */
const SOLID: Record<string, string[]> = {
  email: [
    'M2 6.4A2.4 2.4 0 0 1 4.4 4h15.2A2.4 2.4 0 0 1 22 6.4v.35l-10 6.1-10-6.1z',
    'M2 9.1v8.5A2.4 2.4 0 0 0 4.4 20h15.2a2.4 2.4 0 0 0 2.4-2.4V9.1l-10 6.1z',
  ],
  phone: [
    'M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1z',
  ],
  location: [
    'M12 2a7 7 0 0 0-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z',
  ],
  linkedin: [
    'M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.41v1.56h.05a3.74 3.74 0 0 1 3.37-1.85c3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.06 2.06 0 1 1 0-4.13 2.06 2.06 0 0 1 0 4.13zM7.12 20.45H3.56V9h3.56v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.73v20.54C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.73V1.73C24 .77 23.2 0 22.22 0z',
  ],
  github: [
    'M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12',
  ],
};

/** Outlines the solid style draws in place of another: FlowCV marks a website with a chain link. */
const SOLID_OUTLINE: Record<string, string> = { website: 'link' };

export default defineComponent({
  name: 'DocIcon',
  props: {
    name: { type: String, required: true },
    /** FlowCV's filled contact icons. */
    solid: { type: Boolean, default: false },
  },
  setup(props) {
    return () => {
      const filled = props.solid ? SOLID[props.name] : undefined;
      const name = (props.solid && SOLID_OUTLINE[props.name]) || props.name;
      if (filled)
        return h(
          'svg',
          { class: 'rd-icon', viewBox: '0 0 24 24', fill: 'currentColor', 'aria-hidden': 'true' },
          filled.map((d, i) => h('path', { key: i, d })),
        );
      return h(
        'svg',
        {
          class: 'rd-icon',
          viewBox: '0 0 24 24',
          fill: 'none',
          stroke: 'currentColor',
          'stroke-width': props.solid ? 2.6 : 2,
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
          'aria-hidden': 'true',
        },
        (PATHS[name] ?? PATHS.other!).map((d, i) => h('path', { key: i, d })),
      );
    };
  },
});
