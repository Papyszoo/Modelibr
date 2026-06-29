import { defineConfig, devices } from "@playwright/test";

const useBlobReporter = !!process.env.PW_MERGE_BLOB;

export default defineConfig({
    testDir: "./demo-tests",
    timeout: 90000,
    fullyParallel: false,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 1 : 0,
    workers: 1,
    // JSON reporter = machine-readable summary for AI agents / scripts (failure
    // messages + trace paths under test-results/). See the e2e-authoring skill.
    reporter: useBlobReporter
        ? [["blob", { outputDir: "blob-report" }]]
        : [
              ["html", { open: "never", outputFolder: "playwright-report-demo" }],
              ["json", { outputFile: "test-results/demo-results.json" }],
          ],
    use: {
        baseURL:
            process.env.FRONTEND_URL || "http://localhost:3004/Modelibr/demo/",
        trace: "retain-on-failure",
        screenshot: "only-on-failure",
        video: "retain-on-failure",
        // Force the reliable software-WebGL path, exactly as playwright.config.ts
        // does for the main suite. Headless CI has no GPU, so the viewer's WebGPU
        // only ever comes up on SwiftShader, which is slow/flaky for the 3D
        // previews (env-map, linked-materials, thumbnails) the demo specs exercise.
        // Dropping the GPU makes the gl factory deterministically pick the classic
        // WebGLRenderer. Real users on a GPU keep WebGPU; this is CI-only.
        launchOptions: {
            args: ["--disable-gpu", "--use-gl=angle", "--use-angle=swiftshader"],
        },
    },
    projects: [
        {
            name: "chromium",
            use: { ...devices["Desktop Chrome"] },
        },
    ],
});
