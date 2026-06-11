// Per-machine timing history, read from test-report/history.jsonl (one JSON line
// per run, appended by the runner and the control server). Aggregated per suite.

import fs from "node:fs";
import { HISTORY_FILE } from "../util.mjs";

export function readHistory() {
    if (!fs.existsSync(HISTORY_FILE)) return [];
    return fs
        .readFileSync(HISTORY_FILE, "utf8")
        .split(/\r?\n/)
        .filter(Boolean)
        .map((l) => {
            try {
                return JSON.parse(l);
            } catch {
                return null;
            }
        })
        .filter(Boolean);
}

function stats(durations) {
    if (!durations.length) return null;
    const sorted = [...durations].sort((a, b) => a - b);
    const sum = sorted.reduce((a, b) => a + b, 0);
    return {
        runs: sorted.length,
        last: durations[durations.length - 1],
        avg: Math.round(sum / sorted.length),
        min: sorted[0],
        max: sorted[sorted.length - 1],
        recent: durations.slice(-20),
    };
}

export function collectLocalHistory() {
    const runs = readHistory();
    const bySuite = {};
    for (const run of runs) {
        for (const r of run.suites || []) {
            if (r.durationMs == null || r.status === "not-present" || r.status === "skipped")
                continue;
            (bySuite[r.id] ||= { durations: [], lastStatus: null }).durations.push(
                r.durationMs,
            );
            bySuite[r.id].lastStatus = r.status;
        }
    }
    const out = {};
    for (const [id, v] of Object.entries(bySuite))
        out[id] = { ...stats(v.durations), lastStatus: v.lastStatus };
    return { runCount: runs.length, bySuite: out };
}
