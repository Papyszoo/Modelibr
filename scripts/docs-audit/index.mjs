// docs:audit - fail CI when user-facing docs contradict the code.
//
// Docs drift found in the wild that this script would have caught:
//   - STL/3MF shipped in 0.3.0 but missing from README + models.md formats
//   - user-interface.md documented 12 of 23 tab types
//   - landing page pointed at http://localhost:3000 (app is https://…:3010)
//   - sounds.md omitted AAC/M4A
//
// Design: each check reads a SOURCE OF TRUTH in code (FileType registry,
// TabType union, .env.example, video manifest) and asserts the docs agree.
// Errors fail the run; warnings print but pass (used for checks whose fix
// is still in flight - flip them to errors once merged).

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const repoRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../..",
);

const errors = [];
const warnings = [];
const passes = [];

function read(relPath) {
    return fs.readFileSync(path.join(repoRoot, relPath), "utf8");
}

function check(ok, label, detail, { warnOnly = false } = {}) {
    if (ok) {
        passes.push(label);
    } else if (warnOnly) {
        warnings.push(`${label} - ${detail}`);
    } else {
        errors.push(`${label} - ${detail}`);
    }
}

// ── Sources of truth ────────────────────────────────────────────────────────

// FileType registry: extension → FileType field, field → category.
const fileTypeSource = read("src/Domain/ValueObjects/FileType.cs");
const fieldCategories = new Map(
    [...fileTypeSource.matchAll(
        /public static readonly FileType (\w+) = new\(\s*"[^"]+",\s*"[^"]*",\s*(?:true|false),\s*FileTypeCategory\.(\w+)\)/g,
    )].map((m) => [m[1], m[2]]),
);
const extensionMapping = [...fileTypeSource.matchAll(
    /\{\s*"\.(\w+)",\s*(\w+)\s*\}/g,
)].map((m) => ({ ext: m[1].toLowerCase(), field: m[2] }));

function extensionsForCategory(category) {
    return extensionMapping
        .filter((e) => fieldCategories.get(e.field) === category)
        .map((e) => e.ext);
}

const modelExtensions = extensionsForCategory("Model3D");
const audioExtensions = extensionsForCategory("Audio");

check(
    modelExtensions.length >= 4 && audioExtensions.length >= 4,
    "FileType registry parsed",
    `unexpectedly few extensions (models: ${modelExtensions}, audio: ${audioExtensions}) - FileType.cs layout changed? Update scripts/docs-audit.`,
);

// Tab types from the frontend union.
const uiTypes = read("src/frontend/src/shared/types/ui.ts");
const tabTypeBlock = uiTypes.match(/export type TabType =([\s\S]*?)\n\n/);
const tabTypes = tabTypeBlock
    ? [...tabTypeBlock[1].matchAll(/'(\w+)'/g)].map((m) => m[1])
    : [];
check(
    tabTypes.length >= 15,
    "TabType union parsed",
    `only found ${tabTypes.length} tab types - ui.ts layout changed? Update scripts/docs-audit.`,
);

// Frontend port from env template.
const frontendPort =
    read(".env.example").match(/^FRONTEND_PORT=(\d+)/m)?.[1] ?? null;
check(frontendPort !== null, ".env.example FRONTEND_PORT parsed", "missing");

// Video manifest output names.
const manifestOutputs = [...read("docs/videos/video-manifest.js").matchAll(
    /outputName:\s*"([^"]+)"/g,
)].map((m) => m[1]);

// ── Check 1: model formats documented ───────────────────────────────────────
// models.md must name every uploadable model extension (plus .blend, which is
// a Project-category type but part of the documented model workflow).
{
    const doc = read("docs/docs/features/models.md");
    const line = doc.match(/\*\*Supported formats:\*\*(.*)/i)?.[1] ?? "";
    const expected = [...modelExtensions, "blend"];
    const missing = expected.filter(
        (ext) => !new RegExp(`\\b${ext}\\b`, "i").test(line),
    );
    check(
        line !== "" && missing.length === 0,
        "models.md lists all model upload formats",
        line === ""
            ? "no '**Supported formats:**' line found"
            : `missing: ${missing.join(", ")} (registry: src/Domain/ValueObjects/FileType.cs)`,
    );
}

// ── Check 2: sound formats documented ───────────────────────────────────────
{
    const doc = read("docs/docs/features/sounds.md");
    const line = doc.match(/\*\*Supported formats:\*\*(.*)/i)?.[1] ?? "";
    const missing = audioExtensions.filter(
        (ext) => !new RegExp(`\\b${ext}\\b`, "i").test(line),
    );
    check(
        line !== "" && missing.length === 0,
        "sounds.md lists all audio formats",
        line === ""
            ? "no '**Supported formats:**' line found"
            : `missing: ${missing.join(", ")}`,
    );
}

// ── Check 3: every tab type is documented (or explicitly exempt) ────────────
// user-interface.md must mention each tab by its user-facing label.
{
    const tabLabels = {
        newTab: "New Tab",
        modelList: "Models",
        modelViewer: "Model Viewer",
        textureSets: "Texture Sets",
        globalMaterials: "Global Materials",
        modelTextures: "Multi-Model Textures",
        textureSetViewer: "Texture Set Viewer",
        environmentMaps: "Environment Maps",
        environmentMapViewer: "Environment Map Viewer",
        packs: "Packs",
        packViewer: "Pack",
        projects: "Projects",
        projectViewer: "Project",
        sprites: "Sprites",
        sounds: "Sounds",
        scripts: "Scripts",
        scriptViewer: "Script Viewer",
        assetStore: "Asset Store",
        settings: "Settings",
        history: "History",
        recycledFiles: "Recycled Files",
    };
    // Exempt tab types must carry a reason. Remove an entry when the feature
    // becomes user-reachable - the audit will then demand documentation.
    const exempt = {
        stageList: "Stages tile is disabled in NewTabPage ('under rework')",
        stageEditor: "Stages tile is disabled in NewTabPage ('under rework')",
    };
    const doc = read("docs/docs/features/user-interface.md");
    const undocumented = tabTypes.filter((t) => {
        if (exempt[t]) return false;
        const label = tabLabels[t];
        if (!label) return true; // new tab type unknown to the audit
        return !doc.includes(label);
    });
    check(
        undocumented.length === 0,
        "user-interface.md covers every tab type",
        `undocumented tab types: ${undocumented.join(", ")} - document them in user-interface.md (and add a label here), or add an exemption with a reason`,
    );
}

// ── Check 4: URLs use the real frontend port, no legacy port anywhere ──────
{
    const files = [
        "docs/src/pages/index.tsx",
        "docs/docs/intro.md",
    ];
    for (const file of files) {
        const content = read(file);
        const urls = [...content.matchAll(/localhost:(\d+)/g)].map((m) => m[1]);
        const wrong = urls.filter((p) => p !== frontendPort);
        check(
            urls.length > 0 && wrong.length === 0,
            `${file} uses the real frontend port`,
            urls.length === 0
                ? "no localhost URL found (quick start removed?)"
                : `found localhost:${wrong.join(", localhost:")} - FRONTEND_PORT is ${frontendPort} (.env.example)`,
        );
    }
}

// ── Check 5: video embeds ↔ video manifest ─────────────────────────────────
// Every <source src=".../videos/X.webm"> must exist in the manifest (else the
// player is permanently empty); every manifest entry should be embedded.
{
    const featureDir = path.join(repoRoot, "docs/docs/features");
    const embedded = [];
    for (const file of fs.readdirSync(featureDir)) {
        if (!file.endsWith(".md")) continue;
        const content = read(path.join("docs/docs/features", file));
        for (const m of content.matchAll(/videos\/([\w-]+\.webm)/g)) {
            embedded.push({ file, video: m[1] });
        }
    }
    const orphanEmbeds = embedded.filter(
        (e) => !manifestOutputs.includes(e.video),
    );
    check(
        orphanEmbeds.length === 0,
        "every embedded video exists in the manifest",
        orphanEmbeds
            .map((e) => `${e.file} embeds ${e.video} (not in docs/videos/video-manifest.js)`)
            .join("; "),
    );

    const embeddedNames = new Set(embedded.map((e) => e.video));
    const unusedManifest = manifestOutputs.filter((v) => !embeddedNames.has(v));
    check(
        unusedManifest.length === 0,
        "every manifest video is embedded in a feature page",
        `generated but never shown: ${unusedManifest.join(", ")}`,
        { warnOnly: true },
    );
}

// ── Check 6 (warn until PR #557 merges): README formats ────────────────────
{
    const readme = read("README.md");
    const expected = [...modelExtensions, "blend"];
    const missing = expected.filter(
        (ext) => !new RegExp(`\\b${ext}\\b`, "i").test(readme),
    );
    check(
        missing.length === 0,
        "README lists all model upload formats",
        `missing: ${missing.join(", ")}`,
        { warnOnly: true }, // TODO: flip to error once the README refresh (PR #557) merges
    );
}

// ── Report ──────────────────────────────────────────────────────────────────
for (const p of passes) console.log(`✓ ${p}`);
for (const w of warnings) console.warn(`⚠ ${w}`);
for (const e of errors) console.error(`✗ ${e}`);

console.log(
    `\ndocs:audit - ${passes.length} passed, ${warnings.length} warnings, ${errors.length} errors`,
);
if (errors.length > 0) {
    console.error(
        "Docs contradict the code. Fix the docs (or the audit's allowlists, with a reason).",
    );
    process.exit(1);
}
