# Modelibr E2E Tests

End-to-end tests for Modelibr using Playwright with Cucumber/Gherkin syntax (via `playwright-bdd`).

## Quick Start

```bash
# Run all tests in Docker environment (recommended)
node run-e2e.js

# Run tests without Docker rebuild (faster, requires running containers)
npm run test:quick

# Run specific test by tag
npx playwright test --grep "@recycled-files"

# View test report
npx playwright show-report
```

## Project Structure

```
tests/e2e/
├── features/                    # Gherkin feature files (organized by feature area)
│   ├── 00-texture-sets/         # Texture set tests
│   ├── 01-model-viewer/         # Model viewer tests  
│   ├── 02-dock-system/          # Tab and dock management tests
│   ├── 03-upload-window/        # Upload history tests
│   └── 04-recycled-files/       # Recycle bin tests
├── steps/                       # Step definitions (TypeScript)
│   ├── shared-setup.steps.ts    # Common setup/teardown steps
│   ├── model-viewer.steps.ts    # Model viewer related steps
│   └── recycled-files.steps.ts  # Recycle bin steps
├── pages/                       # Page Object Models
│   └── ModelViewerPage.ts       # Model viewer interactions
├── fixtures/                    # Test fixtures and utilities
│   ├── unique-file-generator.ts # Creates unique test files
│   ├── db-helper.ts             # Database queries
│   ├── api-helper.ts            # API interactions
│   └── test.ts                  # Playwright fixtures setup
├── assets/                      # Test model files
│   ├── test-cube.glb            # GLB model file
│   ├── test-torus.fbx           # FBX model file
│   └── *.png                    # Texture files
├── data/                        # Temporary test data (auto-cleaned)
├── run-e2e.js                   # Main test runner script
└── docker-compose.e2e.yml       # Docker environment
```

## Writing E2E Tests

### 1. Create a Feature File

Feature files use Gherkin syntax. Place them in `features/XX-feature-name/`:

```gherkin
@depends-on:setup
Feature: My Feature Name

  Background:
    Given the following models exist in shared state:
      | name                |
      | single-version-model |

  Scenario: My test scenario
    Given I am on the model viewer page for "single-version-model"
    When I perform some action
    Then I should see expected result
```

### 2. Create Step Definitions

Step definitions go in `steps/`. Use TypeScript:

```typescript
import { Given, When, Then } from './fixtures/test';

When("I perform some action", async ({ page }) => {
    await page.click('.some-button');
    console.log("[Action] Button clicked");
});

Then("I should see expected result", async ({ page }) => {
    await expect(page.locator('.result')).toBeVisible();
    console.log("[UI] Result visible ✓");
});
```

### 3. Use Tags for Test Organization

| Tag | Purpose |
|-----|---------|
| `@setup` | Setup tests that run first |
| `@depends-on:setup` | Tests that need setup to complete first |
| `@three-js` | Tests that verify Three.js rendering |
| `@ui` | UI-only tests |
| `@recycled-files` | Recycle bin tests |

---

## Creating Unlimited Unique Models

The backend deduplicates files by content hash. To create truly unique models for test isolation, use `UniqueFileGenerator`.

### How It Works

```typescript
import { UniqueFileGenerator } from '../fixtures/unique-file-generator';

// Generate a unique copy of test-cube.glb
const uniquePath = await UniqueFileGenerator.generate('test-cube.glb');
// Returns: /path/to/data/abc123/test-cube.glb
```

### ⚠️ CRITICAL: File Format Rules

| File Type | Modification | Why |
|-----------|-------------|-----|
| **GLB** | ✅ Safe | JSON chunk modified with unique `extras` field |
| **FBX** | ❌ DO NOT MODIFY | Binary format - appending data corrupts the file |
| **OBJ** | ❌ DO NOT MODIFY | May break if comments added incorrectly |
| **GLTF** | ⚠️ Be careful | JSON file, could work but not tested |

### Current Behavior

```typescript
// unique-file-generator.ts
if (sourceFilename.toLowerCase().endsWith('.glb')) {
    // ✅ Safely modifies JSON chunk
    newBuffer = this.modifyGLBJson(originalBuffer, uniqueId);
} else {
    // Just copies - no modification for binary safety
    newBuffer = originalBuffer;
}
```

### Best Practice: Use GLB Files

For tests requiring unique files, prefer `.glb` format:
- `test-cube.glb` - Simple cube model
- More GLB assets can be added to `assets/`

### Creating New GLB Test Assets

1. Create model in Blender
2. Export as `.glb` (Binary glTF)
3. Place in `tests/e2e/assets/`
4. Use via `UniqueFileGenerator.generate('your-model.glb')`

---

## Useful Commands

### Running Tests

```bash
# Full test run with Docker (clean environment)
node run-e2e.js

# Quick test run (uses existing containers)
npm run test:quick

# Run specific feature file
npx playwright test features/04-recycled-files/

# Run tests matching tag
npx playwright test --grep "@setup"

# Run tests excluding tag
npx playwright test --grep-invert "@three-js"

# Run with headed browser (visible)
npx playwright test --headed

# Run with trace enabled for debugging
npx playwright test --trace on
```

### Docker Management

```bash
# Start containers manually
docker compose -f docker-compose.e2e.yml up -d --build

# View container logs
docker logs webapi-e2e
docker logs thumbnail-worker-e2e

# Stop and clean up
docker compose -f docker-compose.e2e.yml down -v
```

### Debugging

```bash
# View test report (HTML)
npx playwright show-report

# Run in debug mode
npx playwright test --debug

# Generate BDD specs without running
npx bddgen
```

---

## Test Database

Tests connect to PostgreSQL on port `5433` (not default 5432).

```typescript
// fixtures/db-helper.ts
// Default connection: localhost:5433
// Database: Modelibr
// User: modelibr

const db = new DbHelper();
await db.query('SELECT * FROM "Models" WHERE "Id" = $1', [modelId]);
```

---

## Shared State Between Tests

Tests share state via `SharedState`:

```typescript
import { sharedState } from '../fixtures/shared-state';

// Store model reference
sharedState.setModel('my-model', { id: 1, name: 'test-cube' });

// Retrieve model
const model = sharedState.getModel('my-model');
```

---

## Screenshot Capture

Take screenshots for debugging:

```typescript
Then("I take a screenshot named {string}", async ({ page }, name: string) => {
    await page.screenshot({ 
        path: `test-results/screenshots/${name}.png`,
        fullPage: false 
    });
});
```

---

## Three.js Scene Inspection

For model rendering tests, use the exposed Three.js scene:

```typescript
const meshCount = await page.evaluate(() => {
    const scene = window.__THREE_SCENE__;
    return scene?.children.filter(c => c.type === 'Mesh').length || 0;
});
```

---

## Common Pitfalls

### 1. Binary File Corruption
**Problem:** Appending text to binary files (FBX, OBJ) corrupts them.
**Solution:** Only modify GLB files via JSON chunk. Copy others as-is.

### 2. Version Dropdown Not Visible
**Problem:** Tests fail waiting for `.version-dropdown-trigger`.
**Solution:** Ensure model loaded correctly. Check if file is corrupted.

### 3. Database Connection Errors
**Problem:** Tests fail with pg-pool connection errors.
**Solution:** Ensure database is running on port 5433, not 5432.

### 4. Flaky Tests
**Problem:** Tests pass sometimes, fail other times.
**Solution:** Add `waitForLoadState('networkidle')` and explicit waits.

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `POSTGRES_HOST` | `localhost` | Database host |
| `POSTGRES_PORT` | `5433` | Database port |
| `POSTGRES_DB` | `Modelibr` | Database name |
| `POSTGRES_USER` | `modelibr` | Database user |
| `POSTGRES_PASSWORD` | `ChangeThis...` | Database password |

---

## Cleanup

The `run-e2e.js` script automatically cleans:
- `data/` directory (temporary test files)
- Docker containers and volumes
- Shared state file (`.shared-state.json`)

---

## For AI Agents

When writing new E2E tests:

1. **Check existing step definitions** before creating new ones
2. **Use `UniqueFileGenerator`** for tests that create models
3. **Only use GLB files** when unique content is needed
4. **Add console logs** like `[Action]`, `[UI]`, `[Navigation]` for debugging
5. **Use tags** to organize and filter tests
6. **Wait for elements** with explicit timeouts
7. **Check `docker logs`** if mysterious failures occur

---

## ⭐ E2E Test Best Practices

These practices ensure reliable, maintainable, and reviewable E2E tests.

### 1. Screenshots at Checkpoints for User Review

**Every test should capture screenshots at key checkpoints** so users can visually verify the test is working correctly.

```typescript
// Before/after pattern for state changes
ThenBdd("I take a screenshot before recycling", async ({ page }) => {
    await waitForThumbnails(page, "before recycling");
    await page.screenshot({ path: "test-results/recycle-before.png" });
    console.log("[Screenshot] Captured model list BEFORE recycling");
});

ThenBdd("I take a screenshot after recycling", async ({ page }) => {
    await waitForThumbnails(page, "after recycling");
    await page.screenshot({ path: "test-results/recycle-after.png" });
    console.log("[Screenshot] Captured model list AFTER recycling");
});
```

**When to capture screenshots:**
- Before/after any destructive or state-changing action
- After navigation to new pages
- When verifying UI elements are displayed correctly
- At key test milestones for human review

### 2. Wait for Thumbnails Before Screenshots

**Never capture screenshots without waiting for thumbnails to load.** Placeholder images make test reports useless for verification.

```typescript
// Helper function to wait for all visible thumbnails
async function waitForThumbnails(page: Page, context: string): Promise<void> {
    const thumbnailSelectors = [
        ".model-card-thumbnail img",
        ".recycled-item-thumbnail img",
        ".model-card img"
    ];
    
    for (const selector of thumbnailSelectors) {
        const images = page.locator(selector);
        const count = await images.count();
        
        if (count > 0) {
            for (let i = 0; i < count; i++) {
                const img = images.nth(i);
                await expect.poll(async () => {
                    const naturalWidth = await img.evaluate((el: HTMLImageElement) => el.naturalWidth);
                    return naturalWidth > 0;
                }, { timeout: 10000 }).toBe(true);
            }
            console.log(`[Thumbnail] All thumbnails loaded for ${context} ✓`);
            return;
        }
    }
}
```

### 3. Handle SignalR and Async State Updates

The frontend uses SignalR for real-time updates. **Don't assume state is immediately updated** after backend operations complete.

**Pattern: Poll UI until expected state appears**

```typescript
// Wait for thumbnail to appear via SignalR updates
await expect.poll(async () => {
    // Open dropdown to see current state
    await dropdownTrigger.click();
    await page.waitForTimeout(500);
    
    const imgCount = await thumbnail.count();
    if (imgCount > 0) {
        const naturalWidth = await thumbnail.evaluate((el: HTMLImageElement) => el.naturalWidth);
        if (naturalWidth > 0) return true;
    }
    
    // Toggle dropdown to trigger re-render
    await dropdownTrigger.click();
    await page.waitForTimeout(500);
    return false;
}, { 
    message: "Waiting for thumbnail to appear via SignalR",
    timeout: 30000 
}).toBe(true);
```

### 4. Database Polling for Backend State

When waiting for asynchronous backend operations (like thumbnail generation), **poll the database** rather than arbitrary timeouts.

```typescript
// Poll database for thumbnail status
const maxAttempts = 20;
for (let i = 0; i < maxAttempts; i++) {
    const result = await db.query(
        `SELECT t."Status" FROM "Thumbnails" t 
         JOIN "ModelVersions" mv ON mv."ThumbnailId" = t."Id"
         WHERE mv."VersionNumber" = $1`, [versionNumber]
    );
    
    if (result.rows[0]?.Status === 2) { // 2 = Ready
        console.log(`[DB] Thumbnail ready ✓`);
        break;
    }
    
    await page.waitForTimeout(3000);
}
```

### 5. Console Logging for Debugging

Use consistent log prefixes for easy filtering and debugging:

| Prefix | Use For |
|--------|---------|
| `[Setup]` | Test setup and initialization |
| `[Navigation]` | Page navigation |
| `[Action]` | User actions (clicks, inputs) |
| `[UI]` | UI verification |
| `[DB]` | Database operations |
| `[Thumbnail]` | Thumbnail loading status |
| `[Screenshot]` | Screenshot capture |
| `[Three.js]` | 3D scene verification |

### 6. Handle Cache-Busting URLs

The frontend adds cache-busting timestamps to URLs (`?t=123456`). **Strip query params when comparing URLs:**

```typescript
const stripQueryParams = (url: string | null) => url?.split('?')[0] || null;
expect(stripQueryParams(currentSrc)).toBe(stripQueryParams(savedSrc));
```

### 7. Retry Logic for Flaky Operations

Wrap potentially flaky operations in retry loops:

```typescript
async function getVersionThumbnailSrc(versionNumber: number): Promise<string | null> {
    const maxAttempts = 15;
    const pollInterval = 2000;
    
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        // Try to get thumbnail src
        const img = await page.locator("img.version-dropdown-thumb");
        if (await img.count() > 0 && await img.isVisible()) {
            const naturalWidth = await img.evaluate(el => el.naturalWidth);
            if (naturalWidth > 0) {
                return await img.getAttribute("src");
            }
        }
        
        console.log(`[Thumbnail] Retrying... (${attempt + 1}/${maxAttempts})`);
        await page.waitForTimeout(pollInterval);
    }
    
    return null;
}
```

### 8. Test Independence

Each test should be able to run independently:
- Use `UniqueFileGenerator` the create unique test files
- Don't rely on state from other tests (use `sharedState` explicitly)
- Clean up resources after tests

---

### Example: Creating a New Recycled Files Test

```gherkin
# features/04-recycled-files/my-new-test.feature
@depends-on:setup @my-tag
Feature: My New Feature

  Scenario: My test case
    Given I upload a unique model as "my-test-model"
    When I recycle the model "my-test-model"
    Then the model should appear in recycle bin
```

```typescript
// steps/my-steps.ts
Given("I upload a unique model as {string}", async ({ page }, alias: string) => {
    const filePath = await UniqueFileGenerator.generate('test-cube.glb');
    // ... upload logic
    sharedState.setModel(alias, { id, name });
});
```

