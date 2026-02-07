/**
 * Collect videos from Playwright test-results directory
 * and copy them to the Docusaurus static folder for embedding.
 *
 * Run after: npm run generate
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const testResultsDir = path.join(__dirname, "test-results");
const targetDir = path.join(__dirname, "..", "static", "videos");

// Ensure target directory exists
fs.mkdirSync(targetDir, { recursive: true });

// Map test names to output filenames
const videoMapping = {
    "model-management": "model-management.webm",
    "recycled-files": "recycled-files.webm",
    "user-interface": "user-interface.webm",
    sprites: "sprites.webm",
    sounds: "sounds.webm",
    projects: "projects.webm",
    packs: "packs.webm",
};

function findVideos(dir: string): string[] {
    const results: string[] = [];
    if (!fs.existsSync(dir)) return results;

    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            results.push(...findVideos(fullPath));
        } else if (entry.name.endsWith(".webm")) {
            results.push(fullPath);
        }
    }
    return results;
}

const videos = findVideos(testResultsDir);
console.log(`Found ${videos.length} video(s) in test-results/`);

let copied = 0;
for (const videoPath of videos) {
    // Extract the test name from the directory structure
    const relPath = path.relative(testResultsDir, videoPath).toLowerCase();

    for (const [key, outputName] of Object.entries(videoMapping)) {
        if (relPath.includes(key.replace(/-/g, "-"))) {
            const dest = path.join(targetDir, outputName);
            fs.copyFileSync(videoPath, dest);
            console.log(
                `  ✓ ${outputName} (${(fs.statSync(dest).size / 1024 / 1024).toFixed(1)} MB)`,
            );
            copied++;
            break;
        }
    }
}

if (copied === 0) {
    console.log("No matching videos found. Run 'npm run generate' first.");
} else {
    console.log(
        `\nCopied ${copied} video(s) to ${path.relative(process.cwd(), targetDir)}/`,
    );
}
