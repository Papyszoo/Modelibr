import { defineConfig } from "@playwright/test";

export default defineConfig({
    testDir: ".",
    reporter: [["html", { open: "never", outputFolder: "playwright-report" }]],
});
