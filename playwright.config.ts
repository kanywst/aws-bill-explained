import { defineConfig, devices } from '@playwright/test';

/**
 * Smoke tests run against the built site served the way Cloudflare Pages serves
 * it, headers included. Serving dist/ without _headers would miss the whole
 * class of bug these tests exist for — the CSP that blocked the site's own
 * scripts was invisible to every check that did not apply it.
 */
/**
 * SMOKE_BASE_URL points the same tests at a deployed site. Without it they run
 * against a local server; with it they run against production and no local
 * server starts. The local pass proves the build is sound, the deployed pass
 * proves the host serves it that way — the bug these tests exist for lived in
 * the headers, which only the host actually sends.
 */
const deployed = process.env.SMOKE_BASE_URL;

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  // A deployed target has a CDN in front of it, so give it one more attempt.
  retries: deployed ? 2 : process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: deployed ?? 'http://localhost:4321',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  ...(deployed
    ? {}
    : {
        webServer: {
          command: 'node scripts/serve-dist.mjs 4321',
          url: 'http://localhost:4321/',
          reuseExistingServer: !process.env.CI,
          timeout: 30_000,
        },
      }),
});
