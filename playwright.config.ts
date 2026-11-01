import { defineConfig, devices } from '@playwright/test';

// Tests run against the static web export (`expo export -p web` → `dist/`),
// served by `serve -s dist`. Specs talk to the REAL Supabase project the
// bundle was built against (.env.local / CI secrets) and sign in as the
// E2E_USER_EMAIL test account; only a few specs mock individual routes with
// page.route. Assertions must therefore be data-agnostic.

const envPort = Number(process.env.PLAYWRIGHT_PORT);
const PORT = Number.isFinite(envPort) && envPort > 0 ? envPort : 8081;
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: './tests/e2e',
  // Each spec resets local storage + mocks; specs are independent.
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI
    ? [
        ['github'],
        ['list'],
        ['html', { open: 'never', outputFolder: 'playwright-report' }],
        // The JSON reporter writes a machine-readable summary the workflow
        // parses to render the GitHub job summary (pass/fail counts, the
        // list of failing specs, etc.).
        ['json', { outputFile: 'playwright-report/results.json' }],
      ]
    : [['list'], ['html', { open: 'never' }]],
  timeout: 45_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: BASE_URL,
    // Lock the locale/timezone so date-based assertions (invoice dates etc.)
    // are deterministic in CI.
    locale: 'en-US',
    timezoneId: 'UTC',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    // The app reads viewport size at mount — keep it consistent.
    viewport: { width: 1280, height: 900 },
    // Speed: don't wait for slow analytics/font CDNs that we don't control.
    actionTimeout: 10_000,
    navigationTimeout: 20_000,
  },

  projects: [
    // One-shot UI sign-in that produces playwright/.auth/user.json. Every
    // signed-in project depends on this so the storage state exists before
    // any authenticated spec runs.
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts$/,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 900 },
        channel: 'chromium',
      },
    },
    {
      name: 'chromium-desktop',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 900 },
        // Pin to full Chromium (avoids chrome-headless-shell, which doesn't
        // always ship alongside the chromium binary on every Playwright
        // version bump).
        channel: 'chromium',
      },
      // Signed-out / read-only project. Skip the authenticated specs (those
      // run under `signed-in-desktop` with the storage state loaded).
      // discover-search-focus needs the phone tab bar — it runs under chromium-mobile.
      testIgnore: [/auth\.setup\.ts$/, /signed-in\//, /discover-search-focus\.spec\.ts$/],
    },
    {
      // Authenticated runs reuse the storage state captured by the setup
      // project — so the user is already signed in when the spec loads.
      name: 'signed-in-desktop',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 900 },
        channel: 'chromium',
        storageState: 'playwright/.auth/user.json',
      },
      testMatch: /signed-in\/.*\.spec\.ts$/,
      dependencies: ['setup'],
    },
    {
      name: 'chromium-mobile',
      use: { ...devices['Pixel 7'], channel: 'chromium' },
      // Mobile-specific smoke run — the responsive layout switches columns.
      testMatch: /(tab-navigation|discover|discover-search-focus|product-detail|responsive)\.spec\.ts$/,
    },
    // Small phone — catches narrow-column overflow on iPhone SE / older Androids.
    //
    // `devices['iPhone SE']` carries defaultBrowserType: 'webkit', and spreading
    // it before `channel: 'chromium'` asked for a webkit browser on a Chromium
    // channel — an impossible combination that failed at launch in ~8ms, so this
    // project never ran a single assertion. Only the VIEWPORT/UA is wanted here;
    // browserName is pinned to match every other project in this file.
    {
      name: 'chromium-iphone-se',
      use: { ...devices['iPhone SE'], browserName: 'chromium', channel: 'chromium' },
      testMatch: /(tab-navigation|responsive|product-slider-iphone)\.spec\.ts$/,
    },
    // Tablet — landscape iPad-ish viewport. Layout shifts to 3+ columns here.
    {
      name: 'chromium-tablet',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1024, height: 1366 },
        channel: 'chromium',
      },
      testMatch: /(tab-navigation|discover|product-detail|responsive)\.spec\.ts$/,
    },
    // Wide desktop / ultrawide — catches max-width clamps and stretched layouts.
    {
      name: 'chromium-wide',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1920, height: 1080 },
        channel: 'chromium',
      },
      testMatch: /(tab-navigation|discover|product-detail|responsive)\.spec\.ts$/,
    },
  ],

  webServer: {
    // `serve -s` serves the SPA with index.html fallback, mirroring
    // vercel.json's rewrites. Reusing an existing server speeds up local
    // iteration; CI always boots fresh.
    command: `npx serve -s dist -l ${PORT} --no-clipboard`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
