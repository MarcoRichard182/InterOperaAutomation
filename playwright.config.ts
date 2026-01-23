// playwright.config.ts
import { defineConfig, devices } from '@playwright/test';
import 'dotenv/config'; // <— simpler than importing the module

const headless = false;
const BASE_URL = (process.env.BASE_URL || '').replace(/\/+$/, '');

export default defineConfig({
  testDir: './tests',
  globalTeardown: './global-teardown.ts',
  fullyParallel: true,
  reporter: [
  ['list'],                 // nice console output
  ['html', { open: 'never' }]
  ],

  use: {
    headless: !!process.env.CI,
    launchOptions: { slowMo: 400 },
    baseURL: BASE_URL || undefined,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  timeout: 90_000,
  expect: { timeout: 15_000 },

  testIgnore: [
    '**/compliance-personnel.spec.ts',
  ]
});
