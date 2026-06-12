// Shared helpers for the test-catalog tooling. Reuses the test-runner's repo
// paths so both tools agree on where things live.

import fs from "node:fs";
import path from "node:path";
import { REPO_ROOT, REPORT_DIR } from "../test-runner/util.mjs";

export { REPO_ROOT, REPORT_DIR };
export const CATALOG_DIR = path.join(REPO_ROOT, "test-catalog");
export const CATALOG_FILE = path.join(CATALOG_DIR, "catalog.json");
export const GH_CACHE_FILE = path.join(CATALOG_DIR, "github-history.json");
export const HISTORY_FILE = path.join(REPORT_DIR, "history.jsonl");

export function readText(absPath) {
    try {
        return fs.readFileSync(absPath, "utf8");
    } catch {
        return null;
    }
}

export function rel(absPath) {
    return path.relative(REPO_ROOT, absPath);
}

const SKIP_DIRS = new Set([
    "node_modules",
    ".git",
    "bin",
    "obj",
    "dist",
    "build",
    ".cache",
    "storybook-static",
    "test-results",
    "playwright-report",
    "coverage",
]);

/** Recursively collect files under `dir` matching `predicate(relPath)`. */
export function findFiles(dir, predicate, hits = []) {
    let entries;
    try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
        return hits;
    }
    for (const e of entries) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) {
            if (SKIP_DIRS.has(e.name)) continue;
            findFiles(full, predicate, hits);
        } else if (predicate(path.relative(REPO_ROOT, full))) {
            hits.push(full);
        }
    }
    return hits;
}
