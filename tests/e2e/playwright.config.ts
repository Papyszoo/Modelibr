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
    retries: 1,
    // Workers are controlled per-phase by run-e2e.js:
    //   setup    → --workers=1  (sequential, avoids asset-processor overload)
    //   chromium → --workers=2  (local) / --workers=4  (CI)
    //
    // 2 workers locally reduces database and asset-processor contention,
    // eliminating most parallel timing issues while keeping run time reasonable.
    // When running manually, default to 2.
    workers: parseInt(process.env.PW_WORKERS || "2", 10),
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
            grepInvert: /@setup|@slow|@serial/,
            dependencies: ["setup"], // Wait for all setup features to finish
            use: { ...devices["Desktop Chrome"] },
        },
        {
            name: "serial",
            testDir,
            grep: /@serial/,
            grepInvert: /@setup/,
            dependencies: ["setup", "chromium"], // Run after chromium to avoid asset-processor contention
            fullyParallel: false,
            use: { ...devices["Desktop Chrome"] },
        },
        {
            name: "slow",
            testDir,
            grep: /@slow/,
            grepInvert: /@setup/,
            dependencies: ["setup", "chromium", "serial"], // Run last to avoid asset-processor contention with other projects
            fullyParallel: false, // Slow tests run sequentially to avoid asset-processor contention
            timeout: 720000, // 12 min for Blender rendering
            use: { ...devices["Desktop Chrome"] },
        },
    ],
});
