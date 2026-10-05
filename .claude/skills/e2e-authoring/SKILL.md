---
name: e2e-authoring
description: Writing and editing Modelibr Playwright-BDD E2E tests - execution phases/tags, self-provisioning data, shared state, unique file generation, page objects, selector priority, reload policy. Use when creating or editing anything under tests/e2e (features, steps, pages, fixtures). For diagnosing failures use test-triage instead.
---

# E2E authoring (Playwright + playwright-bdd, Gherkin)

Frontend :3002 · API :8090 · worker :3003 · Postgres :5433 (`tests/e2e/docker-compose.e2e.yml`).

## Phases and tags - tags decide WHERE a scenario runs

Projects in `playwright.config.ts`, run as sequential phases:

1. `setup` (workers=1) - `@setup` scenarios seed shared data, always first.
2. `chromium` (parallel) - everything untagged. **Untagged = runs on every GitHub PR.**
3. `serial` (workers=1) - `@serial` (asset-processor/DB contention). **Local-only.**
4. `slow` (workers=1, 12-min timeout) - `@slow` (Blender renders). GitHub nightly only.
5. `performance` - `@performance`, opt-in only. (A separate demo phase tests the
   demo build.)

Tag honestly: adding `@serial`/`@slow` removes the scenario from PR protection -
always add a source comment with the root cause. Feature folders are numbered
(`00-texture-sets/` …) to control ordering.

**No render-blocking steps on the PR lane.** Setup and untagged scenarios run on
GitHub's GPU-less runners on every PR, so neither may wait for real
asset-processor renders (thumbnail "Ready" DB polls, loaded-thumbnail image
asserts) - those timed out at 4 minutes on PR CI. Render assertions live in
`@serial`/`@slow`; client-side canvas mounts under software WebGL are allowed but
need generous waits with a comment naming what they absorb.

## Running

- Whole suite incl. Docker lifecycle: `npm test` (in `tests/e2e/`); reuse a
  running stack with `npm run test:quick`.
- One scenario: `npx bddgen && npx playwright test --grep "<name>" --no-deps`
  (seed first with `PW_WORKERS=1 npx playwright test --project=setup`).
- Artifact env knobs: `PW_VIDEO`, `PW_TRACE`, `PW_SCREENSHOT`, `PW_RETRIES`,
  `PW_HEADED`, `PW_WORKERS`, `PW_TEST_TIMEOUT` (per-test ms, default 90s to
  absorb Puppeteer cold-start). Default trace `on-first-retry`; force with
  `PW_TRACE=on`.
- Phase worker counts come from `run-e2e.js` (chromium currently 3 local AND CI -
  4 caused contention); trust it over the stale comment in `playwright.config.ts`.
- **`--no-deps` runs are for iterating, never for sign-off.** The full parallel
  suite surfaces accumulated state, overlay/starvation and cross-worker duplicate
  failures isolation cannot. **Run `run-e2e.js` before claiming e2e green.** An
  EADDRINUSE in the demo phase is usually a stale `vite preview` on :3004.

Reading results/traces and triaging failures: use the `test-triage` skill.

## Data and state

- Every `Given` self-provisions through the app; never rely on pre-seeded data.
- Uploads MUST use `UniqueFileGenerator.generate(filename)`
  (`tests/e2e/fixtures/unique-file-generator.ts`) - SHA256 dedup collapses
  identical files otherwise. Safe-to-mutate: GLB, PNG, WAV; treat FBX/OBJ as
  copy-only.
- Pass created identifiers between steps with `getScenarioState(page)`
  (`fixtures/shared-state.ts`) - per-Page WeakMap, no cross-worker pollution.
- Use `@depends-on:<setup-id>` to declare seeded-data dependencies.

## Page objects & selectors

- Page objects live in `tests/e2e/pages/` (fluent Playwright API, explicit
  stability waits for hydration/SignalR - page-object `expect()` as a stability
  wait is a deliberate convention). Extend these, not locators in steps.
- **Contract for NEW selectors:** `data-testid` (format
  `{component}-{element}-{variant?}`; add it to the component if missing) or
  `getByRole` where semantics fit. ~950 legacy CSS-class locators
  (`.model-card`, `.p-dialog`, …) are **grandfathered, do not add more**;
  `.p-*` is the accepted exception for PrimeReact body-mounted overlays.
- Grids are virtualized - wait for the specific card/locator, never assume all
  items are rendered.

## Waits & control flow (the flake rules)

- **Web-first assertions are the default**: `await
expect(locator).toBeVisible()/toHaveText()/toHaveCount()` - they retry.
  `waitForSelector` is legacy; don't write new ones.
- **No `waitForTimeout`.** A "let React settle" sleep means the NEXT assertion
  should be a retrying web-first one. Fixed intervals inside an explicit bounded
  poll loop are the one exception; any surviving sleep needs a comment naming the
  race it absorbs.
- **No branching on app state** (`if (await x.isVisible())` deciding the path) -
  the Given must produce ONE known state; fix provisioning instead. Idempotent
  cleanup is fine but must be a named helper, not inline conditionals.
- For endpoint-coupled actions, scope the wait to the exact request
  (`waitForResponse` matched to method+path), not generic loading states.

## Reload & quality

Avoid `page.reload()` when the UI updates reactively (SignalR, query
invalidation); when unavoidable use `{ waitUntil: "domcontentloaded" }`.
One behavior per scenario; no placeholder assertions (a `Then` must assert the
behavior the scenario names, not just that a container rendered); verify
full-stack at every relevant layer (UI + API + DB). Scenario names are grep keys
and history identity - keep them stable.
