import { defineConfig, devices } from "@playwright/test";

const useBlobReporter = !!process.env.PW_MERGE_BLOB;

export default defineConfig({
    testDir: "./demo-tests",
    timeout: 90000,
    fullyParallel: false,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 1 : 0,
    workers: 1,
    reporter: useBlobReporter
        ? [["blob", { outputDir: "blob-report" }]]
        : [["html", { open: "never", outputFolder: "playwright-report-demo" }]],
    use: {
        baseURL:
            process.env.FRONTEND_URL || "http://localhost:3004/Modelibr/demo/",
        trace: "on-first-retry",
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
