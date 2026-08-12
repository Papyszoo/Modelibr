// `maxDurationSeconds` is a QA ceiling, not a target or a trim point:
// recordings are NEVER cut to the cap (only frozen tails are trimmed).
// analyze-videos.js fails the pipeline when a recording exceeds its cap -
// that means the spec choreography must be tightened, or the cap raised
// here deliberately. Caps include headroom for slower CI rendering.
export const videoManifest = [
    {
        slug: "model-management",
        outputName: "model-management.webm",
        title: "Model Management",
        description: "Compare versions, inspect changes, and keep model history moving.",
        // ~40s on a local GPU; CI's software rendering paces the recorded
        // waits to ~61s (observed 3× on the v0.4.2 main push). 45 left no
        // CI headroom and failed the deploy.
        maxDurationSeconds: 75,
    },
    {
        slug: "texture-sets",
        outputName: "texture-sets.webm",
        title: "Texture Sets",
        description: "Inspect a reusable material built from global texture files.",
        // Deliberate raise from 40: the choreography measures a stable ~44s
        // locally (43.6s/44.6s over two runs, zero freeze/black frames), and
        // main-push CI renders on software GL, which runs longer than local.
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
        // Records ~26s locally. CI software rendering paces recorded waits
        // ~1.5x local (measured on model-management at v0.4.2), which puts this
        // at ~39s against the old 40s cap - inside the noise. Raised for CI
        // headroom, not because the choreography grew.
        maxDurationSeconds: 50,
    },
    {
        slug: "projects",
        outputName: "projects.webm",
        title: "Projects",
        description: "Browse, search, and inspect production-ready project boards.",
        // Records ~28s locally, which the ~1.5x CI pacing puts at ~43s against
        // the old 45s cap. Same reasoning as sounds above: too thin a margin to
        // survive a slow runner, and an overrun blocks the docs deploy.
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
