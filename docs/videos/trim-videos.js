import fs from "fs";
import { spawnSync } from "child_process";
import ffmpegPath from "ffmpeg-static";

import { analyzeVideoDirectory, writeAnalysisReport } from "./video-analysis.js";
import { polishVideo } from "./video-polish.js";
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

    // A spec that logs a timeline (every current spec) gets the full edit:
    // dead time compressed, eased camera, captions. See video-polish.js.
    const timelinePath = sourcePath.replace(/\.webm$/, ".timeline.json");
    if (ffmpegPath && fs.existsSync(timelinePath)) {
        const edit = polishVideo({
            rawPath: sourcePath,
            timelinePath,
            outPath: destPath,
            duration: result.duration,
        });
        console.log(
            `${result.outputName}: ${edit.rawDuration}s raw -> ${edit.outputDuration}s ` +
                `(${edit.cuts.length} cuts, ${edit.moves} camera moves, ${edit.captions} captions, ` +
                `${edit.topCaptions} at the top)`,
        );
        continue;
    }

    if (!ffmpegPath) {
        fs.copyFileSync(sourcePath, destPath);
        continue;
    }

    // Fallback for a clip without a timeline (no current spec): trim only
    // its frozen tail (recommendedEnd from freeze detection).
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
