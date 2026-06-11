// GitHub Actions timing history via the `gh` CLI. For each tracked workflow we
// pull the last N runs and their jobs, then aggregate per job display-name:
// durations (completed_at - started_at), conclusions, last/avg/min/max + trend.
//
// Cached to test-catalog/github-history.json; refetched only when stale or forced.
// Degrades gracefully when gh is missing/unauthenticated (returns empty + note).

import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { GH_CACHE_FILE } from "../util.mjs";
import { trackedWorkflows } from "../ci-map.mjs";

const REPO = "Papyszoo/Modelibr";
const RUNS_PER_WORKFLOW = 8;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6h

function gh(args) {
    return execFileSync("gh", args, {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
        maxBuffer: 32 * 1024 * 1024,
    });
}

function durationSec(job) {
    if (!job.started_at || !job.completed_at) return null;
    const d = (new Date(job.completed_at) - new Date(job.started_at)) / 1000;
    return d >= 0 ? Math.round(d) : null;
}

function aggregate(samples) {
    // samples: [{ durationSec, conclusion, branch, createdAt }]
    const durs = samples.map((s) => s.durationSec).filter((d) => d != null);
    if (!durs.length) return { runs: samples.length, durations: [] };
    const sum = durs.reduce((a, b) => a + b, 0);
    return {
        runs: samples.length,
        last: durs[0],
        avgSec: Math.round(sum / durs.length),
        minSec: Math.min(...durs),
        maxSec: Math.max(...durs),
        recent: samples.slice(0, 15).map((s) => ({
            sec: s.durationSec,
            conclusion: s.conclusion,
            branch: s.branch,
            at: s.createdAt,
        })),
    };
}

export function collectGithubHistory({ force = false, cacheOnly = false } = {}) {
    if (!force && fs.existsSync(GH_CACHE_FILE)) {
        try {
            const cached = JSON.parse(fs.readFileSync(GH_CACHE_FILE, "utf8"));
            // cacheOnly: serve whatever we have regardless of age — used by the
            // server's lazy rebuilds so a page load never blocks ~30s on a gh
            // refetch. Explicit refreshes (↻ button, CLI build) respect the TTL.
            if (cacheOnly || Date.now() - new Date(cached.fetchedAt).getTime() < CACHE_TTL_MS)
                return cached;
        } catch {
            /* refetch */
        }
    }
    if (cacheOnly) {
        return { fetchedAt: null, available: false, note: "no cached GitHub data — use ↻ to fetch", jobs: {} };
    }

    const byJob = {};
    let available = true;
    let note = null;

    try {
        gh(["auth", "status"]);
    } catch {
        available = false;
        note = "gh not authenticated — GitHub history unavailable";
    }

    if (available) {
        for (const wf of trackedWorkflows) {
            let runs = [];
            try {
                runs = JSON.parse(
                    gh([
                        "run",
                        "list",
                        "--workflow",
                        wf,
                        "--limit",
                        String(RUNS_PER_WORKFLOW),
                        "--json",
                        "databaseId,headBranch,conclusion,createdAt",
                    ]),
                );
            } catch {
                continue;
            }
            for (const run of runs) {
                let jobsResp;
                try {
                    jobsResp = JSON.parse(
                        gh(["api", `repos/${REPO}/actions/runs/${run.databaseId}/jobs`]),
                    );
                } catch {
                    continue;
                }
                for (const job of jobsResp.jobs || []) {
                    const key = `${wf}::${job.name}`;
                    (byJob[key] ||= []).push({
                        durationSec: durationSec(job),
                        conclusion: job.conclusion,
                        branch: run.headBranch,
                        createdAt: run.createdAt,
                    });
                }
            }
        }
    }

    const jobs = {};
    for (const [key, samples] of Object.entries(byJob)) jobs[key] = aggregate(samples);

    const result = { fetchedAt: new Date().toISOString(), available, note, jobs };
    try {
        fs.mkdirSync(GH_CACHE_FILE.replace(/\/[^/]+$/, ""), { recursive: true });
        fs.writeFileSync(GH_CACHE_FILE, JSON.stringify(result, null, 2));
    } catch {
        /* non-fatal */
    }
    return result;
}
