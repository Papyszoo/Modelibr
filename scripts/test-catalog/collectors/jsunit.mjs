// Static extraction of Jest / Vitest test cases. There's no reliable "list tests
// without running" for these, so we parse describe/it/test names from the source.
// Dynamically generated tests (loops, test.each with computed names) may be
// missed — this is for browsing, not execution.

import path from "node:path";
import { REPO_ROOT, rel, readText, findFiles } from "../util.mjs";

const CALL_RE = /\b(describe|it|test)\s*(?:\.\w+)?\s*\(\s*(['"`])([\s\S]*?)\2/g;

function parseFile(absPath) {
    const text = readText(absPath);
    if (!text) return null;
    const cases = [];
    const describes = new Set();
    let m;
    CALL_RE.lastIndex = 0;
    while ((m = CALL_RE.exec(text)) !== null) {
        const kind = m[1];
        const name = m[3].replace(/\s+/g, " ").trim();
        if (!name) continue;
        if (kind === "describe") describes.add(name);
        else cases.push(name);
    }
    return {
        file: rel(absPath),
        suites: [...describes],
        cases,
        caseCount: cases.length,
    };
}

/**
 * @param {string} rootRel  dir to scan, relative to repo root
 * @param {(rel:string)=>boolean} match  file predicate
 */
export function collectJsUnit(rootRel, match) {
    const files = findFiles(path.join(REPO_ROOT, rootRel), match);
    const parsed = files.map(parseFile).filter(Boolean).filter((f) => f.caseCount > 0);
    parsed.sort((a, b) => a.file.localeCompare(b.file));
    return {
        files: parsed,
        fileCount: parsed.length,
        caseCount: parsed.reduce((n, f) => n + f.caseCount, 0),
    };
}

export function collectJest() {
    return collectJsUnit(
        "src/frontend/src",
        (r) => /\.test\.(t|j)sx?$/.test(r),
    );
}

export function collectVitest() {
    return collectJsUnit(
        "src/asset-processor/tests",
        (r) => /\.test\.js$/.test(r),
    );
}
