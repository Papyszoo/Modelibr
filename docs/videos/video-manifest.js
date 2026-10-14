// `maxDurationSeconds` is a QA ceiling on the FINAL clip, not a target or a
// trim point. analyze-videos.js fails the pipeline when a clip exceeds it -
// that means the spec choreography must be tightened, or the cap raised here
// deliberately.
//
// Final clips are edited by video-polish.js (dead time compressed, loaders
// cut) and measured 9.9-18.7s when the caps were last lowered (from 30-75s,
// which dated from CI-era raw recordings). One shared 28s cap leaves a
// story that grows by half still passing and catches one that runs away.
export const videoManifest = [
    {
        slug: "model-management",
        outputName: "model-management.webm",
        title: "Model Management",
        maxDurationSeconds: 28,
    },
    {
        slug: "texture-sets",
        outputName: "texture-sets.webm",
        title: "Texture Sets",
        maxDurationSeconds: 28,
    },
    {
        slug: "recycled-files",
        outputName: "recycled-files.webm",
        title: "Recycled Files",
        maxDurationSeconds: 28,
    },
    {
        slug: "user-interface",
        outputName: "user-interface.webm",
        title: "User Interface",
        maxDurationSeconds: 28,
    },
    {
        slug: "sprites",
        outputName: "sprites.webm",
        title: "Sprites",
        maxDurationSeconds: 28,
    },
    {
        slug: "sounds",
        outputName: "sounds.webm",
        title: "Sounds",
        maxDurationSeconds: 28,
    },
    {
        slug: "projects",
        outputName: "projects.webm",
        title: "Projects",
        maxDurationSeconds: 28,
    },
    {
        slug: "packs",
        outputName: "packs.webm",
        title: "Packs",
        maxDurationSeconds: 28,
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
