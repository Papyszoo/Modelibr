import { defineConfig } from "@playwright/test";

export default defineConfig({
    testDir: ".",
    // The full `npm test` run merges per-phase blobs here, so this is where the
    // machine-readable summary for the whole run must be emitted — the per-config
    // json reporters only fire on direct, non-merged runs. JSON carries each
    // failure's message + artifact paths for an agent/script to parse.
    reporter: [
        ["html", { open: "never", outputFolder: "playwright-report" }],
        ["json", { outputFile: "test-results/results.json" }],
    ],
});
