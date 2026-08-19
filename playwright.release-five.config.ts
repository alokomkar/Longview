import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: 'release-five-app.spec.ts',
  globalSetup: './tests/e2e/release-five.setup.ts',
  timeout: 120_000,
  expect: { timeout: 25_000 },
  workers: 1,
  webServer: {
    command: 'VITE_FIREBASE_PROJECT_ID=longview-release-five-e2e VITE_RELEASE_SURFACE=release-five VITE_CLARA_API_URL=http://127.0.0.1:9999 npm run dev -- --port 5176',
    url: 'http://127.0.0.1:5176',
    reuseExistingServer: false,
    timeout: 30_000
  },
  use: {
    baseURL: 'http://127.0.0.1:5176',
    channel: 'chrome',
    launchOptions: process.env.LONGVIEW_RECORDING ? { slowMo: 220 } : undefined,
    trace: 'retain-on-failure',
    ...devices['Pixel 7']
  }
});
