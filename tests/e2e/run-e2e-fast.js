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
  // Defaults target the Docker e2e stack; override via env to run against a
  // different deployment (e.g. an installed native build on its own ports).
  POSTGRES_USER: process.env.POSTGRES_USER || "modelibr",
  POSTGRES_PASSWORD: process.env.POSTGRES_PASSWORD || "e2e_password",
  POSTGRES_DB: process.env.POSTGRES_DB || "Modelibr",
  POSTGRES_HOST: process.env.POSTGRES_HOST || "localhost",
  POSTGRES_PORT: process.env.POSTGRES_PORT || "5433",
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
    await waitForHealth(
      process.env.WEBAPI_HEALTH_URL || "http://localhost:8090/health",
      "WebApi",
    );
    // Native installs don't expose a separate asset-processor health port
    // (workers are health-gated internally before the app serves), so allow
    // skipping this check by setting ASSET_HEALTH_URL to an empty string.
    const assetHealthUrl =
      process.env.ASSET_HEALTH_URL ?? "http://localhost:3003/health";
    if (assetHealthUrl) {
      await waitForHealth(assetHealthUrl, "Asset processor");
    }
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

  const chromiumWorkers = process.env.PW_WORKERS || "3";
  console.log(`\n📋 Phase 2: Chromium tests (workers=${chromiumWorkers})\n`);
  const chromiumResult = run(
    `npx playwright test --project=chromium --no-deps ${args}`,
    { env: { ...testEnv, PW_WORKERS: chromiumWorkers } },
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
    slowResult = run(`npx playwright test --project=slow --no-deps ${args}`, {
      env: { ...testEnv, PW_WORKERS: "1" },
    });
    preserveBlobs("slow");
  }

  // The demo phase builds a standalone "demo mode" frontend and tests it in
  // Playwright's own browser — it does not exercise the deployment under test,
  // so it's skippable when running against an installed native build (it's
  // still covered by the Docker e2e CI).
  let demoResult = 0;
  if (process.env.SKIP_DEMO_PHASE === "1") {
    console.log("\n📋 Demo tests: skipped (SKIP_DEMO_PHASE=1)\n");
  } else {
    console.log(`\n📋 Phase ${fastOnly ? 3 : 5}: Demo tests (workers=1)\n`);
    demoResult = run(`node run-demo-e2e.js ${args}`, {
      env: testEnv,
    });
    preserveBlobs("demo");
  }

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

  printReportHint(__dirname);

  process.exit(exitCode);
}

function printReportHint(e2eDir) {
  if (!fs.existsSync(path.join(e2eDir, "playwright-report"))) return;
  console.log("📊 HTML report is ready. Open with:");
  console.log("   cd tests/e2e && npx playwright show-report\n");
}

main().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
