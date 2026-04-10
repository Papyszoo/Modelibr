import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const generatedDir = path.join(__dirname, ".generated");
export const rawDir = path.join(generatedDir, "raw");
export const finalDir = path.join(generatedDir, "final");
export const reportsDir = path.join(generatedDir, "reports");
export const targetDir = path.join(__dirname, "..", "static", "videos");
export const testResultsDir = path.join(__dirname, "test-results");

export function ensureVideoDirs() {
    for (const dir of [generatedDir, rawDir, finalDir, reportsDir, targetDir]) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

export function getRawVideoPath(outputName) {
    ensureVideoDirs();
    return path.join(rawDir, outputName);
}

export function getFinalVideoPath(outputName) {
    ensureVideoDirs();
    return path.join(finalDir, outputName);
}

export function getReportPath(fileName) {
    ensureVideoDirs();
    return path.join(reportsDir, fileName);
}

export function clearDirContents(dir) {
    if (!fs.existsSync(dir)) {
        return;
    }

    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            fs.rmSync(fullPath, { recursive: true, force: true });
        } else {
            fs.unlinkSync(fullPath);
        }
    }
}
