import { defineConfig, devices } from "@playwright/test";
import path from "path";

/**
 * Playwright config specifically for generating documentation videos.
 * Runs against the E2E Docker environment (same as tests).
 *
 * Usage:
 *   npx playwright test --config=playwright.config.ts
 *   npx playwright test --config=playwright.config.ts --grep "Model Management"
 */
export default defineConfig({
    testDir: "./scripts",
    timeout: 120_000,
    fullyParallel: false,
    forbidOnly: true,
    retries: 0,
    workers: 1,
    reporter: [["list"]],
    outputDir: "./test-results",
    use: {
        // Use localhost (not 127.0.0.1) so browser origin matches CORS allowed origins
        baseURL: process.env.FRONTEND_URL || "http://localhost:3002",
        // Record video for every test
        video: {
            mode: "on",
            size: { width: 1280, height: 720 },
        },
        // No blue Playwright border — use a plain viewport, no highlights
        screenshot: "off",
        trace: "off",
        // Viewport matches video size exactly — no blue border
        viewport: { width: 1280, height: 720 },
        // Disable action highlights (blue borders)
        actionTimeout: 15_000,
        launchOptions: {
            args: [
                "--disable-blink-features=AutomationControlled",
                "--no-default-browser-check",
            ],
        },
    },
    projects: [
        {
            name: "video-generation",
            use: {
                ...devices["Desktop Chrome"],
                viewport: { width: 1280, height: 720 },
                // Override device defaults that may add automation indicators
                hasTouch: false,
                isMobile: false,
                colorScheme: "dark",
            },
        },
    ],
});
