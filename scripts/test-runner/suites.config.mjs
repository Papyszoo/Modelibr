// Single source of truth for every test suite in the repo.
//
// To add a suite: append one entry here. `npm run test:audit` cross-checks this
// list against the repo and warns about any test suite that isn't tracked, so
// new suites added elsewhere don't silently fall off the radar.
//
// Fields:
//   id            unique short id (used for logs/report)
//   name          human label
//   kind          dotnet | jest | vitest | node-test | playwright
//                 (controls how the run command is built and results parsed)
//   cwd           working directory relative to repo root
//   command       canonical command to run (reporter flags are appended per-kind)
//   tier          fast | slow | visual | perf  (grouping + default selection)
//   requiresDocker  needs the Docker daemon (and usually the dev stack) running
//   detectPath    file that must exist for the suite to apply on this branch;
//                 absent => suite reported as "not-present" (not a failure)
//   reportPath    optional path (relative to repo root) to an HTML report dir
//                 produced by the suite, linked from the aggregated report
//   note          optional caveat surfaced in the report

export const tierOrder = ["fast", "slow", "visual", "perf"];

export const suites = [
    {
        id: "backend",
        name: "Backend unit (.NET / xUnit)",
        kind: "dotnet",
        cwd: ".",
        command: 'dotnet test Modelibr.sln --filter "Category!=Integration"',
        tier: "fast",
        requiresDocker: false,
        detectPath: "Modelibr.sln",
    },
    {
        id: "frontend",
        name: "Frontend unit (Jest)",
        kind: "jest",
        cwd: "src/frontend",
        command: "npm test",
        tier: "fast",
        requiresDocker: false,
        detectPath: "src/frontend/package.json",
    },
    {
        id: "webgl-extraction",
        name: "WebGL channel-extraction shaders (Playwright, isolated)",
        kind: "playwright",
        cwd: "src/frontend",
        // Renders the shared channel-extraction GLSL in a forced-SwiftShader
        // WebGL2 context and reads pixels back — no app, backend, or Docker.
        // Fast + deterministic, unlike the full-app extraction E2E.
        command: "npm run test:webgl",
        tier: "fast",
        requiresDocker: false,
        detectPath: "src/frontend/playwright.webgl.config.ts",
        note: "Needs Playwright chromium installed (npx playwright install chromium).",
    },
    {
        id: "asset-processor",
        name: "Asset processor (Vitest)",
        kind: "vitest",
        cwd: "src/asset-processor",
        command: "npm test",
        tier: "fast",
        requiresDocker: false,
        detectPath: "src/asset-processor/package.json",
    },
    {
        id: "desktop",
        name: "Desktop / tray host (node --test)",
        kind: "node-test",
        cwd: "src/desktop",
        command: "npm test",
        tier: "fast",
        requiresDocker: false,
        // Only present on branches with the native installer work (feat/tray-host).
        // Absent elsewhere -> reported as "not-present", runs automatically once merged.
        detectPath: "src/desktop/package.json",
    },
    {
        id: "e2e-fast",
        name: "E2E — fast tiers (Playwright + BDD, Docker)",
        kind: "playwright",
        cwd: "tests/e2e",
        // test:ci assumes the stack is already up, so wrap it in setup/teardown.
        // The silent leading teardown clears leftovers from a crashed/interrupted
        // earlier run (stale containers + data) so state can't leak between runs.
        // ec is captured before teardown so the suite reports the test outcome.
        command:
            "npm run test:teardown >/dev/null 2>&1; npm run test:setup && { npm run test:ci; ec=$?; }; npm run test:teardown; exit ${ec:-1}",
        tier: "fast",
        requiresDocker: true,
        detectPath: "tests/e2e/package.json",
        reportPath: "tests/e2e/playwright-report",
    },
    {
        id: "backend-integration",
        name: "Backend integration (.NET, needs Postgres)",
        kind: "dotnet",
        cwd: ".",
        // --wait blocks until the healthcheck passes, so the tests never race a
        // cold Postgres start. The container is left running afterwards — it is
        // the dev database (tests use an isolated Modelibr_IntegrationTests db).
        command:
            'docker compose up -d --wait postgres && dotnet test Modelibr.sln --filter "Category=Integration"',
        tier: "slow",
        requiresDocker: true,
        detectPath: "Modelibr.sln",
        note: "Starts the dev Postgres container automatically (left running — it's the dev database).",
    },
    {
        id: "e2e-full",
        name: "E2E — all tiers incl. @slow Blender (Docker)",
        kind: "playwright",
        cwd: "tests/e2e",
        // `node run-e2e.js` (not `npm test`) so the mega-runner runs the main
        // E2E only — backup-restore is tracked as its own suite below, so it
        // must not be double-run via the package's --with-backup-restore flag.
        command: "node run-e2e.js",
        tier: "slow",
        requiresDocker: true,
        detectPath: "tests/e2e/package.json",
        reportPath: "tests/e2e/playwright-report",
    },
    {
        id: "backup-restore",
        name: "Backup/restore E2E (Docker)",
        kind: "playwright",
        cwd: "tests/backup-restore-e2e",
        // Silent leading teardown clears leftovers from an interrupted earlier run.
        command: "npm run test:teardown >/dev/null 2>&1; npm run test:full",
        tier: "slow",
        requiresDocker: true,
        detectPath: "tests/backup-restore-e2e/package.json",
        reportPath: "tests/backup-restore-e2e/playwright-report",
    },
    {
        id: "storybook-visual",
        name: "Storybook visual regression (Playwright)",
        kind: "playwright",
        cwd: "src/frontend",
        // Build the static Storybook first; the playwright webServer serves it.
        command: "npm run build-storybook && npm run test-storybook",
        tier: "visual",
        requiresDocker: false,
        detectPath: "src/frontend/playwright.config.ts",
        note: "Needs Playwright chromium installed (npx playwright install chromium).",
    },
    {
        id: "e2e-performance",
        name: "E2E — performance / throughput (Docker)",
        kind: "playwright",
        cwd: "tests/e2e",
        command:
            "npm run test:teardown >/dev/null 2>&1; npm run test:setup && { npm run test:performance; ec=$?; }; npm run test:teardown; exit ${ec:-1}",
        tier: "perf",
        requiresDocker: true,
        detectPath: "tests/e2e/package.json",
        reportPath: "tests/e2e/playwright-report",
    },
];
