// Parse Playwright-BDD .feature files into a browsable structure:
//   feature -> { folder, file, title, description, featureTags, scenarios[] }
//   scenario -> { name, line, tags, dependsOn, comment }
// Tags accumulate on the lines above a Scenario/Feature; comments (# ...)
// immediately above a scenario are kept as the explanatory note.

import path from "node:path";
import { REPO_ROOT, rel, readText, findFiles } from "../util.mjs";

const FEATURES_DIR = path.join(REPO_ROOT, "tests/e2e/features");

function parseTagLine(line) {
    // "@a @b:val,val2" -> [{ name, value }]
    return line
        .trim()
        .split(/\s+/)
        .filter((t) => t.startsWith("@"))
        .map((t) => {
            const body = t.slice(1);
            const i = body.indexOf(":");
            return i === -1
                ? { name: body, value: null }
                : { name: body.slice(0, i), value: body.slice(i + 1) };
        });
}

function parseFeature(absPath) {
    const text = readText(absPath);
    if (!text) return null;
    const lines = text.split(/\r?\n/);

    const feature = {
        folder: path.relative(FEATURES_DIR, path.dirname(absPath)) || ".",
        file: rel(absPath),
        title: "",
        description: "",
        featureTags: [],
        scenarios: [],
    };

    let pendingTags = [];
    let pendingComments = [];
    let inFeatureDescription = false;
    const descLines = [];

    for (let i = 0; i < lines.length; i++) {
        const raw = lines[i];
        const line = raw.trim();

        if (line.startsWith("@")) {
            pendingTags.push(...parseTagLine(line));
            continue;
        }
        if (line.startsWith("#")) {
            pendingComments.push(line.replace(/^#\s?/, ""));
            continue;
        }
        if (line.startsWith("Feature:")) {
            feature.title = line.slice("Feature:".length).trim();
            feature.featureTags = pendingTags;
            pendingTags = [];
            pendingComments = [];
            inFeatureDescription = true;
            continue;
        }
        if (/^(Scenario|Scenario Outline|Rule):/.test(line)) {
            inFeatureDescription = false;
            const name = line.replace(/^(Scenario Outline|Scenario|Rule):\s*/, "");
            const allTags = [...feature.featureTags, ...pendingTags];
            const dep = pendingTags.find((t) => t.name === "depends-on");
            feature.scenarios.push({
                name,
                line: i + 1,
                tags: pendingTags.map((t) => (t.value ? `${t.name}:${t.value}` : t.name)),
                dependsOn: dep && dep.value ? dep.value.split(",") : [],
                comment: pendingComments.join("\n"),
                isOutline: line.startsWith("Scenario Outline"),
            });
            pendingTags = [];
            pendingComments = [];
            continue;
        }
        // Body lines reset the comment accumulator (comments only "stick" to the
        // next scenario/tag block, not across step bodies).
        if (line === "") {
            if (!inFeatureDescription) pendingComments = [];
            continue;
        }
        if (inFeatureDescription) {
            descLines.push(line);
        } else if (!/^(Background|Given|When|Then|And|But|\||Examples)/.test(line)) {
            pendingComments = [];
        }
    }

    feature.description = descLines.join(" ").trim();
    return feature;
}

export function collectGherkin() {
    const files = findFiles(FEATURES_DIR, (r) => r.endsWith(".feature"));
    const features = files
        .map(parseFeature)
        .filter(Boolean)
        .sort((a, b) => a.file.localeCompare(b.file));

    const scenarioCount = features.reduce((n, f) => n + f.scenarios.length, 0);
    const tagCounts = {};
    for (const f of features)
        for (const s of f.scenarios)
            for (const t of s.tags) {
                const base = t.split(":")[0];
                tagCounts[base] = (tagCounts[base] || 0) + 1;
            }

    return { features, scenarioCount, featureCount: features.length, tagCounts };
}
