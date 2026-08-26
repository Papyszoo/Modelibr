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
    timeout: 180_000,
    fullyParallel: false,
    forbidOnly: true,
    retries: 0,
    workers: 1,
    reporter: [["list"]],
    outputDir: "./test-results",
    use: {
        // Use localhost (not 127.0.0.1) so browser origin matches CORS allowed origins
        baseURL: process.env.FRONTEND_URL || "http://localhost:3002",
        // No blue Playwright border - use a plain viewport, no highlights
        screenshot: "off",
        // Off by default, and deliberately: tracing instruments every action, and
        // these specs are recording to a duration cap that one clip has already
        // come within three seconds of. But a failure here leaves only an aria
        // snapshot to triage from - no screenshot, no video, no retry - so
        // PW_VIDEO_TRACE=1 buys a trace for a diagnostic re-run. Don't set it for
        // a run whose clips you intend to publish.
        trace: process.env.PW_VIDEO_TRACE ? "retain-on-failure" : "off",
        // Viewport matches video size exactly - no blue border
        viewport: { width: 1280, height: 720 },
        // Disable action highlights (blue borders)
        actionTimeout: 15_000,
        launchOptions: {
            args: [
                "--disable-blink-features=AutomationControlled",
                "--no-default-browser-check",
                // CI runners have no GPU, so Chromium silently falls back to
                // SwiftShader - which is where the video specs actually break.
                // Set VIDEO_SOFTWARE_GL=1 to reproduce that path on a machine
                // that does have a GPU, instead of waiting for a main push.
                ...(process.env.VIDEO_SOFTWARE_GL === "1"
                    ? [
                          "--disable-gpu",
                          "--use-gl=swiftshader",
                          "--use-angle=swiftshader",
                      ]
                    : []),
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
