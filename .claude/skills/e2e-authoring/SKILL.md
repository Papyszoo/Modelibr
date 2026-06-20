---
name: e2e-authoring
description: Writing and editing Modelibr Playwright-BDD E2E tests — execution phases/tags, self-provisioning data, shared state, unique file generation, page objects, selector priority, reload policy. Use when creating or editing anything under tests/e2e (features, steps, pages, fixtures). For diagnosing failures use test-triage instead.
---

# E2E authoring (Playwright + playwright-bdd, Gherkin)

## Environment (Docker, `tests/e2e/docker-compose.e2e.yml`)
Frontend `localhost:3002` · API `localhost:8090` · worker `localhost:3003` ·
Postgres `localhost:5433`.

## Phases and tags — tags decide WHERE a scenario runs
Projects in `playwright.config.ts`, run as sequential phases:
1. `setup` (workers=1) — `@setup` scenarios seed shared data, always first.
2. `chromium` (parallel) — everything untagged. **Untagged = runs on every GitHub PR.**
3. `serial` (workers=1) — `@serial` (asset-processor/DB contention). **Local-only —
   never runs on GitHub.**
4. `slow` (workers=1, 12-min timeout) — `@slow` (Blender renders). GitHub nightly only.
5. `performance` — `@performance`, opt-in only. (A separate demo phase tests the
   demo build.)

Tag honestly: adding `@serial`/`@slow` removes the scenario from PR protection —
always add a source comment with the root cause (see existing examples). Feature
folders are numbered (`00-texture-sets/` …) to control ordering.

## Running
- Whole suite incl. Docker lifecycle: `npm test` (in `tests/e2e/`); reuse a running
  stack with `npm run test:quick`.
- One scenario while iterating:
  `npx bddgen && npx playwright test --grep "<scenario name>" --no-deps`
  (seed first with `PW_WORKERS=1 npx playwright test --project=setup`).
- Artifact env knobs: `PW_VIDEO`, `PW_TRACE`, `PW_SCREENSHOT`, `PW_RETRIES`,
  `PW_HEADED`, `PW_WORKERS`. Default trace is `on-first-retry`; force capture on a
  single run with `PW_TRACE=on` (or `retain-on-failure`).

## Results & traces (read your own run output)
A machine-readable **JSON report** (`status`, `error.message`, `attachments[]`)
is emitted at `tests/e2e/test-results/results.json` for both run paths — grep it
for `"status":"failed"` / `"error"` to find the failing spec + message without a
browser. (Demo config → `test-results/demo-results.json`.)

**Artifact location depends on HOW you ran** — this trips people up:

- **Direct run** (`npx bddgen && npx playwright test --grep ...`): per-failure
  artifacts in `tests/e2e/test-results/<test-dir>/` — `error-context.md` (page
  a11y snapshot at failure; note it does NOT contain the error message),
  `test-failed-1.png`, `video.webm`, `trace.zip`.
- **Full run** (`npm test` → blob phases merged via `playwright.merge.config.ts`):
  `test-results/` is cleared, so there are NO per-test dirs. Instead:
  `playwright-report/index.html` (merged) embeds the full report, and per-test
  artifacts (incl. traces) land as hashed files under `playwright-report/data/`,
  referenced from `results.json` `attachments[].path`. To read the report JSON
  without a browser, the merge now also writes `test-results/results.json`
  directly — use that.

Inspecting a `trace.zip`:
- GUI: `cd tests/e2e && npx playwright show-trace <path>`.
- Headless/agent: `unzip -o trace.zip -d /tmp/tr` then grep the `*.trace` files
  (JSONL) — the failure is an `"error":{"message": ...}` entry (e.g. a strict-mode
  locator violation or a failed `expect`). The `error-context.md` alone is often
  not enough; the trace is where the actual error lives.

For deeper triage (history, regression-vs-long-broken, infra signatures) use the
`test-triage` skill.

## Data and state
- Every `Given` self-provisions its resources through the app; never rely on
  manually pre-seeded data.
- Uploads MUST use `UniqueFileGenerator.generate(filename)`
  (`tests/e2e/fixtures/unique-file-generator.ts`) — SHA256 dedup collapses
  identical files across scenarios otherwise. Safe-to-mutate formats: GLB, PNG,
  WAV; treat FBX/OBJ as copy-only.
- Pass created identifiers between steps with `getScenarioState(page)`
  (`fixtures/shared-state.ts`) — per-Page WeakMap, no cross-worker pollution.
- Use `@depends-on:<setup-id>` to declare seeded-data dependencies.

## Page objects & selectors
- Page objects live in `tests/e2e/pages/` (fluent Playwright API, explicit
  stability waits for React hydration and SignalR events). Extend these rather
  than putting locators in steps.
- Selector priority: `getByRole` → `data-testid` → `#id`; avoid CSS classes.
  `data-testid` format: `{component}-{element}-{variant?}`.
- Grids are virtualized — wait for the specific card/locator, never assume all
  items are rendered (see past `fix(e2e)` commits for hardened wait patterns).

## Reload policy
Avoid `page.reload()` when the UI updates reactively (SignalR, query
invalidation); when unavoidable use `{ waitUntil: "domcontentloaded" }`.

## Quality bar
One behavior per scenario; no placeholder assertions; verify full-stack flows at
every relevant layer (UI + API + DB), not just one. Scenario names are grep keys
and history identity — keep them stable.
