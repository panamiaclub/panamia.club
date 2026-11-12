import path from 'node:path';
import { defineConfig } from '@playwright/test';
import {
  assertStagingDirectory,
  readStagingState,
} from './scripts/e2ee-staging-config';

const directory = process.env.PANA_E2EE_STAGING_DIRECTORY;
if (!directory) {
  throw new Error('Start the managed isolated E2EE pilot before this suite.');
}
assertStagingDirectory(directory, process.cwd());
await readStagingState(directory);

export default defineConfig({
  testDir: './tests-staging',
  testMatch: '**/*.spec.ts',
  outputDir: path.join(directory, 'browser-results'),
  timeout: 240_000,
  expect: { timeout: 30_000 },
  workers: 1,
  retries: 0,
  maxFailures: 1,
  reporter: 'line',
  use: {
    browserName: 'chromium',
    viewport: { width: 1440, height: 1100 },
    actionTimeout: 30_000,
    navigationTimeout: 45_000,
    trace: 'off',
    screenshot: 'off',
    video: 'off',
  },
});
