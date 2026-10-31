import { defineConfig, devices } from '@playwright/test';

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: './tests/e2e',

  /* Run tests in files in parallel */
  fullyParallel: true,

  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,

  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,

  /*
   * Local runs use `vinext dev` (see webServer below), so the first request to
   * each route pays an on-demand compile. Under
   * vinext 1.0.0-beta.5 that cold-start cost exceeds Playwright's defaults —
   * routes resolve correctly, just not within 30s/5s. Raised rather than papered
   * over with retries so a genuine hang still fails instead of being retried away.
   */
  timeout: 90 * 1000,
  expect: { timeout: 30 * 1000 },

  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : undefined,

  /* Finish with failure artifacts instead of losing diagnostics to the job timeout. */
  maxFailures: process.env.CI ? 5 : undefined,

  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: process.env.CI ? [['line'], ['html']] : 'html',

  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: 'http://127.0.0.1:3000',

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',

    /* Screenshot on failure */
    screenshot: 'only-on-failure',
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'ios-webkit',
      testMatch: /(?:native-app-ios|mobile-auth)\.spec\.ts/,
      use: { ...devices['iPhone 13'] },
    },
  ],

  /*
   * Run your local dev server before starting the tests.
   *
   * `reuseExistingServer` is false even locally, deliberately, and this costs
   * you the ability to reuse a dev server you already have up. That is the
   * intended trade.
   *
   * Playwright's reuse check is "does anything answer on this URL", not "is
   * that the application". It cannot tell the app from an unrelated process,
   * and this repo is developed across eleven git worktrees plus the main
   * checkout, all sharing one machine and this one hardcoded port. Reuse
   * therefore meant: whichever worktree booted first silently grades every
   * other worktree's suite.
   *
   * That is measured, not theorised. A 40-line stub serving one static page
   * on 0.0.0.0:3000 was adopted by Playwright with zero [WebServer] output,
   * and passed 14 of 24 tests in public-navigation.spec.ts. The reason so
   * many passed is a separate defect worth knowing about while you are in
   * here: 29 assertions across 7 spec files are the negative form
   * `not.toHaveTitle(/404/)`, which an empty title satisfies, versus exactly
   * one positive `toHaveTitle(/Pana Mia/i)`. Negative assertions cannot
   * distinguish the app from a blank page, so weak assertions are what made
   * server hijacking silent rather than loud.
   *
   * Until those assertions are positive, this flag is the only thing
   * guaranteeing the suite measured this checkout. Do not set it back to
   * `!process.env.CI` to save a boot: the previous escape was an accident of
   * address family (the occupying server happened to bind ::1 only, so the
   * 127.0.0.1 probe was refused), not a safeguard.
   *
   * Consequence: `vinext dev` is single-instance per project directory, so
   * stop your own dev server in THIS worktree before running locally. A
   * loud "Another vinext dev server is already running" is the good failure —
   * it is the one that cannot be mistaken for a pass.
   */
  webServer: {
    // CI already builds the app. Exercise the actual Worker: vinext dev skips
    // worker/index.ts, including route/chrome headers and request-scoped DB setup.
    command: process.env.CI
      ? 'yarn wrangler dev --config dist/server/wrangler.json --env-file .dev.vars --local --ip 127.0.0.1 --port 3000 --inspector-port 0'
      : 'npm run dev:http',
    // Native Google coverage must not depend on deployment feature flags.
    env: { NEXT_PUBLIC_GOOGLE_ENABLED: 'true' },
    url: 'http://127.0.0.1:3000',
    reuseExistingServer: false,
    timeout: 300 * 1000,
  },
});
