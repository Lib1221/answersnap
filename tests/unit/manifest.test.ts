// @vitest-environment node
import { mkdtemp, readFile, rm } from 'node:fs/promises';
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

async function buildManifest(mode: string): Promise<BuiltManifest> {
  const outDir = await mkdtemp(join(tmpdir(), `answersnap-${mode}-`));
  dirs.push(outDir);
  await build({ mode, outDir, logger: silentLogger });
  return JSON.parse(await readFile(join(outDir, 'chrome-mv3', 'manifest.json'), 'utf8'));
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
  beforeAll(async () => {
    manifest = await buildManifest('production');
  });
  afterAll(async () => {
    await Promise.all(dirs.map((d) => rm(d, { recursive: true, force: true })));
  });

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
