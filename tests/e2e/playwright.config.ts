import { defineConfig, devices } from "@playwright/test";
import { defineBddConfig } from "playwright-bdd";

const testDir = defineBddConfig({
    features: ["features/*.feature", "features/**/*.feature"],
    steps: "steps/*.ts",
});

export default defineConfig({
    testDir,
    timeout: 90000, // 90s to allow for thumbnail generation (Puppeteer cold start + rendering takes 30-40s)
    fullyParallel: false,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    workers: 1, // Must be 1 for shared state to work across scenarios
    reporter: [["html", { open: "never" }]],
    use: {
        baseURL: process.env.FRONTEND_URL || "http://localhost:3002",
        trace: "on-first-retry",
        screenshot: "on",
        video: "retain-on-failure"
    },
    projects: [
        {
            name: "chromium",
            use: { ...devices["Desktop Chrome"] },
        },
    ],
});
