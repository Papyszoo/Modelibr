---
description: "Expert in Modelibr E2E testing using Playwright-BDD and Docker Compose."
tools:
    [
        "vscode",
        "execute",
        "read",
        "edit",
        "search",
        "agent",
        "copilot-container-tools/*",
        "github/*",
        "playwright/*",
        "todo",
        "ms-ossdata.vscode-pgsql/pgsql_query",
    ]
---

# Modelibr E2E Testing Agent

> **Prerequisites**: Read `.github/copilot-instructions.md` for core rules. This agent adds E2E-specific guidance.

Specializes in Playwright-BDD E2E tests for Modelibr. Tests should be **short, focused, and human-readable**.

## When to Use This Agent

Use `@e2e` when:

- Writing new E2E test scenarios
- Fixing broken or flaky E2E tests
- Adding `data-testid` attributes to UI components for testability
- Debugging test failures (check `test-results/error-context.md` first)
- Running the E2E test suite

Do NOT use for unit tests, integration tests, or non-test code changes.

---

## Test Design Principles

### Structure

- **One behavior per scenario**: Granular, focused tests
- **Dependencies via tags**: `@setup` for setup scenarios, `@depends-on:setup` for dependent tests
- **Shared state**: Use `sharedState` fixture to pass data between scenarios
- **Page Objects**: Use dedicated page objects for UI interactions

### Verification — Every Test Must Verify Through Multiple Layers

- **UI**: Visual confirmation of changes
- **API**: Direct API response validation (not just UI)
- **Database**: Data persistence checks via `dbHelper` fixture
- **NEVER** use `expect(true).toBe(true)` or similar no-op assertions
- **NEVER** use `page.reload()` to mask SignalR/real-time update failures
- **NEVER** bypass UI by calling REST API directly when the test should exercise UI behavior

### Selectors — Priority Order

1. **BEST**: `getByRole('button', { name: '...' })` — accessible, stable
2. **GOOD**: `[data-testid="..."]` — explicit test hook
3. **ACCEPTABLE**: `#elementId` — HTML ID
4. **AVOID**: CSS class selectors (`.p-dialog input`) — fragile

### data-testid Format

`{component}-{element}-{variant?}` (e.g., `category-dialog-save`, `version-dropdown-item-1`)

---

## Environment

### Docker Compose — Always Use E2E Config

```bash
cd tests/e2e
docker compose -f docker-compose.e2e.yml up -d --build
```

### Ports (Isolated from Development)

| Service    | Port | URL                   |
| ---------- | ---- | --------------------- |
| WebApi     | 8090 | http://localhost:8090 |
| Frontend   | 3002 | http://localhost:3002 |
| PostgreSQL | 5433 | localhost:5433        |
| Worker     | 3003 | http://localhost:3003 |

### Running Tests

```bash
cd tests/e2e
npm run test:setup                       # Start Docker + wait for health
npm run test:quick                       # Run ALL tests (existing containers)
npm run test:quick -- --grep "Sprite"    # Run only tests matching pattern
npx bddgen && npx playwright test <file> # Run a specific spec file
npm run test:teardown                    # Stop containers + clean volumes
npm run test:e2e                         # Full run (setup → all tests → teardown)
npm run test:report                      # Open HTML report
```

### Running Only Related Tests (Preferred)

When fixing or writing tests, **run only the affected test files**, not the full suite.

```bash
# By spec file path (after bddgen):
npx bddgen && npx playwright test .features-gen/features/07-sprites/

# By grep pattern on test title:
npx bddgen && npx playwright test --grep "SignalR|Shared File"
```

### Cleanup

```bash
npm run test:teardown
# Or manually:
cd tests/e2e
docker compose -f docker-compose.e2e.yml down -v
Remove-Item -Recurse -Force ./data   # Windows
rm -rf ./data                         # Linux/Mac
```

---

## File Organization

```
tests/e2e/
├── features/              # Gherkin feature files
│   ├── health-check.feature
│   ├── 00-texture-sets/   # Numbered for execution order
│   │   ├── 01-setup.feature
│   │   └── 02-crud.feature
├── pages/                 # Page objects
├── steps/                 # Step definitions
├── fixtures/              # shared-state, db-helper, signalr-helper, unique-file-generator
├── helpers/               # api-helper, docker-helper
└── assets/                # Test files (.glb, .fbx, .png)
```

### Test Assets

- **Models**: `test-cube.glb`, `test-cone.fbx`, `test-cylinder.fbx`, `test-icosphere.fbx`, `test-torus.fbx`
- **Textures**: `blue_color.png`, `red_color.png`, `green_color.png`, `yellow_color.png`, `pink_color.png`, `black_color.png`
- **Sounds**: `test-tone.wav`
- **WARNING**: FBX/OBJ are binary — modifying them will corrupt. GLB, PNG, and WAV are all supported by UniqueFileGenerator.
- **ALWAYS** verify assets exist before referencing: `ls tests/e2e/assets/`

### File Uniqueness — MANDATORY

The server uses SHA256 hash-based file deduplication. Uploading the same file twice returns the existing record instead of creating a new one. **Always use `UniqueFileGenerator.generate(filename)` when uploading any file** to ensure each upload produces a unique hash.

```typescript
import { UniqueFileGenerator } from "../fixtures/unique-file-generator";

// ✅ Correct — always generate unique file
const filePath = await UniqueFileGenerator.generate("blue_color.png");
await page.locator("input[type='file']").setInputFiles(filePath);

// ❌ Wrong — reuses static file, deduplication prevents new record
const filePath = path.join(__dirname, "..", "assets", "blue_color.png");
```

Supported formats:

- **GLB**: Injects unique `extras` into JSON chunk (spec-compliant)
- **PNG**: Injects unique `tEXt` metadata chunk before IEND (spec-compliant)
- **WAV**: Appends unique RIFF sub-chunk (parsers skip unknown chunks)
- **FBX/OBJ**: Copies without modification (binary formats cannot be safely altered)

### Self-Provisioning — MANDATORY

Every `Given` step that checks for existence must **create the resource via API if not found**. Never throw an error saying "upload it first" — auto-provision instead.

```typescript
// ✅ Correct — auto-provisions if missing
Given("the sprite {string} exists in shared state", async ({ page }, name) => {
    let sprite = sharedState.getSprite(name);
    if (!sprite) {
        // Look up via API, or create via API if not found
        const uniqueFile = await UniqueFileGenerator.generate("blue_color.png");
        // ... create via POST /sprites/with-file ...
    }
});

// ❌ Wrong — throws if not found (breaks test isolation)
if (!sprite) throw new Error("Upload it first.");
```

---

## Shared State

```typescript
// Store after creation
sharedState.saveModel("my-model", { id: modelId, name: fileName });

// Retrieve (throws if missing)
const model = sharedState.getModel("my-model");
```

```gherkin
# Setup creates data
@setup
Feature: Create Models
  Scenario: Upload model
    When I upload "test-cube.glb" and store it as "my-model"

# Dependent test verifies prerequisite exists
@depends-on:setup
Feature: Model Behavior
  Background:
    Given the following models exist in shared state:
      | name     |
      | my-model |
```

---

## URL Patterns

The app uses query parameter routing:

```typescript
// ✅ Correct — query params
await page.goto(
    "http://localhost:3002/?leftTabs=modelList,textureSets&activeLeft=textureSets",
);

// ❌ Wrong — path-based (old format)
await page.goto("http://localhost:3002/models/1");
```

---

## Debugging Failures

1. Check `test-results/*/error-context.md` for page snapshots
2. Check screenshots in test results
3. Check API logs: `docker logs webapi-e2e`
4. Test API directly: `curl http://localhost:8090/health`

| Issue                    | Solution                                                     |
| ------------------------ | ------------------------------------------------------------ |
| 500 errors               | Check webapi logs, verify DB connectivity                    |
| Selector not found       | Check error-context.md for actual DOM, use `getByRole()`     |
| Unique constraint errors | Clean DB: `docker compose -f docker-compose.e2e.yml down -v` |
| Port already allocated   | Stop conflicting containers                                  |
