import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FONT_KEYS, FONTS, NAME_ONLY_FONT_KEYS, nameFontOf } from '@/kb/resume/fonts';
import { DesignSchema } from '@/kb/resume/model';

const root = join(import.meta.dirname, '../..');
const css = readFileSync(join(root, 'src/entrypoints/resume/doc/fonts.css'), 'utf8');

describe('resume fonts', () => {
  it('fonts.css and the font licenses are up to date (run: pnpm fonts)', () => {
    expect(() =>
      execFileSync('node', [join(root, 'scripts/resume-fonts.mjs'), '--check'], { stdio: 'pipe' }),
    ).not.toThrow();
  });

  it('every bundled font has a regular Latin face, woff2 only; the Ethiopic font covers Ethiopic only', () => {
    for (const k of [...FONT_KEYS, ...NAME_ONLY_FONT_KEYS]) {
      const f = FONTS[k];
      if (!f.bundled || k === 'public-sans') continue;
      expect(css, k).toContain(
        `font-family: '${f.family}';\n  font-style: normal;\n  font-weight: 400;`,
      );
    }
    expect(css).not.toMatch(/\.woff'\)/);
    const ethiopic = css.split('\n@font-face').filter((b) => b.includes("'Noto Sans Ethiopic'"));
    expect(ethiopic.length).toBe(2);
    for (const b of ethiopic) {
      expect(b).toMatch(/unicode-range: [^;]*U\+1200-1399/);
      // No Basic Latin: English text never falls into it.
      expect(b).not.toMatch(/U\+0000-00FF/);
    }
  });

  it('keeps every font key that saved resumes may use, and creative fonts are for the name only', () => {
    for (const k of ['public-sans', 'helvetica', 'georgia', 'palatino', 'garamond', 'times'])
      expect(FONT_KEYS).toContain(k);
    expect(DesignSchema.safeParse({ font: 'pacifico' }).success).toBe(false);
    expect(DesignSchema.parse({ nameFont: 'pacifico' }).nameFont).toBe('pacifico');
    expect(DesignSchema.parse({}).nameFont).toBe('same');
    // Every stack ends with the Ethiopic font and a generic family.
    for (const k of [...FONT_KEYS, ...NAME_ONLY_FONT_KEYS])
      expect(FONTS[k].stack, k).toMatch(
        /'Noto Sans Ethiopic', (sans-serif|serif|monospace|cursive)$/,
      );
  });

  it('resolves the name font: its own, else the heading font, else the text font', () => {
    const d = DesignSchema.parse({ font: 'lato' });
    expect(nameFontOf(d)).toBe('lato');
    expect(nameFontOf({ ...d, headingFont: 'lora' })).toBe('lora');
    expect(nameFontOf({ ...d, headingFont: 'lora', nameFont: 'pacifico' })).toBe('pacifico');
  });

  it('keeps the font catalog out of the schema, which Settings loads for backups', () => {
    const model = readFileSync(join(root, 'src/kb/resume/model.ts'), 'utf8');
    const templates = readFileSync(join(root, 'src/kb/resume/templates.ts'), 'utf8');
    expect(model).not.toMatch(/from '\.\/fonts'/);
    expect(templates).not.toMatch(/from '\.\/fonts'/);
  });
});
