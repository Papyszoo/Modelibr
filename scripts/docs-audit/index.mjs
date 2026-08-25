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
        pbrMaterials: "PBR Materials",
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
        scenes: "Scenes",
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

// ── Check 7: every MCP_* setting reaches the container ─────────────────────
// The webapi container sees only the variables docker-compose names, so a
// setting documented in .env.example but missing from that list runs at its
// default no matter what the operator wrote. This shipped once already: the
// MCP flags never reached the container, so writes could not be turned on and
// MCP_ENABLED=false did not turn the endpoint off. The reprise is worse -
// MCP_TOKENS is what authenticates /mcp, and its default is "unauthenticated".
{
    const declared = [...read(".env.example").matchAll(/^#?\s*(MCP_\w+)=/gm)]
        .map((m) => m[1]);
    const composeWebapiEnv =
        read("docker-compose.yml").match(
            /\n {4}webapi:[\s\S]*?\n {8}environment:\n([\s\S]*?)\n {8}\w/,
        )?.[1] ?? "";
    const forwarded = new Set(
        [...composeWebapiEnv.matchAll(/^\s*-\s*(MCP_\w+)=/gm)].map((m) => m[1]),
    );

    check(
        declared.length >= 4,
        ".env.example MCP settings parsed",
        `only found ${declared.length} MCP_* settings - .env.example layout changed? Update scripts/docs-audit.`,
    );

    const missing = declared.filter((name) => !forwarded.has(name));
    check(
        missing.length === 0,
        "docker-compose forwards every MCP_* setting to webapi",
        `not passed to the container, so setting it in .env does nothing: ${missing.join(", ")}`,
    );
}

// ── Check 8: the MCP page lists every registered MCP tool ─────────────────
// The tool tables on the MCP page are what an operator reads to decide whether
// to turn writes on, and what an agent author reads to know what exists. They
// had drifted by six tools - one read (get_store_import) and five writes
// (create_room, place_primitive, set_lighting_preset, delete_scene,
// convert_model) - and both prose counts were stale by more than the drift.
// A tool is registered in C# and documented in Markdown by two different
// hands, so nothing but a check keeps them together.
//
// Source of truth: the [McpServerTool(Name = "…")] attributes, split into read
// and write by which classes Program.cs registers behind MCP_WRITE_ENABLED.
{
    const mcpDir = "src/WebApi/Mcp";
    const toolFiles = fs
        .readdirSync(path.join(repoRoot, mcpDir))
        .filter((f) => f.endsWith(".cs"));

    // Everything inside the `if (mcpWriteEnabled)` block is a write tool type;
    // everything registered before it is a read.
    const program = read("src/WebApi/Program.cs");
    const writeBlock =
        program.match(/if \(mcpWriteEnabled\)\s*\{([\s\S]*?)\n {16}\}/)?.[1] ?? "";
    const writeTypes = new Set(
        [...writeBlock.matchAll(/WithTools<WebApi\.Mcp\.(\w+)>/g)].map((m) => m[1]),
    );

    const readTools = new Set();
    const writeTools = new Set();
    for (const file of toolFiles) {
        const source = read(path.join(mcpDir, file));
        // Split the file at each tool-type class so a tool is attributed to the
        // class it lives in, not to the first one in the file.
        // Deliberately loose on the modifiers: `internal sealed class` or
        // `public sealed partial class` would fall out of a stricter pattern
        // and take all of that class's tools with it - and the check would go
        // green because nothing then requires them to be documented.
        const classes = [
            ...source.matchAll(/(?:public|internal)\s+(?:sealed\s+)?(?:partial\s+)?class (\w+)/g),
        ].map((m) => ({ name: m[1], at: m.index }));
        for (let i = 0; i < classes.length; i++) {
            const body = source.slice(
                classes[i].at,
                i + 1 < classes.length ? classes[i + 1].at : source.length,
            );
            const names = [
                ...body.matchAll(/McpServerTool\(\s*Name\s*=\s*"([^"]+)"/g),
            ].map((m) => m[1]);
            const into = writeTypes.has(classes[i].name) ? writeTools : readTools;
            for (const n of names) into.add(n);
        }
    }

    check(
        readTools.size > 0 && writeTools.size > 0,
        "MCP tool registry parsed",
        `found ${readTools.size} read and ${writeTools.size} write tools - Mcp/ or Program.cs layout changed? Update scripts/docs-audit.`,
    );

    // Each half of the page is read separately. One flat set of every table row
    // on the page cannot tell the two apart, so a WRITE tool listed only in the
    // always-available read table would satisfy "lists every write tool" - on
    // the one page whose job is helping an operator decide whether to turn
    // writes on.
    const mcpPage = read("docs/docs/features/mcp-server.md");
    const readHeading = mcpPage.indexOf("\n## What the agent can read");
    const writeHeading = mcpPage.indexOf("\n## What the agent can change");
    check(
        readHeading >= 0 && writeHeading > readHeading,
        "mcp-server.md read and write sections found",
        "the two section headings moved or were renamed - update scripts/docs-audit.",
    );

    const rowsIn = (section) =>
        new Set([...section.matchAll(/^\| `([a-z_]+)`/gm)].map((m) => m[1]));
    const documentedReads = rowsIn(mcpPage.slice(readHeading, writeHeading));
    const documentedWrites = rowsIn(mcpPage.slice(writeHeading));

    const undocumentedReads = [...readTools].filter(
        (t) => !documentedReads.has(t),
    );
    check(
        undocumentedReads.length === 0,
        "mcp-server.md lists every read tool",
        `registered but not in the read section: ${undocumentedReads.join(", ")}`,
    );

    const undocumentedWrites = [...writeTools].filter(
        (t) => !documentedWrites.has(t),
    );
    check(
        undocumentedWrites.length === 0,
        "mcp-server.md lists every write tool",
        `registered but not in the write section: ${undocumentedWrites.join(", ")}`,
    );

    // And neither side may claim the other's tools: a read tool listed under
    // "what the agent can change" tells an operator the opposite of the truth.
    const misfiled = [
        ...[...readTools].filter((t) => documentedWrites.has(t)),
        ...[...writeTools].filter((t) => documentedReads.has(t)),
    ];
    check(
        misfiled.length === 0,
        "mcp-server.md files every tool on the right side",
        `documented in the wrong section: ${misfiled.join(", ")}`,
    );

    // The counts in prose. Spelled out in words on the page, so the check reads
    // them the same way rather than asking the page to carry a digit.
    const words = [
        "zero", "one", "two", "three", "four", "five", "six", "seven", "eight",
        "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen",
        "sixteen", "seventeen", "eighteen", "nineteen", "twenty",
    ];
    const spell = (n) => {
        // Past 99 the page should carry a digit rather than a phrase, and this
        // returning "undefined-one" would fail the count check with a message
        // that explains nothing.
        if (n > 99) return String(n);
        if (n <= 20) return words[n];
        const tens = [
            "", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy",
            "eighty", "ninety",
        ][Math.floor(n / 10)];
        return n % 10 === 0 ? tens : `${tens}-${words[n % 10]}`;
    };

    const readClaim = mcpPage.match(/These ([a-z-]+) read tools are always available/)?.[1];
    check(
        readClaim === spell(readTools.size),
        "mcp-server.md counts the read tools correctly",
        `page says "${readClaim}", ${readTools.size} are registered (${spell(readTools.size)})`,
    );

    const writeClaim = mcpPage.match(/and ([a-z-]+) more tools appear/)?.[1];
    check(
        writeClaim === spell(writeTools.size),
        "mcp-server.md counts the write tools correctly",
        `page says "${writeClaim}", ${writeTools.size} are registered (${spell(writeTools.size)})`,
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
