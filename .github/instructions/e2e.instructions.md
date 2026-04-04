---
name: "Modelibr E2E Instruction"
description: "Use when editing Modelibr end-to-end tests under tests/e2e. Covers execution phases, self-provisioning setup, shared state, unique test assets, selector priorities, and full-stack verification."
applyTo: "tests/e2e/**"
---

# E2E Reminders

- Read `.github/skills/e2e-testing/SKILL.md` before editing tests, step definitions, or page objects.

## Execution Phases

Tests run in four sequential phases via `node run-e2e.js`:

1. **setup** (workers=1): `@setup` scenarios create shared test data. Runs first.
2. **chromium** (workers=2-4): Standard parallel tests. Excludes `@setup`, `@slow`, `@serial`, `@performance`.
3. **serial** (workers=1): `@serial` scenarios that need sequential execution (asset-processor contention).
4. **slow** (workers=1): `@slow` scenarios (Blender rendering, 12min timeout).

Each phase depends on the previous. Feature files are numbered (`00-texture-sets/`, `01-model-viewer/`, etc.) to control execution order within phases.

## Running Tests

- **Full validation**: `cd tests/e2e && npm run test` — handles Docker lifecycle, all four phases, report merge.
- **Quick re-run** (containers already running): `cd tests/e2e && npm run test:quick` — skips Docker up/down.
- **Focused debugging**: `npx bddgen && npx playwright test ...` only while iterating on a specific scenario group.

## Data and State

- Use `UniqueFileGenerator.generate(filename)` for uploaded assets so SHA256 deduplication does not collapse scenarios.
- Use `getScenarioState(page)` from `fixtures/shared-state.ts` to pass created identifiers between steps. State is per-Page (WeakMap), no cross-worker pollution.
- Every `Given` step must self-provision required resources. Never depend on manual pre-seeded data.

## Page Objects

- Twelve page objects under `tests/e2e/pages/` follow OOP + fluent Playwright API pattern.
- Include explicit stability waits for React hydration and SignalR events.

## Selectors

- Prefer `getByRole` → `data-testid` → `#id`. Avoid CSS class selectors.
- Format `data-testid` values as `{component}-{element}-{variant?}`.

## page.reload()

- Discouraged if the UI can update reactively (SignalR, query invalidation).
- Tolerated when no reactive path exists. Use `{ waitUntil: "domcontentloaded" }` when reloading.
