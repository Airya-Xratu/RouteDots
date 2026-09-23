import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  retries: 0,
  workers: 1,
  // `list` for the console, `github` so failures surface as check-run
  // annotations (readable without a log download) and `html` so a failing run
  // leaves a report behind (the workflow uploads it as an artifact).
  reporter: process.env.CI
    ? [['list'], ['github'], ['html', { open: 'never' }]]
    : [['list'], ['html', { open: 'never' }]],
  use: {
    headless: true,
    viewport: { width: 1280, height: 800 },
    trace: 'retain-on-failure',
  },
});
