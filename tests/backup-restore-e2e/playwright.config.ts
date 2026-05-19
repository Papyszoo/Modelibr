import { defineConfig, devices } from "@playwright/test";

const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3102";

export default defineConfig({
    testDir: "./specs",
    timeout: 180000, // 3 min — restore round-trip restarts the webapi container
    fullyParallel: false, // Stack is shared; tests must run sequentially.
    workers: 1,
    retries: 0,
    forbidOnly: !!process.env.CI,
    reporter: [["list"], ["html", { open: "never" }]],
    use: {
        baseURL: FRONTEND_URL,
        trace: "on-first-retry",
        screenshot: "only-on-failure",
        video: "retain-on-failure",
        ignoreHTTPSErrors: true,
    },
    projects: [
        {
            name: "backup-restore",
            use: { ...devices["Desktop Chrome"] },
        },
    ],
});
