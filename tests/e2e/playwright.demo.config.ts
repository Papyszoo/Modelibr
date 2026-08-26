import { defineConfig, devices } from "@playwright/test";

const useBlobReporter = !!process.env.PW_MERGE_BLOB;

// The demo phase runs inside e2e-fast and e2e-full, so it inherits the per-suite
// directories the runner sets (see playwright.config.ts) rather than writing its
// traces into whichever suite happened to run last. Standalone `npm run
// test:demo` keeps the historical names.
const htmlReportDir = process.env.PW_HTML_REPORT
    ? `${process.env.PW_HTML_REPORT}-demo`
    : "playwright-report-demo";
const artifactDir = process.env.PW_OUTPUT_DIR || "test-results";

export default defineConfig({
    testDir: "./demo-tests",
    // Headroom for the drained CI runner. These specs run LAST in the e2e job,
    // after ~45 min of main-suite + worker + Docker load, so the same demo app
    // that renders instantly locally is sluggish here - tight waits lose the
    // race. They pass 15/15 locally (real GPU, retries off), so this is timing
    // on an exhausted runner, not an app bug; give it room rather than mask it.
    timeout: 120000, // was 90s
    // Default expect() budget. Most assertions in demo-mode.spec.ts already pass
    // an explicit 15s; this lifts the bare `toBeVisible()` defaults (5s) to match
    // so they don't flake on the loaded runner. A genuinely-broken element still
    // fails - just after 15s instead of 5s.
    expect: { timeout: 15000 },
    fullyParallel: false,
    outputDir: artifactDir,
    forbidOnly: !!process.env.CI,
    // Retries only re-run failures, so they weaken nothing; 2 covers the
    // timing tail on the drained runner (1 wasn't always enough).
    retries: process.env.CI ? 2 : 0,
    workers: 1,
    // JSON reporter = machine-readable summary for AI agents / scripts (failure
    // messages + trace paths under test-results/). See the e2e-authoring skill.
    reporter: useBlobReporter
        ? [["blob", { outputDir: "blob-report" }]]
        : [
              ["html", { open: "never", outputFolder: htmlReportDir }],
              ["json", { outputFile: `${artifactDir}/demo-results.json` }],
          ],
    use: {
        baseURL:
            process.env.FRONTEND_URL || "http://localhost:3004/demo/",
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
