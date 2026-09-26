// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error plain ESM build script, no types
import { build, toChrome } from '../../scripts/i18n.mjs';
import { t } from '@/ui/i18n';

const root = join(import.meta.dirname, '../..');
type Messages = Record<string, { message: string; placeholders?: Record<string, unknown> }>;
const built = build() as Record<string, Messages>;
const placeholders = (m: string) => [...m.matchAll(/\$P(\d)\$/g)].map((x) => x[1]).sort();

describe('translations', () => {
  it('public/_locales is up to date (run: node scripts/i18n.mjs)', () => {
    for (const [lang, messages] of Object.entries(built)) {
      const onDisk = JSON.parse(
        readFileSync(join(root, 'public/_locales', lang, 'messages.json'), 'utf8'),
      );
      expect(onDisk, lang).toEqual(messages);
    }
    const dirs = readdirSync(join(root, 'public/_locales')).sort();
    expect(dirs).toEqual(Object.keys(built).sort());
  });

  it('every language has every key, with the same placeholders', () => {
    const en = built.en!;
    for (const [lang, messages] of Object.entries(built)) {
      if (lang === 'en') continue;
      expect(Object.keys(messages).sort(), `${lang} keys`).toEqual(Object.keys(en).sort());
      for (const [key, { message }] of Object.entries(messages)) {
        expect(placeholders(message), `${lang}.${key}`).toEqual(placeholders(en[key]!.message));
        expect(message.trim(), `${lang}.${key} is empty`).not.toBe('');
        expect(message, `${lang}.${key} has an em dash`).not.toMatch(/[—–]/);
      }
    }
  });

  it('converts $1 to Chrome placeholders, and t() fills the fallback', () => {
    expect(toChrome('Version $1 of $2')).toEqual({
      message: 'Version $P1$ of $P2$',
      placeholders: { p1: { content: '$1' }, p2: { content: '$2' } },
    });
    expect(toChrome('Plain')).toEqual({ message: 'Plain' });
    expect(t('x_missing', 'Version $1 of $2', '3', '4')).toBe('Version 3 of 4');
  });
});
