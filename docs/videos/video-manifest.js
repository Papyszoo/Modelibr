// `maxDurationSeconds` is a QA ceiling, not a target or a trim point:
// recordings are NEVER cut to the cap (only frozen tails are trimmed).
// analyze-videos.js fails the pipeline when a recording exceeds its cap -
// that means the spec choreography must be tightened, or the cap raised
// here deliberately.
//
// The durations below were measured on 2026-08-15 (v0.5.2) on the local GPU
// lane, which since 0.5.2 is the only place these render - CI no longer does.
// The caps still carry the headroom that was added for CI's slower software
// rendering, so every clip now sits 43-79% under its ceiling. That makes them
// weak gates: a clip could double in length and still pass. Tighten them
// deliberately, from more than one measurement, when next touching a spec.
export const videoManifest = [
    {
        slug: "model-management",
        outputName: "model-management.webm",
        title: "Model Management",
        description: "Compare versions, inspect changes, and keep model history moving.",
        // Records 25.3s locally. The old 40s/61s figures were CI-era; the
        // 75s cap dates from when a software-rendered CI run had to fit.
        maxDurationSeconds: 75,
    },
    {
        slug: "texture-sets",
        outputName: "texture-sets.webm",
        title: "Texture Sets",
        description: "Inspect a reusable material built from global texture files.",
        // Records 11.5s locally - far under the 44s this comment used to
        // claim, and under half of any other clip. The clip is coherent and
        // ends on its hero state, so this is choreography that got leaner,
        // not a truncation; the shortest storyline in the set all the same.
        maxDurationSeconds: 55,
    },
    {
        slug: "recycled-files",
        outputName: "recycled-files.webm",
        title: "Recycled Files",
        description: "Recycle, restore, and permanently delete assets with confidence.",
        maxDurationSeconds: 40,
    },
    {
        slug: "user-interface",
        outputName: "user-interface.webm",
        title: "User Interface",
        description: "Navigate tabs, menus, and workspace controls quickly.",
        maxDurationSeconds: 40,
    },
    {
        slug: "sprites",
        outputName: "sprites.webm",
        title: "Sprites",
        description: "Organize, rename, and re-categorize sprite assets.",
        maxDurationSeconds: 30,
    },
    {
        slug: "sounds",
        outputName: "sounds.webm",
        title: "Sounds",
        description: "Browse, preview, and inspect sound assets.",
        // Records 25.2s locally. The 50s cap was raised for CI headroom that
        // no longer applies.
        maxDurationSeconds: 50,
    },
    {
        slug: "projects",
        outputName: "projects.webm",
        title: "Projects",
        description: "Browse, search, and inspect production-ready project boards.",
        // Records 26.6s locally. The 55s cap was raised for CI headroom that
        // no longer applies.
        maxDurationSeconds: 55,
    },
    {
        slug: "packs",
        outputName: "packs.webm",
        title: "Packs",
        description: "Create a pack and attach useful content in one focused flow.",
        maxDurationSeconds: 40,
    },
];

export const videoManifestBySlug = new Map(
    videoManifest.map((entry) => [entry.slug, entry]),
);

export function getVideoSpec(slug) {
    const spec = videoManifestBySlug.get(slug);
    if (!spec) {
        throw new Error(`Unknown docs video slug: ${slug}`);
    }

    return spec;
}
