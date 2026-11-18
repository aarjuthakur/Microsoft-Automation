import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  timeout: 300_000,
  expect: { timeout: 15_000 },
  retries: 0,
  workers: 1,
  reporter: [['html', { open: 'never' }], ['list']],
  use: {
    channel: 'msedge',
    headless: false,
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
    viewport: null,
    launchOptions: {
      args: ['--start-maximized', '--disable-blink-features=AutomationControlled'],
    },
  },
});
