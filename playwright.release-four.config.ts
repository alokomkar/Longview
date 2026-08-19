import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: 'release-four-app.spec.ts',
  use: {
    baseURL: process.env.LONGVIEW_RELEASE_FOUR_URL || 'http://127.0.0.1:5175',
    channel: 'chrome',
    trace: 'retain-on-failure',
    ...devices['Pixel 7']
  }
});
