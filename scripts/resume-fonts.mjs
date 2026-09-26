// Builds src/entrypoints/resume/doc/fonts.css from the @fontsource packages: one @font-face per
// bundled resume font, subset, weight, and style, woff2 only, with Fontsource's unicode ranges.
// Also writes public/licenses/fonts.txt, shipped in the extension: every bundled font's copyright
// notice and the SIL Open Font License, as the license requires for redistribution.
// The fonts are the ones marked `bundled: true` in src/kb/resume/fonts.ts (Public Sans comes from
// its variable package). Run after changing that list: `pnpm fonts`. `--check` fails if stale.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const root = join(import.meta.dirname, '..');
const OUT = join(root, 'src/entrypoints/resume/doc/fonts.css');
const LICENSES = join(root, 'public/licenses/fonts.txt');
const SUBSETS = new Set(['latin', 'latin-ext']);

const catalog = readFileSync(join(root, 'src/kb/resume/fonts.ts'), 'utf8');
const bundled = [...catalog.matchAll(/'?([a-z0-9-]+)'?: \{[^}]*?bundled: true/g)]
  .map((m) => m[1])
  .filter((k) => k !== 'public-sans');

const RULE = /\/\* (?<name>[^*]+) \*\/\s*@font-face \{(?<body>[^}]*)\}/g;

function faces(pkg, weights, subsets, styles = ['normal', 'italic']) {
  const dir = join(root, 'node_modules/@fontsource', pkg);
  const out = [];
  for (const w of weights)
    for (const style of styles) {
      const file = join(dir, style === 'normal' ? `${w}.css` : `${w}-italic.css`);
      if (!existsSync(file)) continue;
      for (const m of readFileSync(file, 'utf8').matchAll(RULE)) {
        const sub = m.groups.name.trim().match(new RegExp(`^${pkg}-(.+)-${w}-${style}$`));
        if (!sub || !subsets.has(sub[1])) continue;
        const body = m.groups.body;
        const family = body.match(/font-family: '([^']+)'/)[1];
        const woff2 = body.match(/url\(\.\/files\/([^)]+\.woff2)\)/)[1];
        const range = body.match(/unicode-range: ([^;]+);/)[1];
        out.push(
          [
            '@font-face {',
            `  font-family: '${family}';`,
            `  font-style: ${style};`,
            `  font-weight: ${w};`,
            '  font-display: swap;',
            `  src: url('@fontsource/${pkg}/files/${woff2}') format('woff2');`,
            `  unicode-range: ${range};`,
            '}',
          ].join('\n'),
        );
      }
    }
  return out;
}

const lines = [
  '/* Generated from the @fontsource packages (OFL-1.1) by scripts/resume-fonts.mjs: Latin and',
  '   Latin Extended, regular and bold, upright and italic where the font has them, woff2 only (Chrome',
  '   needs nothing else). Loaded by the resume builder page only. */',
  '',
  '/* Public Sans (the app font) in italic too, for subtitles. */',
  "@import '@fontsource-variable/public-sans/wght.css';",
  "@import '@fontsource-variable/public-sans/wght-italic.css';",
  '',
];
for (const pkg of bundled) {
  const meta = JSON.parse(
    readFileSync(join(root, 'node_modules/@fontsource', pkg, 'metadata.json'), 'utf8'),
  );
  // Regular and bold; a font whose heaviest is 900 (no 700) uses that as its bold.
  const weights = [400, 700, 900].filter((w) => meta.weights.includes(w));
  if (weights.includes(700) && weights.includes(900)) weights.pop();
  lines.push(...faces(pkg, weights, SUBSETS));
}
lines.push(
  '',
  '/* Amharic and the other Ethiopic-script languages. Only the Ethiopic subset is declared, so this',
  '   family can sit in every font stack without taking over Latin text. */',
  ...faces('noto-sans-ethiopic', [400, 700], new Set(['ethiopic']), ['normal']),
);
const css = `${lines.join('\n')}\n`;

// Licenses: each font's copyright notice (the part of its LICENSE before the license text), then
// the SIL Open Font License once.
const MARK = 'This Font Software is licensed under the SIL Open Font License';
const packages = [
  ['@fontsource-variable/public-sans', 'Public Sans'],
  ...bundled.map((k) => [`@fontsource/${k}`, null]),
  ['@fontsource/noto-sans-ethiopic', 'Noto Sans Ethiopic'],
];
// Fontsource's LICENSE for these names only "Google Inc."; these are the fonts' own copyright lines.
const ADOBE_SOURCE =
  "with Reserved Font Name 'Source'. All Rights Reserved. Source is a trademark of Adobe in the United States and/or other countries.";
const COPYRIGHT = {
  'Source Sans 3': `Copyright 2010-2020 Adobe (http://www.adobe.com/), ${ADOBE_SOURCE}`,
  'Source Serif 4': `Copyright 2014-2021 Adobe (http://www.adobe.com/), ${ADOBE_SOURCE}`,
  'Source Code Pro': `Copyright 2010-2020 Adobe (http://www.adobe.com/), ${ADOBE_SOURCE}`,
  'Fira Sans': 'Digitized data copyright (c) 2012-2015, The Mozilla Foundation and Telefonica S.A.',
};
let ofl = '';
const notices = packages.map(([pkg, name]) => {
  const dir = join(root, 'node_modules', pkg);
  const text = readFileSync(join(dir, 'LICENSE'), 'utf8').replace(/\r\n?/g, '\n');
  const at = text.indexOf(MARK);
  if (at === -1) throw new Error(`${pkg}: not under the SIL Open Font License`);
  ofl ||= text.slice(at);
  const family = name ?? JSON.parse(readFileSync(join(dir, 'metadata.json'), 'utf8')).family;
  return `${family}\n${COPYRIGHT[family] ?? text.slice(0, at).trim()}`;
});
const licenses = [
  'Fonts bundled with AnswerSnap for the resume builder, from Fontsource (fontsource.org).',
  'Each is licensed under the SIL Open Font License, Version 1.1, copied at the end.',
  '',
  ...notices.flatMap((n) => [n, '']),
  ofl.trim(),
  '',
].join('\n');

const outputs = [
  [OUT, css],
  [LICENSES, licenses],
];
if (process.argv.includes('--check')) {
  for (const [file, text] of outputs)
    if (!existsSync(file) || readFileSync(file, 'utf8') !== text) {
      console.error(`${file} is stale: run \`pnpm fonts\`.`);
      process.exit(1);
    }
} else {
  mkdirSync(dirname(LICENSES), { recursive: true });
  for (const [file, text] of outputs) writeFileSync(file, text);
  console.log(`fonts.css: ${bundled.length} fonts, ${css.split('@font-face').length - 1} faces`);
}
