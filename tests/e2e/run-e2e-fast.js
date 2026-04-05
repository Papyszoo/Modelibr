#!/usr/bin/env node

import { execSync } from "child_process";
import fs from "fs";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const testEnv = {
    ...process.env,
    PW_MERGE_BLOB: "1",
    POSTGRES_USER: "modelibr",
    POSTGRES_PASSWORD: "e2e_password",
    POSTGRES_DB: "Modelibr",
    POSTGRES_HOST: "localhost",
    POSTGRES_PORT: "5433",
    FRONTEND_URL: process.env.FRONTEND_URL || "http://localhost:3002",
};

function run(command, options = {}) {
    console.log(`\n> ${command}\n`);
    try {
        execSync(command, { stdio: "inherit", ...options });
        return 0;
    } catch (error) {
        return error.status || 1;
    }
}

function httpGet(url) {
    return new Promise((resolve, reject) => {
        const request = http.get(url, (res) => {
            res.resume();
            resolve(res.statusCode || 0);
        });

        request.on("error", reject);
        request.setTimeout(5000, () => {
            request.destroy(new Error("Request timed out"));
        });
    });
}

async function waitForHealth(url, label, timeoutMs = 120000) {
    const start = Date.now();
    const pollInterval = 2000;
    process.stdout.write(`⏳ Waiting for ${label} at ${url}...`);

    while (Date.now() - start < timeoutMs) {
        try {
            const status = await httpGet(url);
            if (status >= 200 && status < 300) {
                process.stdout.write(" ready\n");
                return;
            }
        } catch {
            // Ignore and retry
        }

        process.stdout.write(".");
        await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }

    process.stdout.write("\n");
    throw new Error(`Timed out waiting for ${label} at ${url}`);
}

function preserveBlobs(phase) {
    const blobDir = path.join(__dirname, "blob-report");
    const blobAllDir = path.join(__dirname, "blob-all");
    if (!fs.existsSync(blobDir)) return;
    fs.mkdirSync(blobAllDir, { recursive: true });
    for (const file of fs.readdirSync(blobDir)) {
        if (file.endsWith(".zip")) {
            fs.renameSync(
                path.join(blobDir, file),
                path.join(blobAllDir, `${phase}-${file}`),
            );
        }
    }
}

async function main() {
    const startTime = Date.now();
    const cliArgs = process.argv.slice(2);
    const fastOnly = cliArgs.includes("--fast-only");
    const forwardedArgs = cliArgs.filter((arg) => arg !== "--fast-only");
    const args = forwardedArgs.join(" ");

    try {
        await waitForHealth("http://localhost:8090/health", "WebApi");
        await waitForHealth("http://localhost:3003/health", "Asset processor");
        await waitForHealth(testEnv.FRONTEND_URL, "Frontend");
    } catch (error) {
        console.error(`\n❌ ${error.message}`);
        process.exit(1);
    }

    const blobDir = path.join(__dirname, "blob-report");
    const blobAllDir = path.join(__dirname, "blob-all");
    fs.rmSync(blobDir, { recursive: true, force: true });
    fs.rmSync(blobAllDir, { recursive: true, force: true });

    console.log(
        `\n🧪 Running ${fastOnly ? "fast" : "reuse-stack"} E2E phases...\n`,
    );

    const bddResult = run("npx bddgen", { env: testEnv });
    if (bddResult !== 0) {
        console.error("❌ bddgen failed");
        process.exit(1);
    }

    console.log("📋 Phase 1: Setup tests (workers=1)\n");
    const setupResult = run(`npx playwright test --project=setup ${args}`, {
        env: { ...testEnv, PW_PHASE: "setup", PW_WORKERS: "1" },
    });
    if (setupResult !== 0) {
        console.error("❌ Setup tests failed");
        process.exit(1);
    }
    preserveBlobs("setup");

    console.log("\n📋 Phase 2: Chromium tests (workers=3)\n");
    const chromiumResult = run(
        `npx playwright test --project=chromium --no-deps ${args}`,
        { env: { ...testEnv, PW_WORKERS: process.env.PW_WORKERS || "3" } },
    );
    preserveBlobs("chromium");

    let serialResult = 0;
    let slowResult = 0;

    if (!fastOnly) {
        console.log("\n📋 Phase 3: Serial tests (workers=1)\n");
        serialResult = run(
            `npx playwright test --project=serial --no-deps ${args}`,
            { env: { ...testEnv, PW_WORKERS: "1" } },
        );
        preserveBlobs("serial");

        console.log("\n📋 Phase 4: Slow tests (workers=1)\n");
        slowResult = run(
            `npx playwright test --project=slow --no-deps ${args}`,
            { env: { ...testEnv, PW_WORKERS: "1" } },
        );
        preserveBlobs("slow");
    }

    console.log(`\n📋 Phase ${fastOnly ? 3 : 5}: Demo tests (workers=1)\n`);
    const demoResult = run(`node run-demo-e2e.js ${args}`, {
        env: testEnv,
    });
    preserveBlobs("demo");

    console.log("\n📊 Merging test reports...\n");
    const mergeResult = run(
        "npx playwright merge-reports -c playwright.merge.config.ts ./blob-all",
        {
            env: testEnv,
        },
    );

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    const exitCode =
        chromiumResult !== 0
            ? chromiumResult
            : serialResult !== 0
              ? serialResult
              : slowResult !== 0
                ? slowResult
                : demoResult !== 0
                  ? demoResult
                  : mergeResult;

    if (exitCode === 0) {
        console.log(
            `\n✅ ${fastOnly ? "Fast" : "Reuse-stack"} E2E tests passed in ${duration}s\n`,
        );
    } else {
        console.log(
            `\n❌ ${fastOnly ? "Fast" : "Reuse-stack"} E2E tests failed after ${duration}s\n`,
        );
    }

    process.exit(exitCode);
}

main().catch((error) => {
    console.error("Error:", error);
    process.exit(1);
});
