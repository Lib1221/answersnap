// Builds public/_locales/*/messages.json.
//   English: every t('key', 'English fallback', ...) call in src, plus manifest-only keys already
//   in the English file (extName, menus, ...).
//   Other languages: src/locales/<lang>.json, a flat { key: message } map.
// Messages use $1..$9 for substitutions; Chrome needs them declared as placeholders, so they're
// converted here. Run: node scripts/i18n.mjs   (a unit test fails when the output is stale).

import { readdirSync, readFileSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return walk(p);
    return /\.(vue|ts)$/.test(name) && !p.endsWith(join('ui', 'i18n.ts')) ? [p] : [];
  });
}

const CALL = /\bt\(\s*'([A-Za-z0-9_]+)'\s*,\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")/g;
const unescape = (s) => s.replace(/\\(['"\\])/g, '$1').replace(/\\n/g, '\n');

export function extract() {
  const found = new Map();
  for (const file of walk(join(root, 'src'))) {
    const text = readFileSync(file, 'utf8');
    for (const m of text.matchAll(CALL)) {
      const [, key, single, double] = m;
      const message = unescape(single ?? double ?? '');
      const prev = found.get(key);
      if (prev !== undefined && prev !== message)
        throw new Error(
          `i18n key "${key}" has two different English texts:\n  ${prev}\n  ${message}`,
        );
      found.set(key, message);
    }
  }
  return found;
}

/** "$1 of $2" -> Chrome's placeholder form. */
export function toChrome(message) {
  const nums = [...new Set([...message.matchAll(/\$(\d)/g)].map((m) => m[1]))].sort();
  if (!nums.length) return { message };
  return {
    message: message.replace(/\$(\d)/g, '$$P$1$$'),
    placeholders: Object.fromEntries(nums.map((n) => [`p${n}`, { content: `$${n}` }])),
  };
}

export function build() {
  const enPath = join(root, 'public/_locales/en/messages.json');
  const existing = JSON.parse(readFileSync(enPath, 'utf8'));
  const found = extract();
  const out = {};
  // Keys the manifest uses (__MSG_name__) stay as written; anything else not in the code is gone.
  const manifestKeys = new Set(
    [...readFileSync(join(root, 'wxt.config.ts'), 'utf8').matchAll(/__MSG_(\w+)__/g)].map(
      (m) => m[1],
    ),
  );
  for (const [k, v] of Object.entries(existing))
    if (!found.has(k) && manifestKeys.has(k)) out[k] = v;
  for (const [k, msg] of [...found].sort(([a], [b]) => a.localeCompare(b)))
    out[k] = {
      ...toChrome(msg),
      ...(existing[k]?.description ? { description: existing[k].description } : {}),
    };
  const files = { en: out };
  for (const name of readdirSync(join(root, 'src/locales'))) {
    const lang = name.replace(/\.json$/, '');
    const map = JSON.parse(readFileSync(join(root, 'src/locales', name), 'utf8'));
    // Only keys English still has: removed strings drop out of every language.
    files[lang] = Object.fromEntries(
      Object.entries(map)
        .filter(([k]) => k in out)
        .map(([k, m]) => [k, toChrome(m)]),
    );
  }
  return files;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const [lang, messages] of Object.entries(build())) {
    const dir = join(root, 'public/_locales', lang);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'messages.json'), JSON.stringify(messages, null, 2) + '\n');
    console.log(`${lang}: ${Object.keys(messages).length} messages`);
  }
}
