import { defineConfig, devices } from "@playwright/test";
import { defineBddConfig } from "playwright-bdd";

const testDir = defineBddConfig({
    features: ["features/*.feature", "features/**/*.feature"],
    steps: "steps/*.ts",
});

export default defineConfig({
    testDir,
    globalSetup: "./global-setup.ts",
    timeout: 90000, // 90s to allow for thumbnail generation (Puppeteer cold start + rendering takes 30-40s)
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    // Workers are controlled per-phase by run-e2e.js:
    //   setup  → --workers=1  (sequential, avoids asset-processor overload)
    //   chromium → --workers=N (parallel, auto-provisioned data)
    // When running manually, default to 2.
    workers: parseInt(process.env.PW_WORKERS || "2", 10),
    reporter: [["html", { open: "never" }]],
    use: {
        baseURL: process.env.FRONTEND_URL || "http://localhost:3002",
        trace: "on-first-retry",
        screenshot: "on",
        video: "retain-on-failure",
    },
    // Each worker can optionally scope to its own database via TEST_WORKER_INDEX.
    // See db-helper.ts resolveDatabaseName() for details.
    //
    // Setup tests (@setup tag) run sequentially FIRST, then all other tests
    // run in parallel.  This prevents race conditions where dependent tests
    // start before the data they need has been created.
    projects: [
        {
            name: "setup",
            testDir,
            grep: /@setup/,
            fullyParallel: false, // Setup tests run sequentially
            timeout: 300000, // 5 min — thumbnail generation has cold-start latency
            use: { ...devices["Desktop Chrome"] },
        },
        {
            name: "chromium",
            testDir,
            grepInvert: /@setup/,
            dependencies: ["setup"], // Wait for all setup features to finish
            use: { ...devices["Desktop Chrome"] },
        },
    ],
});
