import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  testIgnore: 'release-four-app.spec.ts',
  webServer: [
    {
      command: 'npm run build && npm run preview -- --port 4173',
      url: 'http://127.0.0.1:4173',
      reuseExistingServer: true
    },
    {
      command: 'python3 -m http.server 4174 --bind 127.0.0.1',
      url: 'http://127.0.0.1:4174/docs/design/longview-hackathon-acceptance-demo.html',
      reuseExistingServer: true
    }
  ],
  use: { baseURL: 'http://127.0.0.1:4173', channel: 'chrome', trace: 'retain-on-failure' },
  projects: [{ name: 'mobile-chrome', use: { ...devices['Pixel 7'] } }]
});
