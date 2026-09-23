import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  retries: 0,
  workers: 1,
  // `list` for the CI log, `html` so a failing run leaves a report behind (the
  // workflow uploads it as an artifact).
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    headless: true,
    viewport: { width: 1280, height: 800 },
    trace: 'retain-on-failure',
  },
});
