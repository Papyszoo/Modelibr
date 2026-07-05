import fs from "fs";
import { spawnSync } from "child_process";
import ffmpegPath from "ffmpeg-static";

import { analyzeVideoDirectory, writeAnalysisReport } from "./video-analysis.js";
import { finalDir, getFinalVideoPath, rawDir, ensureVideoDirs } from "./video-paths.js";

ensureVideoDirs();

const results = await analyzeVideoDirectory(rawDir);
const rawReportPath = writeAnalysisReport("raw-video-analysis.json", results);

for (const result of results) {
    if (!result.exists) {
        continue;
    }

    const sourcePath = `${rawDir}/${result.outputName}`;
    const destPath = getFinalVideoPath(result.outputName);

    if (!ffmpegPath) {
        fs.copyFileSync(sourcePath, destPath);
        continue;
    }

    // Trim ONLY frozen tails (recommendedEnd from freeze detection).
    // The manifest cap is a QA gate enforced by analyze-videos.js, not a
    // trim point: cutting a recording at the cap chops the demo mid-action,
    // which is worse than shipping a slightly longer video. Over-cap
    // recordings must be fixed in the spec (or the cap raised deliberately).
    const shouldTrim =
        result.recommendedEnd && result.recommendedEnd < result.duration - 1;

    if (!shouldTrim) {
        fs.copyFileSync(sourcePath, destPath);
        continue;
    }

    const trimEnd = Math.min(result.duration, result.recommendedEnd);

    const trimResult = spawnSync(
        ffmpegPath,
        [
            "-y",
            "-i",
            sourcePath,
            "-to",
            String(trimEnd),
            "-c",
            "copy",
            destPath,
        ],
        { stdio: "inherit" },
    );

    if (trimResult.status !== 0) {
        fs.copyFileSync(sourcePath, destPath);
    }
}

console.log(`Analyzed raw videos: ${rawReportPath}`);
console.log(`Prepared final videos in ${finalDir}`);
