// Per-kind command building + result parsing. Each parser normalizes to
// { total, passed, failed, skipped } or null when counts can't be determined
// (in which case the runner falls back to the process exit code for status).

import fs from "node:fs";
import path from "node:path";

/**
 * Returns { command, parse } for a suite. `command` is what to actually run
 * (canonical command + any reporter flags); `parse(result)` reads the produced
 * artifacts (result = { exitCode, output }).
 */
export function prepare(suite, workDir) {
    fs.mkdirSync(workDir, { recursive: true });

    switch (suite.kind) {
        case "dotnet": {
            const trxDir = path.join(workDir, "trx");
            const command = `${suite.command} --logger trx --results-directory "${trxDir}"`;
            return { command, parse: () => parseTrx(trxDir) };
        }
        case "jest": {
            const out = path.join(workDir, "jest.json");
            // `npm test -- <args>` forwards args to the jest script.
            const command = `${suite.command} -- --json --outputFile="${out}" --ci`;
            return { command, parse: () => parseJestLike(out) };
        }
        case "vitest": {
            const out = path.join(workDir, "vitest.json");
            // Keep the default reporter for live output; json reporter writes the
            // machine-readable file (dotted --outputFile.json avoids ambiguity).
            const command = `${suite.command} -- --reporter=default --reporter=json --outputFile.json="${out}"`;
            return { command, parse: () => parseJestLike(out) };
        }
        case "node-test": {
            // `npm test -- --test-reporter=tap` puts the flag after the test-dir
            // positional and node treats it as a test path; NODE_OPTIONS reaches
            // the node --test process regardless of argument order.
            const command = `NODE_OPTIONS="--test-reporter=tap" ${suite.command}`;
            return { command, parse: (result) => parseTap(result.output) };
        }
        case "checks": {
            // Lint/format/build gates - pass or fail, nothing to count.
            return { command: suite.command, parse: () => null };
        }
        case "video-pipeline": {
            const out = path.join(workDir, "videos.json");
            // Flags land on the trailing verify step. After a full re-render the
            // strict rule applies - every manifest clip must be present and
            // analysed - and the gate writes its per-clip counts out rather than
            // making us scrape its console table.
            const command = `${suite.command} -- --complete --summary="${out}"`;
            return { command, parse: () => parseCounts(out) };
        }
        case "playwright":
        default: {
            // Counts aren't reliably machine-readable across the merged-report
            // flow; status comes from the exit code and the HTML report is linked.
            return { command: suite.command, parse: () => null };
        }
    }
}

export function parseTrx(dir) {
    if (!fs.existsSync(dir)) return null;
    let total = 0;
    let passed = 0;
    let failed = 0;
    let skipped = 0;
    let found = false;
    for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".trx"))) {
        const xml = fs.readFileSync(path.join(dir, file), "utf8");
        const m = xml.match(/<Counters\b[^>]*\/>/);
        if (!m) continue;
        found = true;
        const get = (attr) => {
            const r = m[0].match(new RegExp(`${attr}="(\\d+)"`));
            return r ? parseInt(r[1], 10) : 0;
        };
        total += get("total");
        passed += get("passed");
        failed += get("failed");
        // "not executed" counts as skipped for our summary purposes.
        skipped += get("notExecuted");
    }
    return found ? { total, passed, failed, skipped } : null;
}

export function parseJestLike(file) {
    if (!fs.existsSync(file)) return null;
    try {
        const j = JSON.parse(fs.readFileSync(file, "utf8"));
        return {
            total: j.numTotalTests ?? 0,
            passed: j.numPassedTests ?? 0,
            failed: j.numFailedTests ?? 0,
            skipped: (j.numPendingTests ?? 0) + (j.numTodoTests ?? 0),
        };
    } catch {
        return null;
    }
}

/** Reads an already-normalized { total, passed, failed, skipped } file. */
export function parseCounts(file) {
    if (!fs.existsSync(file)) return null;
    try {
        const c = JSON.parse(fs.readFileSync(file, "utf8"));
        return {
            total: c.total ?? 0,
            passed: c.passed ?? 0,
            failed: c.failed ?? 0,
            skipped: c.skipped ?? 0,
        };
    } catch {
        return null;
    }
}

export function parseTap(output) {
    const num = (re) => {
        const m = output.match(re);
        return m ? parseInt(m[1], 10) : 0;
    };
    const tests = num(/^# tests (\d+)/m);
    const pass = num(/^# pass (\d+)/m);
    const fail = num(/^# fail (\d+)/m);
    const skip = num(/^# skipped (\d+)/m);
    if (!tests && !pass && !fail) return null;
    return { total: tests || pass + fail, passed: pass, failed: fail, skipped: skip };
}
