import { defineConfig } from '@playwright/test';

import base from './playwright.config.ts';

// Shard individual tests across separate jobs, never concurrent workers sharing
// the demo reset endpoint. The built app is produced once by this workflow run.
export default defineConfig({
  ...base,
  fullyParallel: true,
  workers: 1,
  forbidOnly: true,
  maxFailures: 1,
  webServer: [
    {
      command: 'pnpm --filter @hearth/server start',
      url: 'http://127.0.0.1:4310/api/v1/health',
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        HEARTH_MODE: 'demo',
        HEARTH_HOST: '127.0.0.1',
        HEARTH_PORT: '4310',
        HEARTH_DATABASE_PATH: ':memory:',
      },
    },
    {
      command: 'pnpm --filter @hearth/web preview',
      url: 'http://127.0.0.1:4320/today',
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
