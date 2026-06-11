// Drift audit: scan the repo for test signals and flag anything the manifest
// (suites.config.mjs) doesn't track. This is the "keep up with new tests added
// in different places" safety net. Run standalone via `npm run test:audit`;
// also called by the runner to print a warning banner before a run.

import fs from "node:fs";
import path from "node:path";
import { suites } from "./suites.config.mjs";
import { REPO_ROOT, c } from "./util.mjs";

const IGNORE_DIRS = new Set([
    "node_modules",
    ".git",
    ".claude",
    "bin",
    "obj",
    "dist",
    "build",
    "build-input",
    ".cache",
    "storybook-static",
    "playwright-report",
    "test-results",
    "blob-report",
    "blob-all",
    "test-report",
    "data",
    ".features-gen",
]);

function walk(dir, hits) {
    let entries;
    try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
        return hits;
    }
    for (const e of entries) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) {
            if (IGNORE_DIRS.has(e.name)) continue;
            walk(full, hits);
        } else {
            hits.push(path.relative(REPO_ROOT, full));
        }
    }
    return hits;
}

/**
 * Returns { signals, untracked } where each is a list of
 * { type, location, hint }. A signal is "tracked" if a manifest suite plausibly
 * covers it (a dotnet suite covers all *.Tests.csproj; a node suite covers a
 * package.json in its cwd; an e2e suite covers a compose file in its cwd).
 */
export function audit() {
    const files = walk(REPO_ROOT, []);
    const suiteCwds = new Set(suites.map((s) => s.cwd.replace(/\/$/, "")));
    const hasDotnetSuite = suites.some((s) => s.kind === "dotnet");

    const signals = [];

    // 1) .NET test projects
    for (const f of files.filter((f) => f.endsWith(".Tests.csproj"))) {
        signals.push({
            type: ".NET test project",
            location: f,
            tracked: hasDotnetSuite, // run collectively via the .sln
        });
    }

    // 2) package.json with a `test` script
    for (const f of files.filter((f) => path.basename(f) === "package.json")) {
        let pkg;
        try {
            pkg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, f), "utf8"));
        } catch {
            continue;
        }
        if (!pkg.scripts || !pkg.scripts.test) continue;
        const dir = path.dirname(f) === "." ? "." : path.dirname(f);
        signals.push({
            type: "package.json (test script)",
            location: f,
            tracked: suiteCwds.has(dir),
        });
    }

    // 3) e2e docker-compose files
    for (const f of files.filter((f) =>
        /docker-compose.*e2e.*\.ya?ml$/.test(path.basename(f)),
    )) {
        const dir = path.dirname(f);
        signals.push({
            type: "e2e docker-compose",
            location: f,
            tracked: suiteCwds.has(dir),
        });
    }

    const untracked = signals.filter((s) => !s.tracked);
    return { signals, untracked };
}

function main() {
    const { signals, untracked } = audit();

    console.log(c.bold(c.cyan("\n  Test-suite drift audit\n")));
    console.log(c.dim(`  Manifest tracks ${suites.length} suites:\n`));
    for (const s of suites) {
        console.log(`    ${c.green("✓")} ${s.id.padEnd(20)} ${c.dim(s.cwd)}`);
    }

    console.log(c.bold("\n  Test signals found in repo:\n"));
    for (const s of signals) {
        const mark = s.tracked ? c.green("✓ tracked ") : c.yellow("⚠ UNTRACKED");
        console.log(`    ${mark} ${c.dim(s.type.padEnd(28))} ${s.location}`);
    }

    if (untracked.length) {
        console.log(
            c.yellow(
                `\n  ⚠ ${untracked.length} untracked signal(s). Add them to scripts/test-runner/suites.config.mjs.\n`,
            ),
        );
        process.exitCode = 1;
    } else {
        console.log(c.green("\n  ✓ Everything is tracked.\n"));
    }
}

// Run as a script (node discover.mjs) but not when imported.
if (import.meta.url === `file://${process.argv[1]}`) {
    main();
}
