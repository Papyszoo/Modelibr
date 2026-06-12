// Turn a validated run-spec into a concrete command + env, built entirely from the
// manifest (never from raw client input). User-supplied strings (grep, name
// filter) are passed as environment variables and referenced quoted in the
// command ("$RUN_GREP"), so they can't inject shell.
//
// spec = {
//   suiteId,                       // required, must be in the manifest
//   grep?,                         // e2e only: tag/name to target
//   params?: {
//     video, trace, screenshot,    // e2e: off | on | retain-on-failure
//     workers, retries,            // numbers
//     headed,                      // bool (e2e)
//     coverage,                    // bool (jest/vitest)
//     nameFilter,                  // unit: filter by test name
//   }
// }

import fs from "node:fs";
import path from "node:path";
import { suites } from "../test-runner/suites.config.mjs";
import { REPO_ROOT, REPORT_DIR } from "../test-runner/util.mjs";
import { parseTrx, parseJestLike, parseTap } from "../test-runner/parsers.mjs";

// Virtual suite: run EVERYTHING through the local mega-runner. Not part of the
// manifest (the runner would recurse on itself); only the Studio offers it.
// The runner handles Docker-down skips, per-suite logs, summary.json and the
// aggregated HTML report itself.
export const EVERYTHING = {
    id: "everything",
    name: "Everything — all suites via the local runner",
    kind: "runner",
    cwd: ".",
    command: "node scripts/test-runner/index.mjs --all --yes --no-open",
    tier: "all",
    requiresDocker: false, // the runner skips Docker suites itself when the daemon is down
    detectPath: "scripts/test-runner/index.mjs",
    reportPath: "test-report",
};

const VIDEO = new Set(["off", "on", "retain-on-failure"]);
const TRACE = new Set(["off", "on", "on-first-retry", "retain-on-failure"]);
const SShot = new Set(["off", "on", "only-on-failure"]);
const clampInt = (v, lo, hi, dflt) => {
    const n = parseInt(v, 10);
    return Number.isInteger(n) ? Math.min(hi, Math.max(lo, n)) : dflt;
};

export function getSuite(suiteId) {
    if (suiteId === "everything") return EVERYTHING;
    return suites.find((s) => s.id === suiteId) || null;
}

export function buildRunSpec(spec) {
    const suite = getSuite(spec.suiteId);
    if (!suite) throw new Error(`unknown suite: ${spec.suiteId}`);

    const p = spec.params || {};
    const workDir = path.join(REPORT_DIR, ".work", suite.id);
    const cwd = path.join(REPO_ROOT, suite.cwd);
    const env = { CI: "true", FORCE_COLOR: "1" };

    let command;
    let parse = () => null;
    const summary = []; // human-readable param chips for the report/history

    if (suite.kind === "runner") {
        // The mega-runner orchestrates everything itself; aggregate its
        // summary.json into a single counts object for the console tally.
        command = suite.command;
        const builtAt = Date.now();
        parse = () => {
            try {
                const summaryFile = path.join(REPORT_DIR, "summary.json");
                // A runner crash before writing summary.json must not attach the
                // PREVIOUS run's counts to this run — only trust a fresh file.
                if (fs.statSync(summaryFile).mtimeMs < builtAt) return null;
                const j = JSON.parse(fs.readFileSync(summaryFile, "utf8"));
                const agg = { total: 0, passed: 0, failed: 0, skipped: 0 };
                for (const r of j.results || []) {
                    if (r.counts) {
                        agg.total += r.counts.total;
                        agg.passed += r.counts.passed;
                        agg.failed += r.counts.failed;
                        agg.skipped += r.counts.skipped;
                    } else if (r.status === "passed") { agg.total += 1; agg.passed += 1; }
                    else if (r.status === "failed" || r.status === "error") { agg.total += 1; agg.failed += 1; }
                }
                return agg.total ? agg : null;
            } catch {
                return null;
            }
        };
    } else if (suite.kind === "dotnet") {
        const trxDir = path.join(workDir, "trx");
        const baseFilter = suite.id === "backend-integration"
            ? "Category=Integration"
            : "Category!=Integration";
        let filter = baseFilter;
        if (p.nameFilter) {
            env.RUN_NAME = String(p.nameFilter);
            filter = `${baseFilter}&FullyQualifiedName~$RUN_NAME`;
            summary.push(`name~${p.nameFilter}`);
        }
        command = `dotnet test Modelibr.sln --filter "${filter}" --logger trx --results-directory "${trxDir}"`;
        // Studio runs must be self-contained too: bring the dev Postgres up
        // (healthcheck-gated) before integration tests; it stays running after.
        if (suite.id === "backend-integration")
            command = `docker compose up -d --wait postgres && ${command}`;
        parse = () => parseTrx(trxDir);
    } else if (suite.kind === "jest") {
        const out = path.join(workDir, "jest.json");
        let cmd = `${suite.command} -- --json --outputFile="${out}" --ci`;
        if (p.coverage) { cmd += " --coverage"; summary.push("coverage"); }
        if (p.nameFilter) { env.RUN_NAME = String(p.nameFilter); cmd += ' -t "$RUN_NAME"'; summary.push(`name~${p.nameFilter}`); }
        command = cmd;
        parse = () => parseJestLike(out);
    } else if (suite.kind === "vitest") {
        const out = path.join(workDir, "vitest.json");
        let cmd = `${suite.command} -- --reporter=default --reporter=json --outputFile.json="${out}"`;
        if (p.coverage) { cmd += " --coverage"; summary.push("coverage"); }
        if (p.nameFilter) { env.RUN_NAME = String(p.nameFilter); cmd += ' -t "$RUN_NAME"'; summary.push(`name~${p.nameFilter}`); }
        command = cmd;
        parse = () => parseJestLike(out);
    } else if (suite.kind === "node-test") {
        let cmd = `${suite.command} -- --test-reporter=tap`;
        if (p.nameFilter) { env.RUN_NAME = String(p.nameFilter); cmd += ' --test-name-pattern "$RUN_NAME"'; summary.push(`name~${p.nameFilter}`); }
        command = cmd;
        parse = (result) => parseTap(result.output);
    } else {
        // playwright (e2e suites). Params flow via env into playwright.config.ts.
        if (p.video && VIDEO.has(p.video)) { env.PW_VIDEO = p.video; summary.push(`video:${p.video}`); }
        if (p.trace && TRACE.has(p.trace)) { env.PW_TRACE = p.trace; summary.push(`trace:${p.trace}`); }
        if (p.screenshot && SShot.has(p.screenshot)) { env.PW_SCREENSHOT = p.screenshot; }
        if (p.headed) { env.PW_HEADED = "1"; summary.push("headed"); }
        if (p.workers != null) env.PW_WORKERS = String(clampInt(p.workers, 1, 8, 3));
        if (p.retries != null) env.PW_RETRIES = String(clampInt(p.retries, 0, 5, 0));

        if (spec.grep) {
            // Targeted run: bring the stack up, seed via the setup project, then run
            // only the matching scenarios, then tear down. Mirrors run-e2e-fast.
            env.RUN_GREP = String(spec.grep);
            summary.push(`grep:${spec.grep}`);
            command =
                'npm run test:setup && { npx bddgen && PW_WORKERS=1 npx playwright test --project=setup && ' +
                'npx playwright test --grep "$RUN_GREP" --no-deps; ec=$?; }; npm run test:teardown; exit ${ec:-1}';
        } else {
            command = suite.command; // whole-suite run via the manifest command
        }
        parse = () => null; // status from exit code; report links to playwright HTML
    }

    return {
        suite,
        command,
        cwd,
        env,
        parse,
        workDir,
        requiresDocker: !!suite.requiresDocker,
        reportPath: suite.reportPath || null,
        summary,
    };
}
