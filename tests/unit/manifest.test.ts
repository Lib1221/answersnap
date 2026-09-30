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
          "alarms",
          "notifications",
        ],
      }
    `);
  });

  it('never puts <all_urls> or extra hosts in host_permissions', () => {
    expect(manifest.host_permissions).toEqual(['https://api.anthropic.com/*']);
  });

  it('has one static content script, on LinkedIn only (Liben, 2026-09-29), and no web accessible resources', () => {
    expect(manifest.content_scripts).toEqual([
      expect.objectContaining({
        matches: ['https://www.linkedin.com/*'],
        run_at: 'document_idle',
        js: [expect.stringMatching(/linkedin/)],
      }),
    ]);
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

  it('keeps the LinkedIn button script small: it loads on every LinkedIn page', async () => {
    const { size } = await stat(join(lastBuildDir, 'content-scripts/linkedin.js'));
    expect(size).toBeLessThan(20 * 1024);
  });

  it('page scripts never submit a form or hand a page files (hard rules 1 and 2)', async () => {
    for (const file of ['capture.js', 'content-scripts/linkedin.js']) {
      const code = await readFile(join(lastBuildDir, file), 'utf8');
      const found = code.match(/requestSubmit\(|\.submit\(\)|\.files\s*=[^=]/)?.[0] ?? null;
      expect(found, file).toBeNull();
    }
  });

  it("never posts to LinkedIn's page: no message would carry the extension's id", async () => {
    const code = await readFile(join(lastBuildDir, 'content-scripts/linkedin.js'), 'utf8');
    // WXT's only post to the page is guarded by this option, set in the script's definition.
    expect(code).toContain('noScriptStartedPostMessage:!0');
    expect(code.match(/postMessage\(/g)).toHaveLength(1);
    expect(code).toMatch(/noScriptStartedPostMessage\|\|window\.postMessage\(/);
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

describe('Firefox build', () => {
  let manifest: BuiltManifest & {
    sidebar_action?: { default_panel?: string };
    browser_specific_settings?: {
      gecko?: { id?: string; data_collection_permissions?: { required?: string[] } };
    };
    side_panel?: unknown;
  };
  beforeAll(async () => {
    const outDir = await mkdtemp(join(tmpdir(), 'answersnap-firefox-'));
    dirs.push(outDir);
    await build({ browser: 'firefox', manifestVersion: 3, outDir, logger: silentLogger });
    manifest = JSON.parse(await readFile(join(outDir, 'firefox-mv3', 'manifest.json'), 'utf8'));
  }, BUILD_TIMEOUT_MS);

  it('uses a sidebar instead of the side panel, with a stable add-on id', () => {
    expect(manifest.sidebar_action?.default_panel).toMatch(/sidepanel\.html$/);
    expect(manifest.side_panel).toBeUndefined();
    expect(manifest.permissions).not.toContain('sidePanel');
    expect(manifest.permissions).toEqual(
      expect.arrayContaining(['activeTab', 'scripting', 'storage', 'alarms', 'notifications']),
    );
    expect(manifest.browser_specific_settings?.gecko?.id).toBe('answersnap@lib1221.github.io');
    expect(
      manifest.browser_specific_settings?.gecko?.data_collection_permissions?.required,
    ).toEqual(['personallyIdentifyingInfo', 'websiteContent']);
    expect(manifest.minimum_chrome_version).toBeUndefined();
  });
});

afterAll(async () => {
  await Promise.all(dirs.map((d) => rm(d, { recursive: true, force: true })));
});
