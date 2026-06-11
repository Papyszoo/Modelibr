// Explicit mapping of suite id -> the GitHub Actions job(s) that run it. The
// YAML->suite relationship isn't fully machine-derivable, so it's declared here
// and merged with parsed workflow triggers by collectors/ci.mjs. `jobName` matches
// the job's display name as shown in the Actions UI (and the jobs API).
//
// `note` flags caveats (e.g. built-but-not-run, or not wired into CI at all).

export const ciMap = {
    backend: [{ workflow: "ci-and-deploy.yml", jobName: "Backend Unit Tests" }],
    "backend-integration": [
        { workflow: null, jobName: null, note: "Excluded from CI (Category!=Integration filter)" },
    ],
    frontend: [
        { workflow: "ci-and-deploy.yml", jobName: "Frontend Unit Tests" },
        { workflow: "code-quality.yml", jobName: "Frontend Code Quality" },
    ],
    "asset-processor": [
        { workflow: "ci-and-deploy.yml", jobName: "Asset Processor Tests" },
        { workflow: "code-quality.yml", jobName: "Asset Processor Code Quality" },
    ],
    desktop: [{ workflow: null, jobName: null, note: "No CI binding found" }],
    "e2e-fast": [{ workflow: "ci-and-deploy.yml", jobName: "E2E Tests" }],
    "e2e-full": [
        { workflow: "ci-and-deploy.yml", jobName: "E2E Tests" },
        { workflow: "nightly-e2e.yml", jobName: "Slow E2E Tests (Nightly)" },
    ],
    "backup-restore": [{ workflow: null, jobName: null, note: "Not wired into CI" }],
    "storybook-visual": [
        {
            workflow: "ci-and-deploy.yml",
            jobName: "Build Storybook",
            note: "Storybook is built in CI, but the visual snapshot test is not run",
        },
    ],
    "e2e-performance": [
        { workflow: null, jobName: null, note: "Opt-in only; not in CI" },
    ],
};

// Workflows worth pulling timing history for.
export const trackedWorkflows = [
    "ci-and-deploy.yml",
    "nightly-e2e.yml",
    "code-quality.yml",
    "native-release.yml",
];
