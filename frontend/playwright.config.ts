import { defineConfig, devices } from '@playwright/test';

/**
 * `E2E_BROWSER_CHANNEL=chrome` drives the installed Google Chrome instead of the Playwright-managed Chromium (machines
 * without `npx playwright install`); `E2E_BASE_URL` points at the web origin of the live stack.
 */
const channel = process.env['E2E_BROWSER_CHANNEL'];

export default defineConfig({
  testDir: './e2e',
  outputDir: './test-results/pw',
  use: { baseURL: process.env['E2E_BASE_URL'] ?? 'http://localhost:3000', trace: 'on-first-retry' },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], ...(channel === undefined || channel === '' ? {} : { channel, launchOptions: { args: ['--no-sandbox'] } }) },
    },
  ],
});
