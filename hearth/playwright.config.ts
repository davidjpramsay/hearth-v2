import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 30_000,
  expect: { timeout: 5_000 },
  outputDir: 'test-results',
  reporter: [['line'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://127.0.0.1:4320',
    colorScheme: 'light',
    locale: 'en-AU',
    timezoneId: 'Australia/Perth',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: [
    {
      command: 'pnpm build:packages && pnpm --filter @hearth/server dev',
      url: 'http://127.0.0.1:4310/api/v1/health',
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      command: 'pnpm --filter @hearth/web dev',
      url: 'http://127.0.0.1:4320/today',
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
});
