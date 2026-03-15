---
sidebar_position: 2
---

# Testing Documentation

Testing philosophy: Tests should be readable documentation, not just coverage metrics.

## Test Types

### E2E Tests (Primary Source of Truth)

**Location:** `tests/e2e/`

**Purpose:** Verify entire application flows work correctly across frontend, backend, and worker.

| Directory                              | What it tests                                                                                                                                                                                                                                                                                                                                                                                                       |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `features/00-texture-sets/`            | Texture set creation, linking, defaults, EXR preview (2 scenarios), auto-generated thumbnail previews — API (RGB, per-channel for PNG & EXR, sprite) and UI (grid, texture types tab, files tab, sprites page) (9 scenarios)                                                                                                                                                                                        |
| `features/01-model-viewer/`            | 3D rendering, version switching                                                                                                                                                                                                                                                                                                                                                                                     |
| `features/02-dock-system/`             | Tab state management, deduplication, persistence, cross-panel tab independence (2 scenarios)                                                                                                                                                                                                                                                                                                                        |
| `features/03-upload-window/`           | Progress tracking, batch uploads                                                                                                                                                                                                                                                                                                                                                                                    |
| `features/04-recycled-files/`          | Soft delete, restore, permanent delete of models/versions/texture sets/sprites/sounds; file deletion real-time panel updates (`08-file-deletion-realtime.feature`); `RecycledFilesPage` supports left + right panel via `goto()` / `gotoInRightPanel()`; `refresh()` reloads page (Refresh button removed). Steps split into 5 domain files: `recycled-files-common`, `-models`, `-textures`, `-sprites`, `-sounds` |
| `features/10-texture-set-kind.feature` | Kind tabs, creating with kind, changing kind via API, drag-drop between tabs, thumbnail auto-generation, context menu, persistence, API filtering, global texture files (8 consolidated scenarios, down from 14)                                                                                                                                                                                                    |

**Running E2E tests:**

```bash
cd tests/e2e
node run-e2e.js          # Full run (setup + teardown Docker containers)
npm run test:quick       # Quick run (existing containers, two-phase execution)
```

**Two-phase execution:**

E2E tests use a two-phase approach for reliable parallel execution:

1. **Phase 1 — Setup** (`workers=1`, `PW_PHASE=setup`): Creates shared test data (models, texture sets) sequentially to avoid asset processor overload. State is persisted to `.setup-state.json` via the setup-state-bridge.
2. **Phase 2 — Chromium** (`workers=N`, no `PW_PHASE`): Runs fast test features in parallel using `N` workers. Tests tagged `@slow` are excluded.
3. **Phase 3 — Slow** (`workers=1`): Runs `@slow`-tagged tests sequentially to avoid asset-processor contention. Includes mixed-format-thumbnail, SignalR, blend-upload, and thumbnail auto-gen scenarios.

**Key files:**

| File                             | Purpose                                                                                                                        |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `run-e2e.js`                     | Cross-platform test runner with Docker lifecycle                                                                               |
| `global-setup.ts`                | Pre-test cleanup: in setup phase clears ALL entities; in chromium phase deletes all except bridge-protected ones               |
| `fixtures/setup-state-bridge.ts` | JSON file bridge for setup→chromium state transfer; exposes `loadAllPersistedModelIds()` and `loadAllPersistedTextureSetIds()` |
| `fixtures/shared-state.ts`       | Per-scenario state via `WeakMap<Page, ScenarioState>`                                                                          |
| `helpers/cleanup-helper.ts`      | Removes ALL unprotected models, texture sets, sprites and sounds before tests (prevents alphabetical-order pagination issues)  |

**E2E conventions:**

- Uses Playwright + Cucumber (BDD)
- Feature files describe expected behavior
- Page objects abstract UI interactions
- SharedState passes data between scenarios
- **UI-based navigation only** — never use URL query params to set tab state. Use helpers from `tests/e2e/helpers/navigation-helper.ts` (`navigateToAppClean`, `navigateToTab`, `openTabViaMenu`, `openModelViewer`, etc.)
- Tab state is managed by a Zustand store persisted to localStorage (key: `modelibr_navigation`), not URL params
- Tabs render as icons only (no text labels). Identify tabs via `.draggable-tab:has(.pi-{icon})` selectors or `[data-pr-tooltip]` attributes
- See `tests/e2e/README.md` for full details

**E2E common pitfalls:**

- **Two-phase execution**: Setup must run with `PW_PHASE=setup` and `PW_WORKERS=1` before chromium tests. The setup phase creates data and persists IDs to `.setup-state.json`. Without this, auto-provisioning falls back to DB queries that may pick the wrong model.
- **Always add a `Background:` section** to every feature file. Without it, the page starts at `about:blank` and UI steps will timeout. Minimum background: `Given I am on the model list page`.
- **Pagination: use search before finding a card** — Texture sets are sorted alphabetically (A-Z), and each kind tab shows max 50 per page. As test data accumulates across runs, newly created sets may fall beyond page 50. Always fill the `.search-input` box before asserting card visibility:
    ```typescript
    const searchInput = page.locator(".search-input");
    if (await searchInput.isVisible({ timeout: 3000 })) {
        await searchInput.clear();
        await searchInput.fill(setName);
        await page.waitForTimeout(500);
    }
    // Remember to clear search after to avoid affecting subsequent steps
    ```
- **Default Texture Sets tab is Global Materials** — API-created texture sets default to Model-Specific (`kind = 0`). After opening the Texture Sets panel, always switch to the Model-Specific tab before searching for newly created sets.

---

### Backend Unit Tests

**Location:** `tests/Domain.Tests/`, `tests/Application.Tests/`

**Purpose:** Test business logic in isolation.

**Running:**

```bash
dotnet test --no-build  # Avoids Azure.Core timeout issue
```

---

### Frontend Unit Tests

**Location:** `src/frontend/src/**/__tests__/`

**Purpose:** Test component behavior and utilities.

**Running:**

```bash
cd src/frontend
npm test
```

---

### Storybook Visual Regression Tests

**Location:** `src/frontend/visual-tests/`

**Purpose:** Catch unintended UI changes by comparing screenshots of every Storybook story against baseline snapshots. Uses Playwright's `toHaveScreenshot()` for pixel-level diffing.

**Prerequisites:**

```bash
cd src/frontend
npx playwright install chromium   # One-time browser install
npm run build-storybook            # Build static Storybook
```

**Running:**

```bash
cd src/frontend
npm run test-storybook             # Run visual regression tests
npm run test-storybook:update      # Update baseline snapshots after intentional UI changes
npm run test-storybook:ci          # CI mode (GitHub reporter, no server reuse)
```

**How it works:**

1. Storybook is built to `storybook-static/`
2. `http-server` serves the static build on port 6007
3. Playwright reads `/index.json` to auto-discover all stories
4. Each story is rendered in isolation and screenshotted
5. Screenshots are compared against baselines in `visual-tests/__snapshots__/`

**Config:** `src/frontend/playwright.config.ts`

---

### Blender Addon Tests

**Location:** `blender-addon/tests/`

**Purpose:** Test addon API client, utilities, and flows.

| Type       | Location                    |
| ---------- | --------------------------- |
| Unit tests | `blender-addon/tests/unit/` |
| E2E tests  | `blender-addon/tests/e2e/`  |

**Running:**

```bash
cd blender-addon/tests
python run_tests.py
```

---

## Test Philosophy

- **Tests are documentation** - They show expected behavior
- **Granular scenarios** - Each scenario tests one thing
- **Avoid over-testing** - Don't add tests just for coverage
- **Challenge bad tests** - Remove tests that clutter without value
- **E2E tests are source of truth** - Use them to understand features

---

## E2E Test Features

### Blend Upload Tests (`features/15-blend-upload/`)

Tests .blend file upload via WebDAV and REST API. Requires `ENABLE_BLENDER=true` in `docker-compose.e2e.yml` for both `webapi-e2e` and `asset-processor-e2e`.

**Scenarios tested:**

- New model via WebDAV PUT
- New model via POST /models (REST API)
- New version via WebDAV Safe Save (PUT temp + MOVE)
- New version via POST `/models/{id}/versions`
- Dedup: same .blend hash across models returns existing model
- Dedup: same content re-saved to same model skips version creation
- **Multi-file simultaneous WebDAV upload**: 3 unique `.blend` files PUT concurrently → 3 separate models created, each with 1 version, `.blend` file, and thumbnail

**Key infrastructure:**

- `UniqueFileGenerator` supports `.blend` files by appending a unique trailing marker after the ENDB block
- `ApiHelper` has WebDAV simulation methods: `createModelViaWebDavBlend()`, `createVersionViaWebDavBlendSave()`, `createModelVersion()`
- Thumbnail generation is verified by polling `GET /models/{id}/thumbnail` with a 5s interval
- `ApiHelper.softDeleteModel(id)` and `softDeleteModelsByName(name)` clean up stale models before blend tests run to prevent version accumulation

### Data Accumulation Patterns

When tests run repeatedly without a full teardown/setup cycle, stale data accumulates. The following patterns are in place to handle this:

**Global cleanup (`global-setup.ts` + `helpers/cleanup-helper.ts`)**

Before every test phase, the global setup deletes **all** accumulated entities that are not protected by the bridge:

- `cleanupStaleModels(protectedIds)` — deletes ALL models except bridge-protected ones (setup phase: no protection; chromium phase: protects the 4 setup-created models). This prevents Status=3 blend-model thumbnails from polluting the `version {int} should have a thumbnail image` DB query.
- `cleanupStaleTextureSets(protectedIds)` — deletes ALL texture sets except bridge-protected (blue_color, red_color). Previously, 247+ sets filled the 50-item alphabetical page, making freshly created search items invisible.
- `cleanupStaleSprites()` — deletes ALL sprites. Previously 73+ sprites caused the same pagination problem.
- `cleanupStaleSounds()` — deletes ALL sounds.

This ensures that at the start of every test run the DB contains only the 4 bridge models + 2 bridge texture sets from setup, so newly created items are always within the first 50 alphabetically.

**Infinite Scroll — Load More before asserting card visibility**

Sounds and sprites use infinite scroll (50 items per page). When accumulated items push a target card beyond page 1, `[data-sound-id="N"]` or `[data-sprite-id="N"]` will not be in the DOM. Steps that open a sound by ID (e.g. `I open the sound {string} for viewing`) now click the **"Load More"** button in a loop until the card is visible or there are no more pages:

```typescript
const loadMoreSelector = 'button:has-text("Load More")';
while (!(await soundCard.isVisible().catch(() => false))) {
    const loadMoreBtn = page.locator(loadMoreSelector).first();
    if (!(await loadMoreBtn.isVisible().catch(() => false))) break;
    await loadMoreBtn.click();
    await page.waitForTimeout(500);
}
await expect(soundCard).toBeVisible({ timeout: 10000 });
```

`SoundListPage.clickSoundById()` uses the same pattern. Add this wherever `[data-sound-id]` or `[data-sprite-id]` selectors are used with `.toBeVisible()`.

**Per-test patterns:**

- **Blend upload tests**: `blend-upload.steps.ts` calls `softDeleteModelsByName` before creating via WebDAV to prevent version accumulation.
- **Project CRUD tests**: `ProjectsPage.createProject` deletes all existing projects with the same name via API before creating fresh, ensuring the new card is always rendered in the list.
- **Stage CRUD tests**: `stages.steps.ts` navigates to the stages page before calling `isStageVisible`, ensuring the check has correct DOM context. `.first()` is used on all stage card locators to handle duplicate stages in data-accumulated state gracefully.
- **Multi-version-model bridge validation**: `shared-setup.steps.ts` validates that version 1 of `multi-version-model` has files; if not (from partial setup runs), it uploads `test-torus.fbx` to recover. **After the upload it polls the DB for thumbnail Status=2 (up to 120 s) before continuing**, so the downstream version-switching tests don't need to wait.

### Thumbnail Step Scoping

The `version {int} should have a thumbnail image` step in `model-viewer.steps.ts` scopes its DB poll to the **currently open model** (resolved via `ModelViewerPage.getCurrentModelId()` from localStorage). Without scoping, accumulated models with Status=3 thumbnails (e.g. blend-upload artifacts) shadowed the correct Status=2 rows for the same `VersionNumber`, causing the poll to never terminate.

### Scenario Timeouts

Several scenarios override the default 90 s test timeout via the `@timeout:VALUE` BDD tag (handled natively by playwright-bdd v7):

| Scenario                                                                               | Tag               | Reason                                               |
| -------------------------------------------------------------------------------------- | ----------------- | ---------------------------------------------------- |
| `Create model with two versions` (`01-setup.feature`)                                  | `@timeout:720000` | FBX thumbnail generation cold-start can take > 4 min |
| `Version dropdown shows all versions with thumbnails` (`02-version-switching.feature`) | `@timeout:300000` | Recovery path uploads FBX and waits for thumbnail    |
| Various texture-set and blend tests                                                    | `@timeout:720000` | Asset-processor thumbnail generation latency         |

### Slow Test Files and Worker Count

Slow tests are tagged `@slow` and run in a dedicated `slow` Playwright project (workers=1, timeout=720s):

| File                                                | Tag   | Typical duration | Why slow                                                 |
| --------------------------------------------------- | ----- | ---------------- | -------------------------------------------------------- |
| `00-texture-sets/12-mixed-format-thumbnail.feature` | @slow | ~10 min          | Polls API up to 600 s for thumbnail with mixed PNG + EXR |
| `08-signalr/01-signalr-notifications.feature`       | @slow | ~6 min           | Waits for real SignalR `ThumbnailStatusChanged` event    |
| `15-blend-upload/blend-upload.feature`              | @slow | ~8 min           | Blender .blend → .glb conversion + thumbnail             |
| `10-texture-set-kind.feature` (scenario 5)          | @slow | ~4 min           | Thumbnail auto-gen on kind change to Universal           |

**Three Playwright projects**: `setup` (workers=1, sequential), `chromium` (workers=3, fast tests), `slow` (workers=1, sequential). The `chromium` project excludes `@slow` tests via `grepInvert`.

```
workers: 3  # chromium project — run-e2e.js, package.json test:quick
workers: 1  # slow project — sequential to avoid asset-processor contention
```

A **nightly workflow** (`.github/workflows/nightly-e2e.yml`) runs slow tests independently at 3 AM UTC daily.

**DB sharding** (per-worker database isolation) is not implemented. The Docker e2e stack uses a single WebAPI + single PostgreSQL container, so per-worker DB routing would require N WebAPI+DB container pairs — impractical overhead. The existing `PARALLEL_DB` / `resolveDatabaseName()` stub in `db-helper.ts` only scopes direct DB queries; it has no effect on the API. The Load More loop in step files and global cleanup before each phase are the correct mitigations for data accumulation.

### Intermittent Thumbnail Failures

Thumbnail-related tests (`texture set thumbnail previews`, `version dropdown with thumbnails`) may fail intermittently when the Blender/asset-processor worker is under load or exits abnormally (`exitCode: null`). These are infrastructure-level flaky tests, not code bugs. Running the tests in isolation (`--grep "thumbnail"`) after a cool-down usually passes.
