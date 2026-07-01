import { defineConfig, devices } from '@playwright/test'

/**
 * Isolated WebGL2 harness for the shared channel-extraction shaders.
 *
 * Unlike playwright.config.ts (Storybook visual regression), this config boots
 * NO web server and loads NO app — each test renders the actual shared GLSL in a
 * real WebGL2 context via page.evaluate and reads pixels back. Software GL
 * (SwiftShader) is forced so the result is identical on a GPU dev box and a
 * GPU-less CI runner, and the run is fast and Docker-free.
 *
 * Usage: npm run test:webgl
 */
export default defineConfig({
  testDir: './webgl-tests',
  outputDir: './webgl-tests/test-results',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'github' : 'list',

  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          // Force the ANGLE→SwiftShader software GL path so WebGL2 is present
          // and deterministic with or without a real GPU.
          args: [
            '--use-gl=angle',
            '--use-angle=swiftshader',
            '--enable-unsafe-swiftshader',
          ],
        },
      },
    },
  ],
})
