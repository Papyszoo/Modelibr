# Local test runner + Test Studio

Both built on branch `feat/local-test-runner` (2026-06-07). Dependency-free Node.

## Runner — `scripts/test-runner/`

- `npm run test:all` — interactive picker (fast tier pre-selected)
- `npm run test:all:fast` / `test:all:full` — non-interactive
- `npm run test:audit` — flags suites not listed in the manifest

**Single source of truth: `scripts/test-runner/suites.config.mjs`.** Adding a
suite = one entry (`kind`: dotnet | jest | vitest | node-test | playwright). The
audit warns about any `*.Tests.csproj`, any `package.json` with a `test` script,
or any `docker-compose*e2e*` not covered — that's the "keep up with new tests"
safety net.

Behavior: Docker-needing suites are **skipped, not failed**, when the daemon is
down; suites whose files aren't on the current branch report **not-present**;
exits non-zero if any selected suite failed. It shells out to each suite's
existing command — no orchestration is duplicated.

Writes `test-report/index.html` (git-ignored) plus `history.jsonl`.

## Test Studio — `scripts/test-catalog/`

Browsable catalog + control panel with live runs, layered on the runner.

- `npm run test:site` — build catalog (incl. GitHub timings via `gh`) + open UI
- `npm run test:site:fast` — skip the GitHub fetch (offline/quick)
- `npm run test:catalog` — just rebuild `test-catalog/catalog.json`

**Three parts.** `build-catalog.mjs` + `collectors/` produce `catalog.json`
(suites from the runner manifest, `dotnet --list-tests`, statically-parsed
Jest/Vitest cases, Gherkin scenarios, workflow triggers + `ci-map.mjs`, GitHub job
timings cached 6h, local history from `test-report/history.jsonl`).
`server.mjs` (Node http + SSE, binds 127.0.0.1) serves the UI and runs suites —
the client sends a run-spec, `runspec.mjs` builds the command from the manifest
(user strings passed via env and quoted — no shell injection); output streams over
SSE. `ui/` is dependency-free vanilla JS and runs **read-only** against a sibling
`catalog.json` when there's no server (the optional GitHub Pages snapshot).

## UI conventions

**The user dislikes grids and trees — he wants filterable, sortable lists.** Pages
are flat lists with a toolbar (text filter + selects + sort); filtering toggles row
visibility rather than re-rendering, which keeps input focus.

**CI lanes are the key concept.** Each E2E scenario shows where it actually runs,
derived from feature + scenario tags: untagged → every PR (109), `@slow` → nightly
(34), `@serial` → **local only, never on GitHub** (91), `@performance` → manual
(15), `@setup` (8). `laneOf()` in `ui/app.js`; lane mapping source is
`run-e2e-fast.js --fast-only` (PR) + `nightly-e2e.yml` (`--project=slow`).

**Timing labels must be honest:** the 18 m GitHub "E2E Tests" job runs only 117 of
257 scenarios — label it "PR job ≈ 18m (runs 117 of 257)".

## Operational details

- `server.mjs` `fs.watch`es test sources and lazily rebuilds `catalog.json` on the
  next request (~2 s), so reloading picks up new tests. .NET tests need a build
  first (`--list-tests --no-build`).
- Virtual `everything` suite (in `runspec.mjs`, deliberately **not** in the
  manifest — it would recurse) shells out to the mega-runner; its log is
  `test-report/everything.log` at root so it survives the runner's log wipe.
- Runs spawn `detached: true` so `POST /api/run/stop` kills the whole process
  group. Stopped runs are **not** appended to history.
- Docker suites prepend a silent `npm run test:teardown` to clear leftovers from
  interrupted runs. backend-integration starts dev Postgres itself
  (`docker compose up -d --wait postgres`, matching the factory creds, left
  running).
- `tests/e2e/playwright.config.ts` reads `PW_VIDEO` / `PW_TRACE` / `PW_SCREENSHOT`
  / `PW_RETRIES` / `PW_HEADED` (defaults unchanged) so the run builder's params
  take effect.
- CI bindings/timings are declared in `ci-map.mjs` (suite id → workflow job
  display-name).
- **Gotcha:** ignore generated output with anchored paths (`/test-catalog/`,
  `/test-report/`) so the `scripts/test-catalog/` **source** isn't gitignored.

Related: [[strategy.md]], [[flakiness.md]]
