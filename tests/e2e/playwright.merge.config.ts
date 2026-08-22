import { defineConfig } from "@playwright/test";

// Must match playwright.config.ts: the runner points each suite at its own
// report and artifact directory so three e2e suites in one `npm run test:all`
// stop overwriting each other's results.
const htmlReportDir = process.env.PW_HTML_REPORT || "playwright-report";
const artifactDir = process.env.PW_OUTPUT_DIR || "test-results";

export default defineConfig({
    testDir: ".",
    // The full `npm test` run merges per-phase blobs here, so this is where the
    // machine-readable summary for the whole run must be emitted - the per-config
    // json reporters only fire on direct, non-merged runs. JSON carries each
    // failure's message + artifact paths for an agent/script to parse.
    reporter: [
        ["html", { open: "never", outputFolder: htmlReportDir }],
        ["json", { outputFile: `${artifactDir}/results.json` }],
    ],
});
