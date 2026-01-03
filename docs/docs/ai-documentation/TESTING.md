---
sidebar_position: 2
---

# Testing Documentation

Testing philosophy: Tests should be readable documentation, not just coverage metrics.

## Test Types

### E2E Tests (Primary Source of Truth)

**Location:** `tests/e2e/`

**Purpose:** Verify entire application flows work correctly across frontend, backend, and worker.

| Directory | What it tests |
|-----------|---------------|
| `features/00-texture-sets/` | Texture set creation, linking, defaults |
| `features/01-model-viewer/` | 3D rendering, version switching |
| `features/02-dock-system/` | Tab URL sync, deduplication |
| `features/03-upload-window/` | Progress tracking, batch uploads |
| `features/04-recycled-files/` | Soft delete, restore, permanent delete |

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

| Type | Location |
|------|----------|
| Unit tests | `blender-addon/tests/unit/` |
| E2E tests | `blender-addon/tests/e2e/` |

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
