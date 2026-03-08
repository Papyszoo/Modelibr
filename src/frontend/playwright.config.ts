import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright config for Storybook visual regression tests.
 *
 * Usage:
 *   1. Build Storybook:    npm run build-storybook
 *   2. Run visual tests:   npm run test-storybook
 *   3. Update snapshots:   npm run test-storybook:update
 */
export default defineConfig({
  testDir: './visual-tests',
  outputDir: './visual-tests/test-results',
  snapshotDir: './visual-tests/__snapshots__',
  snapshotPathTemplate: '{snapshotDir}/{testFilePath}/{arg}{ext}',

  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,

  reporter: process.env.CI ? 'github' : 'list',

  use: {
    baseURL: 'http://localhost:6007',
    trace: 'on-first-retry',
  },

  expect: {
    toHaveScreenshot: {
      // Allow small pixel differences from anti-aliasing
      maxDiffPixelRatio: 0.01,
      // Animations should be disabled before screenshot
      animations: 'disabled',
    },
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: {
    command: 'npx http-server storybook-static --port 6007 --silent',
    port: 6007,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
})
