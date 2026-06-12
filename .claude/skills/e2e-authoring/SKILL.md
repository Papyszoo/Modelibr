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
  `PW_HEADED`, `PW_WORKERS`.

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
