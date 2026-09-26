// @vitest-environment node
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { build } from 'wxt';

interface BuiltManifest {
  permissions?: string[];
  host_permissions?: string[];
  optional_host_permissions?: string[];
  content_scripts?: unknown[];
  web_accessible_resources?: unknown[];
  minimum_chrome_version?: string;
}

let lastBuildDir = '';
const BUILD_TIMEOUT_MS = 60_000;

async function buildManifest(mode: string): Promise<BuiltManifest> {
  const outDir = await mkdtemp(join(tmpdir(), `answersnap-${mode}-`));
  dirs.push(outDir);
  await build({ mode, outDir, logger: silentLogger });
  lastBuildDir = join(outDir, 'chrome-mv3');
  return JSON.parse(await readFile(join(lastBuildDir, 'manifest.json'), 'utf8'));
}

/** Scripts an HTML entry loads up front: its module script plus modulepreload links. */
async function entryScripts(dir: string, html: string): Promise<string[]> {
  const page = await readFile(join(dir, html), 'utf8');
  return [...page.matchAll(/(?:src|href)="\/?([^"]+\.js)"/g)].map((m) => m[1]!);
}

const dirs: string[] = [];
const noop = () => {};
const silentLogger = {
  debug: noop,
  log: noop,
  info: noop,
  warn: noop,
  error: noop,
  fatal: noop,
  success: noop,
  level: 0,
};

describe('production manifest', () => {
  let manifest: BuiltManifest;
  // A full production build; it outgrew the default 10 s hook timeout as features were added.
  beforeAll(async () => {
    manifest = await buildManifest('production');
  }, BUILD_TIMEOUT_MS);

  it('has exactly the permissions from spec section 6', () => {
    expect({
      permissions: manifest.permissions,
      host_permissions: manifest.host_permissions,
      optional_host_permissions: manifest.optional_host_permissions,
      minimum_chrome_version: manifest.minimum_chrome_version,
    }).toMatchInlineSnapshot(`
      {
        "host_permissions": [
          "https://api.anthropic.com/*",
        ],
        "minimum_chrome_version": "116",
        "optional_host_permissions": [
          "<all_urls>",
        ],
        "permissions": [
          "activeTab",
          "scripting",
          "storage",
          "sidePanel",
          "contextMenus",
        ],
      }
    `);
  });

  it('never puts <all_urls> or extra hosts in host_permissions', () => {
    expect(manifest.host_permissions).toEqual(['https://api.anthropic.com/*']);
  });

  it('has no static content scripts or web accessible resources', () => {
    expect(manifest.content_scripts).toBeUndefined();
    expect(manifest.web_accessible_resources).toBeUndefined();
  });
});

describe('performance budgets (spec 17, M7)', () => {
  beforeAll(async () => {
    if (!lastBuildDir) await buildManifest('production');
  }, BUILD_TIMEOUT_MS);

  it('keeps the capture script under 40 KB minified', async () => {
    const { size } = await stat(join(lastBuildDir, 'capture.js'));
    expect(size).toBeLessThan(40 * 1024);
  });

  it('keeps the side panel under 400 KB of JS gzipped, with pdf.js and mammoth out of it', async () => {
    const scripts = await entryScripts(lastBuildDir, 'sidepanel.html');
    expect(scripts.length).toBeGreaterThan(0);
    let gz = 0;
    for (const s of scripts) {
      const code = await readFile(join(lastBuildDir, s));
      gz += gzipSync(code).length;
      expect(code.toString()).not.toMatch(/GlobalWorkerOptions|mammoth/);
    }
    expect(gz).toBeLessThan(400 * 1024);
  });
});

afterAll(async () => {
  await Promise.all(dirs.map((d) => rm(d, { recursive: true, force: true })));
});
