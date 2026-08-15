// Uploads the collected feature videos to the docs asset host.
//
// Videos render on a GPU machine and are never committed. No workflow renders
// or bundles them: the copies this script uploads are the ones the live site
// serves at /videos/, and the docs publish deliberately leaves that directory
// alone. This script is the only step that talks to the host, and it learns the
// destination from the environment - the target is deliberately NOT in this
// repo, which is public.
//
//   DOCS_VIDEO_PUBLISH_TARGET   required, rsync destination (user@host:/path)
//   DOCS_VIDEO_PUBLISH_KEY      optional, path to the SSH identity to use
//   DOCS_VIDEO_PUBLIC_BASE      optional, public URL base to verify after upload
//
// Flags: --dry-run (rsync dry run), --force (publish despite analysis issues).

import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";

import { videoManifest } from "./video-manifest.js";
import { targetDir, getReportPath } from "./video-paths.js";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const force = args.includes("--force");

function fail(message, hint) {
    console.error(`\n✗ ${message}`);
    if (hint) {
        console.error(`  ${hint}`);
    }
    process.exit(1);
}

// --- destination -----------------------------------------------------------

const publishTarget = (process.env.DOCS_VIDEO_PUBLISH_TARGET || "").trim();
if (!publishTarget) {
    fail(
        "DOCS_VIDEO_PUBLISH_TARGET is not set.",
        "Set it in your local environment (never in this repo) to an rsync\n" +
            "  destination such as user@host:/path/to/videos, then re-run.",
    );
}

const identity = (process.env.DOCS_VIDEO_PUBLISH_KEY || "").trim();
if (identity && !fs.existsSync(identity)) {
    fail(`DOCS_VIDEO_PUBLISH_KEY points at a missing file: ${identity}`);
}

// --- every manifest video must be present ----------------------------------

const missing = [];
const present = [];

for (const entry of videoManifest) {
    const filePath = path.join(targetDir, entry.outputName);
    if (fs.existsSync(filePath)) {
        present.push({ ...entry, filePath, size: fs.statSync(filePath).size });
    } else {
        missing.push(entry.outputName);
    }
}

if (missing.length > 0) {
    fail(
        `Missing ${missing.length} of ${videoManifest.length} videos in ${path.relative(process.cwd(), targetDir)}:\n` +
            missing.map((name) => `    - ${name}`).join("\n"),
        "Publishing a partial set would leave the live site serving stale\n" +
            "  clips for the rest. Run `npm run videos:generate` from the repo root.",
    );
}

// --- refuse to ship a bad render -------------------------------------------
//
// The analysis report is the only thing standing between a frozen or blacked-out
// recording and the docs site: nothing in CI exercises the video specs.

const reportPath = getReportPath("final-video-analysis.json");

if (!fs.existsSync(reportPath)) {
    if (!force) {
        fail(
            "No analysis report found - cannot confirm these renders are good.",
            "Expected " +
                path.relative(process.cwd(), reportPath) +
                "\n  Run `npm run videos:generate`, or pass --force if you have already\n" +
                "  reviewed the clips by hand.",
        );
    }
    console.warn("⚠ No analysis report; publishing anyway (--force).");
} else {
    const results = JSON.parse(fs.readFileSync(reportPath, "utf8"));
    const flagged = results.filter(
        (result) => Array.isArray(result.issues) && result.issues.length > 0,
    );

    if (flagged.length > 0) {
        const detail = flagged
            .map(
                (result) =>
                    `    - ${result.outputName}: ${result.issues.join(", ")} ` +
                    `(duration ${result.duration}s)`,
            )
            .join("\n");

        if (!force) {
            fail(
                `The last analysis flagged ${flagged.length} video(s):\n${detail}`,
                "Fix the choreography and re-render. Pass --force only if you have\n" +
                    "  watched these clips and accept them.",
            );
        }
        console.warn(`⚠ Publishing despite analysis issues (--force):\n${detail}`);
    }
}

// --- upload ----------------------------------------------------------------

const totalMb = present.reduce((sum, v) => sum + v.size, 0) / 1024 / 1024;
console.log(
    `Publishing ${present.length} video(s), ${totalMb.toFixed(1)} MB total:`,
);
for (const video of present) {
    console.log(
        `  ${video.outputName} (${(video.size / 1024 / 1024).toFixed(1)} MB)`,
    );
}

const rsyncArgs = ["-avz", "--checksum"];
if (dryRun) {
    rsyncArgs.push("--dry-run");
}
if (identity) {
    rsyncArgs.push("-e", `ssh -i ${identity}`);
}

// Named files rather than the directory: `targetDir` also holds whatever a
// previous partial run left behind, and --delete on a shared web root is not
// worth the risk.
rsyncArgs.push(...present.map((video) => video.filePath));
rsyncArgs.push(`${publishTarget.replace(/\/$/, "")}/`);

console.log(`\nrsync → ${publishTarget}${dryRun ? "  (dry run)" : ""}\n`);

const result = spawnSync("rsync", rsyncArgs, { stdio: "inherit" });

if (result.error) {
    fail(`Could not run rsync: ${result.error.message}`);
}
if (result.status !== 0) {
    fail(`rsync exited with code ${result.status}.`);
}

if (dryRun) {
    console.log("\n✓ Dry run complete - nothing was uploaded.");
    process.exit(0);
}

// --- verify ----------------------------------------------------------------

const publicBase = (process.env.DOCS_VIDEO_PUBLIC_BASE || "").trim();

if (!publicBase) {
    console.log(
        "\n✓ Published. Set DOCS_VIDEO_PUBLIC_BASE to verify the clips are\n" +
            "  actually reachable after upload.",
    );
    process.exit(0);
}

console.log("\nVerifying published clips...");

const base = publicBase.replace(/\/$/, "");
let unreachable = 0;

for (const video of present) {
    const url = `${base}/${video.outputName}`;
    let ok = false;
    let detail = "";

    try {
        const response = await fetch(url, { method: "HEAD" });
        ok = response.ok;
        detail = `HTTP ${response.status}`;

        // A reverse proxy that serves the SPA fallback for a missing file
        // answers 200 with HTML - that is a miss, not a hit.
        const type = response.headers.get("content-type") || "";
        if (ok && type && !type.includes("video") && !type.includes("webm")) {
            ok = false;
            detail = `HTTP ${response.status} but content-type is ${type}`;
        }
    } catch (error) {
        detail = error.message;
    }

    console.log(`  ${ok ? "✓" : "✗"} ${video.outputName}  ${detail}`);
    if (!ok) {
        unreachable++;
    }
}

if (unreachable > 0) {
    fail(
        `${unreachable} published clip(s) are not reachable at ${base}.`,
        "The upload succeeded, so this is a serving problem - check the web\n" +
            "  root the target path maps to.",
    );
}

console.log(`\n✓ Published and verified ${present.length} video(s).`);
