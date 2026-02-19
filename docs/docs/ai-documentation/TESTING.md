---
sidebar_position: 2
---

# Testing Documentation

Testing philosophy: Tests should be readable documentation, not just coverage metrics.

## Test Types

### E2E Tests (Primary Source of Truth)

**Location:** `tests/e2e/`

**Purpose:** Verify entire application flows work correctly across frontend, backend, and worker.

| Directory                              | What it tests                                                                                                                                                                                                                    |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `features/00-texture-sets/`            | Texture set creation, linking, defaults, EXR preview (2 scenarios), auto-generated thumbnail previews — API (RGB, per-channel for PNG & EXR, sprite) and UI (grid, texture types tab, files tab, sprites page) (9 scenarios)     |
| `features/01-model-viewer/`            | 3D rendering, version switching                                                                                                                                                                                                  |
| `features/02-dock-system/`             | Tab state management, deduplication, persistence, cross-panel tab independence (2 scenarios)                                                                                                                                     |
| `features/03-upload-window/`           | Progress tracking, batch uploads                                                                                                                                                                                                 |
| `features/04-recycled-files/`          | Soft delete, restore, permanent delete                                                                                                                                                                                           |
| `features/10-texture-set-kind.feature` | Kind tabs, creating with kind, changing kind via API, drag-drop between tabs, default tab, thumbnail auto-generation, context menu, regenerate action, tab persistence, API filtering, global texture file upload (14 scenarios) |

**Running E2E tests:**

```bash
cd tests/e2e
node run-e2e.js          # Full run with cleanup
npm run test:quick       # Quick run (existing containers)
```

**E2E conventions:**

- Uses Playwright + Cucumber (BDD)
- Feature files describe expected behavior
- Page objects abstract UI interactions
- SharedState passes data between scenarios
- **UI-based navigation only** — never use URL query params to set tab state. Use helpers from `tests/e2e/helpers/navigation-helper.ts` (`navigateToAppClean`, `navigateToTab`, `openTabViaMenu`, `openModelViewer`, etc.)
- Tab state is managed by a Zustand store persisted to localStorage (key: `modelibr_navigation`), not URL params
- Tabs render as icons only (no text labels). Identify tabs via `.draggable-tab:has(.pi-{icon})` selectors or `[data-pr-tooltip]` attributes
- See `tests/e2e/README.md` for full details

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
