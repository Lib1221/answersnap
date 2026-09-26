// The resume font keys alone, without the catalog: the resume schema needs them, and the schema is
// used by pages (Settings, for backups) that must not carry the font list. The catalog and its
// stylesheet are in fonts.ts, used by the resume builder only.
// Keys are stored in resumes: add new ones, never rename or remove one.

/** Fonts for the body, headings, and name. */
export const FONT_KEYS = [
  'public-sans',
  'helvetica',
  'georgia',
  'palatino',
  'garamond',
  'times',
  'verdana',
  'trebuchet',
  'tahoma',
  'courier',
  'source-sans-3',
  'karla',
  'mulish',
  'lato',
  'titillium-web',
  'work-sans',
  'barlow',
  'jost',
  'fira-sans',
  'roboto',
  'rubik',
  'asap',
  'nunito',
  'open-sans',
  'ibm-plex-sans',
  'lora',
  'source-serif-4',
  'zilla-slab',
  'pt-serif',
  'literata',
  'eb-garamond',
  'aleo',
  'crimson-pro',
  'cormorant-garamond',
  'vollkorn',
  'amiri',
  'crimson-text',
  'alegreya',
  'inconsolata',
  'source-code-pro',
  'ibm-plex-mono',
  'overpass-mono',
  'space-mono',
  'courier-prime',
] as const;
export type FontKey = (typeof FONT_KEYS)[number];

/** Display and handwriting fonts: for the name only, as in FlowCV. */
export const NAME_ONLY_FONT_KEYS = [
  'comfortaa',
  'abril-fatface',
  'amatic-sc',
  'bungee-shade',
  'caveat',
  'caveat-brush',
  'elsie',
  'lobster',
  'pacifico',
  'parisienne',
  'vibur',
] as const;
export type AnyFontKey = FontKey | (typeof NAME_ONLY_FONT_KEYS)[number];
