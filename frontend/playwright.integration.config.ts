import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: 'integration.spec.ts',
  workers: 1,
  fullyParallel: false,
  timeout: 90_000,
  reporter: [['list']],
  outputDir: '../.integration/browser-results',
  use: { baseURL: 'http://127.0.0.1:3101', actionTimeout: 15_000, trace: 'off', screenshot: 'only-on-failure' },
  projects: [{ name: 'real-backend-chromium', use: { ...devices['Desktop Chrome'] } }],
});
