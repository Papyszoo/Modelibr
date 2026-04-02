#!/usr/bin/env node
/**
 * Cross-platform E2E test runner script.
 * Replaces run-e2e.ps1 to work on Windows, macOS, and Linux.
 */

import { execSync } from "child_process";
import path from "path";
import fs from "fs";
import http from "http";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const COMPOSE_FILE = "docker-compose.e2e.yml";

// Environment variables for test run
const testEnv = {
    ...process.env,
    PW_MERGE_BLOB: "1",
    POSTGRES_USER: "modelibr",
    POSTGRES_PASSWORD: "e2e_password",
    POSTGRES_DB: "Modelibr",
    POSTGRES_HOST: "localhost",
    POSTGRES_PORT: "5433",
    FRONTEND_URL: "http://localhost:3002",
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

function runSilent(command) {
    try {
        return execSync(command, { encoding: "utf-8" }).trim();
    } catch {
        return "";
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

function isE2ERunning() {
    // Check if any containers from the E2E compose are running
    const output = runSilent(`docker compose -f ${COMPOSE_FILE} ps -q`);
    return output.length > 0;
}

function cleanup() {
    console.log("\n🧹 Cleaning up...\n");
    run(`docker compose -f ${COMPOSE_FILE} down -v`);
}

/**
 * Move blob report zips from blob-report/ to blob-all/ after each phase.
 * Each phase clears blob-report/, so blobs must be preserved between phases.
 */
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

    console.log("🚀 Starting E2E test environment...\n");

    // Stop any running containers first
    if (isE2ERunning()) {
        console.log(
            "⚠️  E2E environment is already running. Stopping containers...\n",
        );
        run(`docker compose -f ${COMPOSE_FILE} down -v`);
    }

    // Start containers
    const startResult = run(`docker compose -f ${COMPOSE_FILE} up -d --build`);
    if (startResult !== 0) {
        console.error("❌ Failed to start containers");
        cleanup();
        process.exit(1);
    }

    try {
        await waitForHealth("http://localhost:8090/health", "WebApi");
        await waitForHealth("http://localhost:3003/health", "Asset processor");
        await waitForHealth("http://localhost:3002", "Frontend");
    } catch (error) {
        console.error(`\n❌ ${error.message}`);
        cleanup();
        process.exit(1);
    }

    console.log("\n🧪 Running tests...\n");

    // Clean previous blob reports so merge starts fresh
    const blobDir = path.join(__dirname, "blob-report");
    const blobAllDir = path.join(__dirname, "blob-all");
    fs.rmSync(blobDir, { recursive: true, force: true });
    fs.rmSync(blobAllDir, { recursive: true, force: true });

    // Two-phase execution:
    //   Phase 1: Setup tests with 1 worker (sequential — avoids asset-processor overload)
    //   Phase 2: Chromium tests with multiple workers (parallel — uses auto-provisioning)
    //
    // Worker count rationale:
    //   Two test files are inherently slow (thumbnail generation, SignalR):
    //     - 00-texture-sets/12-mixed-format-thumbnail  (~10min)
    //     - 08-signalr/01-signalr-notifications        (~6min)
    //   With workers=3 locally both slow tests each occupy a dedicated worker
    //   while the third worker handles the 150+ fast tests, bounding total time
    //   to the slowest thumbnail (~10.5min) instead of ~13min with workers=2.
    //   CI uses 3 workers (same as local) — 4 workers caused asset-processor
    //   contention on slower CI hardware, leading to thumbnail generation timeouts.
    const args = process.argv.slice(2).join(" ");
    const setupEnv = { ...testEnv, PW_WORKERS: "1" };
    const chromiumWorkers = process.env.CI ? "3" : "3";
    const chromiumEnv = { ...testEnv, PW_WORKERS: chromiumWorkers };

    console.log("📋 Phase 1: Setup tests (workers=1)\n");
    const bddResult = run("npx bddgen", { env: testEnv });
    if (bddResult !== 0) {
        console.error("❌ bddgen failed");
        cleanup();
        process.exit(1);
    }
    const setupResult = run(`npx playwright test --project=setup ${args}`, {
        env: { ...setupEnv, PW_PHASE: "setup" },
    });
    if (setupResult !== 0) {
        console.error("❌ Setup tests failed");
        cleanup();
        process.exit(1);
    }
    preserveBlobs("setup");

    console.log(`\n📋 Phase 2: Chromium tests (workers=${chromiumWorkers})\n`);
    const testResult = run(
        `npx playwright test --project=chromium --no-deps ${args}`,
        { env: chromiumEnv },
    );
    preserveBlobs("chromium");

    console.log(`\n📋 Phase 3: Serial tests (workers=1)\n`);
    const serialEnv = { ...testEnv, PW_WORKERS: "1" };
    const serialResult = run(
        `npx playwright test --project=serial --no-deps ${args}`,
        { env: serialEnv },
    );
    preserveBlobs("serial");

    console.log(`\n📋 Phase 4: Slow tests (workers=1)\n`);
    const slowEnv = { ...testEnv, PW_WORKERS: "1" };
    const slowResult = run(
        `npx playwright test --project=slow --no-deps ${args}`,
        { env: slowEnv },
    );
    preserveBlobs("slow");

    // Merge blob reports from all phases into a single HTML report
    console.log("\n📊 Merging test reports...\n");
    run("npx playwright merge-reports --reporter html ./blob-all", {
        env: testEnv,
    });

    // Cleanup
    cleanup();

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);

    const exitCode =
        testResult !== 0
            ? testResult
            : serialResult !== 0
              ? serialResult
              : slowResult;

    if (exitCode === 0) {
        console.log(`\n✅ All tests passed in ${duration}s\n`);
    } else {
        console.log(`\n❌ Tests failed after ${duration}s\n`);
    }

    process.exit(exitCode);
}

main().catch((err) => {
    console.error("Error:", err);
    cleanup();
    process.exit(1);
});
