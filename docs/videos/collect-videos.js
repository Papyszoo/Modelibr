import fs from "fs";
import path from "path";

import { videoManifest } from "./video-manifest.js";
import { ensureVideoDirs, finalDir, targetDir } from "./video-paths.js";

const requestedSlugs = (process.env.DOCS_VIDEO_SLUGS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

const selectedManifest = videoManifest.filter(
    (entry) =>
        requestedSlugs.length === 0 || requestedSlugs.includes(entry.slug),
);

ensureVideoDirs();

for (const entry of selectedManifest) {
    const outputPath = path.join(targetDir, entry.outputName);
    if (fs.existsSync(outputPath)) {
        fs.unlinkSync(outputPath);
    }
}

let copied = 0;
for (const entry of selectedManifest) {
    const sourcePath = path.join(finalDir, entry.outputName);
    if (!fs.existsSync(sourcePath)) {
        console.error(`Missing final docs video: ${entry.outputName}`);
        process.exitCode = 1;
        continue;
    }

    const destPath = path.join(targetDir, entry.outputName);
    fs.copyFileSync(sourcePath, destPath);
    console.log(
        `  ✓ ${entry.outputName} (${(fs.statSync(destPath).size / 1024 / 1024).toFixed(1)} MB)`,
    );
    copied++;
}

if (copied === 0) {
    console.error("No final docs videos were available to collect.");
    process.exit(1);
}

console.log(`\nCopied ${copied} video(s) to ${targetDir}`);

if (process.exitCode) {
    process.exit(process.exitCode);
}
