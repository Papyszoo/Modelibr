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
    // scripts/screenshots.spec.ts rewrites committed PNGs, so it only runs
    // when asked for (`npm run screenshots` sets DOCS_SCREENSHOTS=1).
    grep: process.env.DOCS_SCREENSHOTS === "1" ? /Docs Screenshots/ : undefined,
    grepInvert: process.env.DOCS_SCREENSHOTS === "1" ? undefined : /Docs Screenshots/,
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
        screenshot: "off",
        // Off by default, and deliberately: tracing instruments every action, and
        // these specs are recording to a duration cap that one clip has already
        // come within three seconds of. But a failure here leaves only an aria
        // snapshot to triage from - no screenshot, no video, no retry - so
        // PW_VIDEO_TRACE=1 buys a trace for a diagnostic re-run. Don't set it for
        // a run whose clips you intend to publish.
        trace: process.env.PW_VIDEO_TRACE ? "retain-on-failure" : "off",
        // 1280x720 CSS px rendered at 2x: the screencast is recorded at
        // 2560x1440 so the post-processor can zoom toward the action and
        // keep UI text sharp. Playwright's action overlay
        // (screencast.showActions) is deliberately never enabled; the only
        // pointer indicator is the recording cursor in helpers/video-helpers.ts.
        viewport: { width: 1280, height: 720 },
        deviceScaleFactor: 2,
        actionTimeout: 15_000,
        launchOptions: {
            // The full Chromium build in new-headless mode renders WebGL on
            // the machine's GPU. The default headless shell silently falls
            // back to SwiftShader (CPU) even on a GPU machine, which turned
            // every 3D beat into a slideshow and slowed each pointer step
            // over a canvas to a few frames per second.
            channel: process.env.VIDEO_SOFTWARE_GL === "1" ? undefined : "chromium",
            args: [
                "--disable-blink-features=AutomationControlled",
                "--no-default-browser-check",
                // deviceScaleFactor alone only changes layout DPR; the CDP
                // screencast still delivers 1x frames unless the compositor
                // itself renders at 2x.
                "--force-device-scale-factor=2",
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
                deviceScaleFactor: 2,
                // Override device defaults that may add automation indicators
                hasTouch: false,
                isMobile: false,
                colorScheme: "dark",
            },
        },
    ],
});
