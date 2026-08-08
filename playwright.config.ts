import { defineConfig, devices } from '@playwright/test';

/**
 * Smoke tests run against the built site served the way Cloudflare Pages serves
 * it, headers included. Serving dist/ without _headers would miss the whole
 * class of bug these tests exist for — the CSP that blocked the site's own
 * scripts was invisible to every check that did not apply it.
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:4321',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'node scripts/serve-dist.mjs 4321',
    url: 'http://localhost:4321/',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
