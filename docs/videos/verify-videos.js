// Standalone QA gate for the collected docs feature videos.
//
// `analyze-videos.js` is the gate *inside* a render run - it inspects the clips
// it just produced and writes the analysis report. This script is the gate for
// the set sitting in `docs/static/videos/` right now, long after the render:
// it re-checks the collected artifacts against the manifest and that report, so
// a broken or stale set is caught by the local test runner and before a publish
// rather than on the live site.
//
// Two audiences, two strictness levels:
//
//   node verify-videos.js              local / test-runner: every clip that
//                                      exists must be good; clips that were
//                                      never rendered on this machine are
//                                      reported, not failed.
//   node verify-videos.js --complete   release gate: the full manifest set must
//                                      be present and analysed.
//
// Flags: --complete  --json  --summary=<file>  --clips=<dir>
//
// Duration caps and per-clip issues come from `video-manifest.js` and the
// analysis report - this script adds no rules of its own beyond "the file on
// disk is a real render", so the manifest stays the single source of truth.

import fs from "fs";
import path from "path";

import { videoManifest } from "./video-manifest.js";
import { reportsDir, targetDir } from "./video-paths.js";

// A clip this small is a broken render, not a short one - the smallest real
// clip in a healthy set is comfortably over a megabyte.
const MIN_BYTES = 50 * 1024;
// Guards against a recording that captured only the opening frames.
const MIN_SECONDS = 3;

export const finalReportPath = path.join(reportsDir, "final-video-analysis.json");

function readReport(reportPath) {
    if (!fs.existsSync(reportPath)) {
        return null;
    }

    try {
        const parsed = JSON.parse(fs.readFileSync(reportPath, "utf8"));
        return Array.isArray(parsed) ? parsed : null;
    } catch {
        return null;
    }
}

/**
 * Verifies the collected clips against the manifest and the analysis report.
 *
 * Returns { rows, report, clipsDir, reportPath, counts } where each row is
 * { slug, outputName, status, sizeMb, duration, cap, problems, warnings } and
 * status is "ok" | "failed" | "not-generated".
 */
export function verifyVideos({
    clipsDir = targetDir,
    reportPath = finalReportPath,
    complete = false,
} = {}) {
    const report = readReport(reportPath);
    const byName = new Map((report ?? []).map((entry) => [entry.outputName, entry]));

    const rows = videoManifest.map((spec) => {
        const clipPath = path.join(clipsDir, spec.outputName);
        const problems = [];
        const warnings = [];

        const present = fs.existsSync(clipPath);
        const size = present ? fs.statSync(clipPath).size : 0;

        if (!present) {
            // Nothing to inspect. In --complete mode a gap in the set is fatal;
            // locally it just means this machine never rendered that clip.
            if (complete) {
                problems.push("missing file");
            }

            return {
                slug: spec.slug,
                outputName: spec.outputName,
                status: complete ? "failed" : "not-generated",
                sizeMb: 0,
                duration: null,
                cap: spec.maxDurationSeconds,
                problems,
                warnings,
            };
        }

        if (size < MIN_BYTES) {
            problems.push(`only ${(size / 1024).toFixed(0)} KB - broken render`);
        }

        const analysis = byName.get(spec.outputName);
        if (!analysis) {
            // A partial render (`npm run generate:sprites`) rewrites the report
            // with only that slug, so an older-but-valid clip legitimately falls
            // out of it. Fatal for a publish, a warning for a local run.
            const message = report
                ? "not covered by the latest analysis run"
                : "no analysis report - these clips have not been analysed";
            (complete ? problems : warnings).push(message);
        } else {
            if (Array.isArray(analysis.issues)) {
                problems.push(...analysis.issues);
            }

            const duration = Number(analysis.duration);
            if (!Number.isFinite(duration)) {
                problems.push("no duration recorded");
            } else if (duration > spec.maxDurationSeconds) {
                // Compared against the manifest, not the cap recorded in the
                // report, so a cap lowered since the render still bites.
                problems.push(
                    `${duration}s exceeds the ${spec.maxDurationSeconds}s cap`,
                );
            } else if (duration < MIN_SECONDS) {
                problems.push(`${duration}s - recording stopped early`);
            }
        }

        return {
            slug: spec.slug,
            outputName: spec.outputName,
            status: problems.length === 0 ? "ok" : "failed",
            sizeMb: size / 1024 / 1024,
            duration: analysis ? Number(analysis.duration) : null,
            cap: spec.maxDurationSeconds,
            problems,
            warnings,
        };
    });

    const counts = {
        total: rows.length,
        passed: rows.filter((r) => r.status === "ok").length,
        failed: rows.filter((r) => r.status === "failed").length,
        skipped: rows.filter((r) => r.status === "not-generated").length,
    };

    return { rows, report, clipsDir, reportPath, counts };
}

function parseArgs(argv) {
    const opts = { complete: false, json: false, summary: null, clipsDir: targetDir };
    for (const arg of argv) {
        if (arg === "--complete") opts.complete = true;
        else if (arg === "--json") opts.json = true;
        else if (arg.startsWith("--summary=")) opts.summary = arg.slice(10);
        else if (arg.startsWith("--clips=")) opts.clipsDir = path.resolve(arg.slice(8));
    }
    return opts;
}

function print(result, opts) {
    const { rows, report, clipsDir, reportPath, counts } = result;

    const shownDir = path.relative(process.cwd(), clipsDir);
    console.log(
        `Docs feature videos in ${shownDir.startsWith("..") ? clipsDir : shownDir}`,
    );
    console.log(
        report
            ? `Analysis report: ${fs.statSync(reportPath).mtime.toISOString()}`
            : "Analysis report: none (run `npm run generate` in docs/videos)",
    );
    console.log("");

    const pad = Math.max(...rows.map((r) => r.outputName.length));
    for (const row of rows) {
        const mark = row.status === "ok" ? "✓" : row.status === "failed" ? "✗" : "-";
        const duration =
            row.duration === null
                ? "-".padStart(11)
                : `${row.duration.toFixed(1)}s/${row.cap}s`.padStart(11);
        const size = row.sizeMb > 0 ? `${row.sizeMb.toFixed(1)} MB` : "  -  ";

        console.log(
            `  ${mark} ${row.outputName.padEnd(pad)}  ${duration}  ${size.padStart(8)}` +
                (row.status === "not-generated" ? "  not rendered here" : ""),
        );
        for (const problem of row.problems) console.log(`      ✗ ${problem}`);
        for (const warning of row.warnings) console.log(`      ! ${warning}`);
    }

    console.log("");

    if (counts.failed > 0) {
        console.error(
            `✗ ${counts.failed} of ${counts.total} video(s) failed verification.`,
        );
        console.error(
            "  Re-render with `npm run videos:generate` from the repo root, or fix the\n" +
                "  choreography for a clip that blows its cap (see the video-authoring skill).",
        );
        return;
    }

    const totalMb = rows.reduce((sum, row) => sum + row.sizeMb, 0);
    const skipped = counts.skipped ? `, ${counts.skipped} not rendered here` : "";
    console.log(
        `✓ ${counts.passed} of ${counts.total} video(s) verified ` +
            `(${totalMb.toFixed(1)} MB total${skipped}).`,
    );
    if (opts.complete) return;
    if (counts.skipped === counts.total) {
        console.log("  Nothing to check - run `npm run videos:generate` to render the set.");
    }
}

function main() {
    const opts = parseArgs(process.argv.slice(2));
    const result = verifyVideos({ clipsDir: opts.clipsDir, complete: opts.complete });

    if (opts.summary) {
        fs.mkdirSync(path.dirname(opts.summary), { recursive: true });
        fs.writeFileSync(opts.summary, JSON.stringify(result.counts, null, 2));
    }

    if (opts.json) {
        console.log(JSON.stringify(result.rows, null, 2));
    } else {
        print(result, opts);
    }

    process.exit(result.counts.failed > 0 ? 1 : 0);
}

// Run as a script, but stay importable as a module.
if (import.meta.url === `file://${process.argv[1]}`) {
    main();
}
