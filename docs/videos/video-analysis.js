import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
import ffmpegPath from "ffmpeg-static";

import { videoManifest } from "./video-manifest.js";
import { getReportPath } from "./video-paths.js";

function parseRequestedSlugs() {
    return (process.env.DOCS_VIDEO_SLUGS || "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
}

function runFfmpeg(args) {
    if (!ffmpegPath) {
        throw new Error("ffmpeg-static binary is unavailable");
    }

    const result = spawnSync(ffmpegPath, ["-hide_banner", ...args], {
        encoding: "utf8",
    });

    return `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
}

function parseDurationSeconds(text) {
    const match = text.match(/Duration:\s+(\d+):(\d+):(\d+(?:\.\d+)?)/);
    if (!match) {
        return null;
    }

    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    const seconds = Number(match[3]);
    return Number((hours * 3600 + minutes * 60 + seconds).toFixed(2));
}

function parseBlackSegments(text) {
    const matches = text.matchAll(
        /black_start:(-?\d+(?:\.\d+)?)\s+black_end:(\d+(?:\.\d+)?)\s+black_duration:(\d+(?:\.\d+)?)/g,
    );

    return Array.from(matches, (match) => ({
        start: Number(match[1]),
        end: Number(match[2]),
        duration: Number(match[3]),
    }));
}

function parseFreezeSegments(text) {
    const segments = [];
    let current = null;

    for (const line of text.split("\n")) {
        const startMatch = line.match(/freeze_start:\s*(\d+(?:\.\d+)?)/);
        if (startMatch) {
            current = { start: Number(startMatch[1]) };
            continue;
        }

        const endMatch = line.match(/freeze_end:\s*(\d+(?:\.\d+)?)\s*\|\s*freeze_duration:\s*(\d+(?:\.\d+)?)/);
        if (endMatch && current) {
            segments.push({
                start: current.start,
                end: Number(endMatch[1]),
                duration: Number(endMatch[2]),
            });
            current = null;
        }
    }

    return segments;
}

export async function analyzeVideoDirectory(rootDir) {
    const requestedSlugs = parseRequestedSlugs();
    const selectedManifest = videoManifest.filter(
        (entry) =>
            requestedSlugs.length === 0 || requestedSlugs.includes(entry.slug),
    );

    return selectedManifest.map((spec) => {
        const filePath = path.join(rootDir, spec.outputName);
        if (!fs.existsSync(filePath)) {
            return {
                slug: spec.slug,
                outputName: spec.outputName,
                exists: false,
                issues: ["missing"],
            };
        }

        const inspectOutput = runFfmpeg(["-i", filePath, "-f", "null", "-"]);
        const duration = parseDurationSeconds(inspectOutput);
        if (duration === null) {
            return {
                slug: spec.slug,
                outputName: spec.outputName,
                exists: true,
                issues: ["unreadable-video"],
            };
        }

        const blackSegments = parseBlackSegments(
            runFfmpeg([
                "-i",
                filePath,
                "-vf",
                "blackdetect=d=1:pix_th=0.00",
                "-an",
                "-f",
                "null",
                "-",
            ]),
        );

        const freezeSegments = parseFreezeSegments(
            runFfmpeg([
                "-i",
                filePath,
                "-vf",
                "freezedetect=n=0.001:d=4",
                "-an",
                "-f",
                "null",
                "-",
            ]),
        );

        const longestBlack = blackSegments.reduce(
            (max, segment) => Math.max(max, segment.duration),
            0,
        );
        const blackRatio = Number((longestBlack / Math.max(duration, 0.01)).toFixed(2));

        const tailFreeze = freezeSegments
            .slice()
            .reverse()
            .find((segment) => duration - segment.end <= 1.25);

        const recommendedEnd = tailFreeze
            ? Number(Math.max(0, tailFreeze.start + 1.5).toFixed(2))
            : duration;

        const issues = [];
        if (blackRatio >= 0.85) {
            issues.push("black-video");
        }
        if (
            tailFreeze &&
            duration - recommendedEnd >= 4 &&
            duration > spec.maxDurationSeconds
        ) {
            issues.push("frozen-tail");
        }
        if (duration > spec.maxDurationSeconds) {
            issues.push("over-max-duration");
        }

        return {
            slug: spec.slug,
            outputName: spec.outputName,
            exists: true,
            duration,
            maxDurationSeconds: spec.maxDurationSeconds,
            blackRatio,
            blackSegments,
            freezeSegments,
            tailFreezeStart: tailFreeze?.start ?? null,
            recommendedEnd,
            issues,
        };
    });
}

export function writeAnalysisReport(fileName, results) {
    const reportPath = getReportPath(fileName);
    fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
    return reportPath;
}
