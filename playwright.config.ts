import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e/web',
  testMatch: '**/*.web.e2e.test.ts',
  // Allow cold-starts (model services may download/load on first run).
  timeout: 120_000,
  retries: 0,
  use: {
    baseURL: process.env.WEB_BASE_URL ?? 'http://localhost:8080',
    headless: true
  },
  reporter: [['dot']]
});

