import { defineConfig, devices } from "@playwright/test";
import { defineBddConfig } from "playwright-bdd";

const testDir = defineBddConfig({
    features: ["features/*.feature", "features/**/*.feature"],
    steps: "steps/*.ts",
});

// When PW_MERGE_BLOB is set, each phase writes a blob report;
// after all phases, run-e2e.js merges them into a single HTML report.
const useBlobReporter = !!process.env.PW_MERGE_BLOB;

// Only honour a known value for an env-driven enum, else fall back to the default
// — so a typo (e.g. PW_TRACE=true) can't make Playwright throw at config load.
const envEnum = (v: string | undefined, allowed: string[], dflt: string) =>
    v && allowed.includes(v) ? v : dflt;

export default defineConfig({
    testDir,
    globalSetup: "./global-setup.ts",
    // 90s default to allow for thumbnail generation (Puppeteer cold start +
    // rendering takes 30-40s). Overridable via PW_TEST_TIMEOUT so slower
    // deployments (e.g. an installed native build on a contended CI runner) can
    // give UI actions more headroom without changing local/Docker behavior.
    timeout: parseInt(process.env.PW_TEST_TIMEOUT || "90000", 10),
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    // Retries only re-run failed tests, so they don't weaken anything; raising
    // them via PW_RETRIES helps the flaky-timeout tail on slow runners pass.
    retries: process.env.PW_RETRIES ? parseInt(process.env.PW_RETRIES, 10) : 1,
    // Workers are controlled per-phase by run-e2e.js:
    //   setup    → --workers=1  (sequential, avoids asset-processor overload)
    //   chromium → --workers=2  (local) / --workers=4  (CI)
    //
    // 2 workers locally reduces database and asset-processor contention,
    // eliminating most parallel timing issues while keeping run time reasonable.
    // When running manually, default to 2.
    workers: parseInt(process.env.PW_WORKERS || "2", 10),
    // The JSON reporter writes a machine-readable run summary (incl. each
    // failure's message + the path to its trace/screenshot under test-results/)
    // that an AI agent or script can parse directly — see the e2e-authoring skill.
    reporter: useBlobReporter
        ? [["blob", { outputDir: "blob-report" }]]
        : [
              ["html", { open: "never" }],
              ["json", { outputFile: "test-results/results.json" }],
          ],
    use: {
        baseURL: process.env.FRONTEND_URL || "http://localhost:3002",
        // Defaults are preserved when the env vars are absent or invalid; the Test
        // Studio run builder sets these to capture artifacts on demand (PW_VIDEO=on).
        trace: envEnum(process.env.PW_TRACE, ["off", "on", "on-first-retry", "retain-on-failure"], "on-first-retry") as any,
        screenshot: envEnum(process.env.PW_SCREENSHOT, ["off", "on", "only-on-failure"], "on") as any,
        video: envEnum(process.env.PW_VIDEO, ["off", "on", "retain-on-failure", "on-first-retry"], "retain-on-failure") as any,
        // Strict compare: PW_HEADED=0 must not mean headed.
        headless: process.env.PW_HEADED === "1" ? false : undefined,
        // Keep WebGL available when Chromium falls back to software rendering
        // (SwiftShader) on a GPU-less CI runner — recent Chromium disables WebGL
        // on SwiftShader unless this flag is set. It's a no-op on machines with a
        // real GPU (the Mac Mini lane), so it doesn't force software rendering.
        launchOptions: {
            args: ["--enable-unsafe-swiftshader"],
        },
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
            grepInvert: /@setup|@slow|@serial|@performance/,
            dependencies: ["setup"], // Wait for all setup features to finish
            use: { ...devices["Desktop Chrome"] },
        },
        {
            name: "serial",
            testDir,
            grep: /@serial/,
            grepInvert: /@setup|@performance/,
            dependencies: ["setup", "chromium"], // Run after chromium to avoid asset-processor contention
            fullyParallel: false,
            use: { ...devices["Desktop Chrome"] },
        },
        {
            name: "slow",
            testDir,
            grep: /@slow/,
            grepInvert: /@setup|@performance/,
            dependencies: ["setup", "chromium", "serial"], // Run last to avoid asset-processor contention with other projects
            fullyParallel: false, // Slow tests run sequentially to avoid asset-processor contention
            timeout: 720000, // 12 min for Blender rendering
            use: { ...devices["Desktop Chrome"] },
        },
        {
            // Performance tests are excluded from test:quick, test:ci, and CI scripts.
            // They run only when explicitly requested:
            //   npx playwright test --project=performance
            name: "performance",
            testDir,
            grep: /@performance/,
            grepInvert: /@setup/,
            dependencies: ["setup"],
            fullyParallel: false, // Sequential to get reliable timing measurements
            timeout: 600000, // 10 min — bulk uploads with thumbnail generation
            use: { ...devices["Desktop Chrome"] },
        },
    ],
});
