export const videoManifest = [
    {
        slug: "model-management",
        outputName: "model-management.webm",
        title: "Model Management",
        description: "Compare versions, inspect changes, and keep model history moving.",
        maxDurationSeconds: 30,
    },
    {
        slug: "texture-sets",
        outputName: "texture-sets.webm",
        title: "Texture Sets",
        description: "Inspect a reusable material built from global texture files.",
        maxDurationSeconds: 20,
    },
    {
        slug: "recycled-files",
        outputName: "recycled-files.webm",
        title: "Recycled Files",
        description: "Recycle, restore, and permanently delete assets with confidence.",
        maxDurationSeconds: 30,
    },
    {
        slug: "user-interface",
        outputName: "user-interface.webm",
        title: "User Interface",
        description: "Navigate tabs, menus, and workspace controls quickly.",
        maxDurationSeconds: 30,
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
        maxDurationSeconds: 30,
    },
    {
        slug: "projects",
        outputName: "projects.webm",
        title: "Projects",
        description: "Browse, search, and inspect production-ready project boards.",
        maxDurationSeconds: 30,
    },
    {
        slug: "packs",
        outputName: "packs.webm",
        title: "Packs",
        description: "Create a pack and attach useful content in one focused flow.",
        maxDurationSeconds: 30,
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
