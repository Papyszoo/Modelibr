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

    const shouldTrim =
        result.duration > result.maxDurationSeconds ||
        (result.recommendedEnd && result.recommendedEnd < result.duration - 1);

    if (!shouldTrim) {
        fs.copyFileSync(sourcePath, destPath);
        continue;
    }

    const trimEnd = Math.min(
        result.duration,
        result.maxDurationSeconds,
        result.recommendedEnd || result.duration,
    );

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
