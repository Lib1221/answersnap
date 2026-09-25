import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'list',
  webServer: {
    command: 'node tests/fixtures/serve.mjs',
    url: 'http://127.0.0.1:4610/crop-target.html',
    reuseExistingServer: !process.env.CI,
  },
});
