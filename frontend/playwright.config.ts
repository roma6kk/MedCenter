import { defineConfig, devices } from '@playwright/test';

const channel = process.env['E2E_BROWSER_CHANNEL'];

const browser = { ...devices['Desktop Chrome'], ...(channel === undefined || channel === '' ? {} : { channel, launchOptions: { args: ['--no-sandbox'] } }) };

export default defineConfig({
  testDir: './e2e',
  outputDir: './test-results/pw',
  use: { baseURL: process.env['E2E_BASE_URL'] ?? 'http://localhost:3000', trace: 'on-first-retry' },
  projects: [
    // One real sign-in per account; auth-service throttles login per IP.
    { name: 'setup', testMatch: /auth\.setup\.ts$/, use: browser },
    { name: 'chromium', testIgnore: /auth\.setup\.ts$/, dependencies: ['setup'], use: browser },
  ],
});
