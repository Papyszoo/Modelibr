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
    //   setup    → --workers=1  (sequential, avoids asset-processor overload)
    //   chromium → --workers=3  (local) / --workers=4  (CI)
    //
    // 3 workers locally ensures the two slow test files (mixed-format-thumbnail
    // ~10min, signalr-notifications ~6min) each get a dedicated worker while a
    // third worker handles all remaining fast tests, reducing total time from
    // ~13min (workers=2) to ~10.5min bounded by the slowest thumbnail job.
    // When running manually, default to 3.
    workers: parseInt(process.env.PW_WORKERS || "3", 10),
    reporter: [["html", { open: "never" }]],
    use: {
        baseURL: process.env.FRONTEND_URL || "http://localhost:3002",
        trace: "on-first-retry",
        screenshot: "on",
        video: "retain-on-failure",
    },
    // NOTE: Per-worker DB isolation (PARALLEL_DB=true / TEST_WORKER_INDEX) is
    // NOT active. The e2e stack uses a single WebAPI + single PostgreSQL container,
    // so routing workers to separate databases would require N container pairs.
    // Data accumulation is handled by global cleanup + Load More loops in step files.
    // See docs/ai-documentation/TESTING.md → "Slow Test Files and Worker Count".
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
