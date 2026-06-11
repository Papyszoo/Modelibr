#!/usr/bin/env node
// Local test mega-runner. Runs as many suites as possible on this machine and
// produces an aggregated, openable HTML report.
//
//   npm run test:all                 interactive picker (default)
//   npm run test:all -- --tier=fast  run a whole tier, no prompt
//   npm run test:all -- --only=backend,frontend
//   npm run test:all -- --all        run everything
//   npm run test:all -- --yes        non-interactive; defaults to the fast tier
//   flags: --no-open  --list  --help
//
// See scripts/test-runner/README.md.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";

import { suites, tierOrder } from "./suites.config.mjs";
import { prepare } from "./parsers.mjs";
import { pickSuites } from "./picker.mjs";
import { audit } from "./discover.mjs";
import { writeReport, openReport } from "./report.mjs";
import {
    REPO_ROOT,
    REPORT_DIR,
    LOGS_DIR,
    WORK_DIR,
    c,
    exists,
    dockerUp,
    runCommand,
    fmtDuration,
} from "./util.mjs";

function parseArgs(argv) {
    const opts = { open: true };
    for (const a of argv) {
        if (a === "--all") opts.all = true;
        else if (a === "--yes" || a === "-y") opts.yes = true;
        else if (a === "--no-open") opts.open = false;
        else if (a === "--list") opts.list = true;
        else if (a === "--help" || a === "-h") opts.help = true;
        else if (a.startsWith("--tier=")) opts.tier = a.slice(7);
        else if (a.startsWith("--only="))
            opts.only = a.slice(7).split(",").map((s) => s.trim()).filter(Boolean);
    }
    return opts;
}

// Stable ordering: by tier (manifest order), then manifest order within a tier.
const ordered = [...suites].sort(
    (a, b) => tierOrder.indexOf(a.tier) - tierOrder.indexOf(b.tier),
);

function printHelp() {
    console.log(`
${c.bold("Modelibr local test runner")}

  npm run test:all                  interactive picker
  npm run test:all -- --tier=fast   run a tier (${tierOrder.join(", ")})
  npm run test:all -- --only=a,b    run specific suite ids
  npm run test:all -- --all         run every suite
  npm run test:all -- --yes         non-interactive (defaults to fast tier)
  npm run test:audit                report untracked test suites

  other flags: --no-open  --list  --help
`);
}

function listSuites() {
    let last = null;
    for (const s of ordered) {
        if (s.tier !== last) {
            console.log(c.dim(`\n${s.tier.toUpperCase()}`));
            last = s.tier;
        }
        const d = s.requiresDocker ? c.gray(" (docker)") : "";
        console.log(`  ${s.id.padEnd(20)} ${s.name}${d}`);
    }
    console.log("");
}

function currentBranch() {
    try {
        return execSync("git rev-parse --abbrev-ref HEAD", {
            cwd: REPO_ROOT,
            stdio: ["ignore", "pipe", "ignore"],
        })
            .toString()
            .trim();
    } catch {
        return "unknown";
    }
}

async function selectSuites(opts) {
    if (opts.only) {
        const byId = new Map(ordered.map((s) => [s.id, s]));
        const chosen = opts.only.map((id) => byId.get(id)).filter(Boolean);
        const unknown = opts.only.filter((id) => !byId.has(id));
        if (unknown.length)
            console.log(c.yellow(`  ignoring unknown suite id(s): ${unknown.join(", ")}`));
        return chosen;
    }
    if (opts.tier) return ordered.filter((s) => s.tier === opts.tier);
    if (opts.all) return ordered;
    // Non-interactive (CI / piped) without a filter: default to the fast tier.
    if (opts.yes || !process.stdin.isTTY)
        return ordered.filter((s) => s.tier === "fast");
    // Interactive picker, fast tier pre-checked.
    const pre = new Set(ordered.filter((s) => s.tier === "fast").map((s) => s.id));
    return pickSuites(ordered, pre);
}

async function runSuite(suite) {
    const started = Date.now();
    const base = {
        id: suite.id,
        name: suite.name,
        tier: suite.tier,
        requiresDocker: suite.requiresDocker,
        note: suite.note || null,
        reportLink: null,
        counts: null,
        durationMs: null,
        logFile: null,
    };

    if (!exists(suite.detectPath)) {
        console.log(c.gray(`\n— ${suite.name}: not present on this branch, skipping`));
        return { ...base, status: "not-present" };
    }
    if (suite.requiresDocker && !dockerUp()) {
        console.log(
            c.yellow(`\n— ${suite.name}: Docker not running, skipping`),
        );
        return { ...base, status: "skipped", note: "Docker unavailable" };
    }

    const workDir = path.join(WORK_DIR, suite.id);
    const logFile = path.join(LOGS_DIR, `${suite.id}.log`);
    const { command, parse } = prepare(suite, workDir);

    console.log(c.bold(c.cyan(`\n▶ ${suite.name}`)));
    console.log(c.dim(`  ${command}\n`));

    const result = await runCommand(command, {
        cwd: path.join(REPO_ROOT, suite.cwd),
        logFile,
        extraEnv: { CI: "true", FORCE_COLOR: "1" },
    });

    let counts = null;
    try {
        counts = parse(result);
    } catch {
        counts = null;
    }

    const durationMs = Date.now() - started;
    const status = result.exitCode === 0 ? "passed" : "failed";
    let reportLink = null;
    if (suite.reportPath && exists(`${suite.reportPath}/index.html`))
        reportLink = suite.reportPath;

    console.log(
        (status === "passed" ? c.green("  ✓ passed") : c.red("  ✗ failed")) +
            c.dim(` in ${fmtDuration(durationMs)}`),
    );

    return {
        ...base,
        status,
        counts,
        durationMs,
        logFile: path.relative(REPORT_DIR, logFile),
        reportLink,
    };
}

async function main() {
    const opts = parseArgs(process.argv.slice(2));
    if (opts.help) return printHelp();
    if (opts.list) return listSuites();

    // Drift audit banner — surfaces suites added elsewhere but not tracked.
    const { untracked } = audit();
    if (untracked.length) {
        console.log(
            c.yellow(
                `\n⚠ ${untracked.length} untracked test signal(s) — run "npm run test:audit" to see them.`,
            ),
        );
    }

    const selected = await selectSuites(opts);
    if (selected === null) {
        console.log(c.dim("\nCancelled.\n"));
        return;
    }
    if (!selected.length) {
        console.log(c.yellow("\nNo suites selected.\n"));
        return;
    }

    // Fresh report tree each run (suite reports live elsewhere, untouched) — but
    // preserve history.jsonl, which accumulates timing across runs.
    for (const sub of ["logs", ".work", "index.html", "summary.json"]) {
        fs.rmSync(path.join(REPORT_DIR, sub), { recursive: true, force: true });
    }
    fs.mkdirSync(LOGS_DIR, { recursive: true });

    const startedAt = Date.now();
    console.log(
        c.bold(`\nRunning ${selected.length} suite(s): `) +
            selected.map((s) => s.id).join(", "),
    );

    const results = [];
    for (const suite of selected) {
        results.push(await runSuite(suite));
    }

    const durationMs = Date.now() - startedAt;
    const meta = {
        host: os.hostname(),
        platform: `${os.platform()} ${os.arch()}`,
        node: process.version,
        branch: currentBranch(),
        startedAt: new Date(startedAt).toISOString(),
        finishedAt: new Date().toLocaleString(),
        durationMs,
    };

    // Terminal summary
    console.log(c.bold("\n──────── Summary ────────"));
    for (const r of results) {
        const tag =
            r.status === "passed"
                ? c.green("PASS")
                : r.status === "failed" || r.status === "error"
                  ? c.red("FAIL")
                  : c.gray(r.status.toUpperCase());
        const cnt = r.counts ? c.dim(` (${r.counts.passed}/${r.counts.total})`) : "";
        console.log(`  ${tag}  ${r.name}${cnt}`);
    }

    const htmlPath = writeReport(results, meta);
    console.log(c.bold(`\nReport: ${htmlPath}`));
    if (opts.open) openReport(htmlPath);

    // Append a per-run history line (the "my machine" timing source consumed by
    // the Test Studio catalog / sparklines).
    try {
        fs.appendFileSync(
            path.join(REPORT_DIR, "history.jsonl"),
            JSON.stringify({
                timestamp: meta.startedAt,
                branch: meta.branch,
                source: "runner",
                suites: results.map((r) => ({
                    id: r.id,
                    status: r.status,
                    durationMs: r.durationMs,
                    counts: r.counts,
                })),
            }) + "\n",
        );
    } catch {
        // non-fatal
    }

    const failed = results.some((r) => r.status === "failed" || r.status === "error");
    process.exit(failed ? 1 : 0);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
