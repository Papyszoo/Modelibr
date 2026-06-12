// Parse .github/workflows/*.yml for the bits we need: workflow name, triggers
// (push / pull_request / schedule / workflow_dispatch / workflow_run / release,
// with path filters and cron), and the list of jobs + their display names.
//
// A tiny indentation-aware reader (not a full YAML parser) is enough — these
// workflow files are machine-generated and consistently indented (2 or 4 spaces).

import fs from "node:fs";
import path from "node:path";
import { REPO_ROOT, rel, readText } from "../util.mjs";
import { ciMap } from "../ci-map.mjs";

const WF_DIR = path.join(REPO_ROOT, ".github/workflows");

function indentOf(line) {
    return line.length - line.trimStart().length;
}

function toRows(text) {
    return text
        .split(/\r?\n/)
        .map((raw, n) => ({ raw, n, indent: indentOf(raw), t: raw.trim() }))
        .filter((r) => r.t && !r.t.startsWith("#"));
}

// Indices of rows that form the block under rows[idx] (greater indent), stopping
// at the first row with indent <= the parent's.
function blockRange(rows, idx) {
    const parentIndent = rows[idx].indent;
    let end = idx + 1;
    while (end < rows.length && rows[end].indent > parentIndent) end++;
    return rows.slice(idx + 1, end);
}

function directChildren(block) {
    if (!block.length) return [];
    const min = Math.min(...block.map((r) => r.indent));
    return block.filter((r) => r.indent === min);
}

function keyOf(row) {
    const m = row.t.match(/^([A-Za-z0-9_-]+):/);
    return m ? m[1] : null;
}

function valueOf(row) {
    const m = row.t.match(/^[A-Za-z0-9_-]+:\s*(.+)$/);
    return m ? m[1].trim() : "";
}

function listItems(block) {
    // "- 'src/**'" style list under a key
    return block
        .filter((r) => r.t.startsWith("- "))
        .map((r) => r.t.slice(2).trim().replace(/^['"]|['"]$/g, ""));
}

function parseWorkflow(absPath) {
    const text = readText(absPath);
    if (!text) return null;
    const rows = toRows(text);

    const nameRow = rows.find((r) => r.indent === 0 && keyOf(r) === "name");
    const name = nameRow ? valueOf(nameRow).replace(/^['"]|['"]$/g, "") : path.basename(absPath);

    const triggers = {};
    const onRow = rows.find((r) => r.indent === 0 && keyOf(r) === "on");
    const onInline = onRow ? valueOf(onRow) : "";
    if (onInline) {
        // Inline form: `on: push` or `on: [push, pull_request]`.
        for (const k of onInline.replace(/[[\]'"]/g, "").split(",").map((s) => s.trim()).filter(Boolean))
            triggers[k] = true;
    } else if (onRow) {
        const onBlock = blockRange(rows, rows.indexOf(onRow));
        for (const child of directChildren(onBlock)) {
            const key = keyOf(child);
            if (!key) continue;
            const sub = blockRange(rows, rows.indexOf(child));
            if (key === "push" || key === "pull_request") {
                const pathsRow = sub.find((r) => keyOf(r) === "paths");
                const branchesRow = sub.find((r) => keyOf(r) === "branches");
                triggers[key] = {
                    paths: pathsRow ? listItems(blockRange(rows, rows.indexOf(pathsRow))) : null,
                    branches: branchesRow ? valueOf(branchesRow) : null,
                };
            } else if (key === "schedule") {
                triggers.schedule = sub
                    .filter((r) => r.t.includes("cron:"))
                    .map((r) => r.t.replace(/.*cron:\s*/, "").replace(/^['"]|['"]$/g, ""));
            } else if (key === "release") {
                const typesRow = sub.find((r) => keyOf(r) === "types");
                triggers.release = typesRow ? valueOf(typesRow) : true;
            } else {
                triggers[key] = true; // workflow_dispatch, workflow_run, etc.
            }
        }
    }

    const jobs = [];
    const jobsRow = rows.find((r) => r.indent === 0 && keyOf(r) === "jobs");
    if (jobsRow) {
        const jobsBlock = blockRange(rows, rows.indexOf(jobsRow));
        for (const jobRow of directChildren(jobsBlock)) {
            const id = keyOf(jobRow);
            if (!id) continue;
            const sub = blockRange(rows, rows.indexOf(jobRow));
            // Only the job's own keys — not a step's `- name:` deeper in the block.
            const nameR = directChildren(sub).find((r) => keyOf(r) === "name");
            jobs.push({
                id,
                name: nameR ? valueOf(nameR).replace(/^['"]|['"]$/g, "") : id,
            });
        }
    }

    return { file: path.basename(absPath), path: rel(absPath), name, triggers, jobs };
}

export function collectCi() {
    let files = [];
    try {
        files = fs
            .readdirSync(WF_DIR)
            .filter((f) => f.endsWith(".yml") || f.endsWith(".yaml"))
            .map((f) => path.join(WF_DIR, f));
    } catch {
        return { workflows: [], map: ciMap };
    }
    const workflows = files.map(parseWorkflow).filter(Boolean);
    return { workflows, map: ciMap };
}
