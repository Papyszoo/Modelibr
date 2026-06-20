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
    },
    projects: [
        {
            name: "chromium",
            use: { ...devices["Desktop Chrome"] },
        },
    ],
});
