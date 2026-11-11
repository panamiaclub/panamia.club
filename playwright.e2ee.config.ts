import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests-e2ee',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: 'list',
  outputDir: 'test-results-e2ee',
  use: {
    baseURL: 'http://127.0.0.1:3147',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'webkit-phone', use: { ...devices['iPhone 13'] } },
    { name: 'openmls-chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'openmls-webkit-phone', use: { ...devices['iPhone 13'] } },
  ],
  webServer: [
    {
      command: 'yarn e2ee:api-lab',
      url: 'http://127.0.0.1:3148/__e2ee/health',
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: 'yarn e2ee:lab',
      url: 'http://127.0.0.1:3147',
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
