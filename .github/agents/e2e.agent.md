---
description: "Expert in Modelibr E2E testing using Playwright-BDD and Docker Compose."
tools:
    [
        "vscode",
        "execute",
        "read",
        "edit",
        "search",
        "web",
        "agent",
        "copilot-container-tools/*",
        "github/*",
        "playwright/*",
        "github.vscode-pull-request-github/copilotCodingAgent",
        "github.vscode-pull-request-github/issue_fetch",
        "github.vscode-pull-request-github/suggest-fix",
        "github.vscode-pull-request-github/searchSyntax",
        "github.vscode-pull-request-github/doSearch",
        "github.vscode-pull-request-github/renderIssues",
        "github.vscode-pull-request-github/activePullRequest",
        "github.vscode-pull-request-github/openPullRequest",
        "ms-ossdata.vscode-pgsql/pgsql_listServers",
        "ms-ossdata.vscode-pgsql/pgsql_connect",
        "ms-ossdata.vscode-pgsql/pgsql_disconnect",
        "ms-ossdata.vscode-pgsql/pgsql_open_script",
        "ms-ossdata.vscode-pgsql/pgsql_visualizeSchema",
        "ms-ossdata.vscode-pgsql/pgsql_query",
        "ms-ossdata.vscode-pgsql/pgsql_modifyDatabase",
        "ms-ossdata.vscode-pgsql/database",
        "ms-ossdata.vscode-pgsql/pgsql_listDatabases",
        "ms-ossdata.vscode-pgsql/pgsql_describeCsv",
        "ms-ossdata.vscode-pgsql/pgsql_bulkLoadCsv",
        "ms-ossdata.vscode-pgsql/pgsql_getDashboardContext",
        "ms-ossdata.vscode-pgsql/pgsql_getMetricData",
        "ms-ossdata.vscode-pgsql/pgsql_migration_oracle_app",
        "ms-ossdata.vscode-pgsql/pgsql_migration_show_report",
        "todo",
    ]
---

# Modelibr E2E Testing Agent

This agent specializes in E2E testing for Modelibr using Playwright-BDD and Docker Compose. Tests should be **short, focused, and human-readable**.

## Test Design Principles

### Structure
- **Granular tests**: One test per scenario, each testing a single behavior
- **Dependencies via tags**: Use `@setup` for setup scenarios, `@depends-on:setup` for dependent tests
- **Shared state**: Use `sharedState` fixture to pass data (models, texture sets) between scenarios
- **Page Objects**: Use dedicated page objects (`ModelListPage`, `ModelViewerPage`, `TextureSetsPage`) for UI interactions

### Verification Layers
Each test should verify through appropriate layers:
- **UI**: Visual confirmation of changes
- **API**: Direct API response validation
- **SignalR**: Real-time event verification
- **Database**: Data persistence checks
- **File System**: File creation/modification verification

### Test File Organization
```
tests/e2e/
├── features/
│   ├── health-check.feature          # Basic connectivity
│   ├── model-upload.feature          # Model upload tests
│   ├── texture-sets/
│   │   ├── 01-setup.feature          # @setup - create models
│   │   ├── 02-create-texture-sets.feature  # @setup - create texture sets
│   │   ├── 03-default-behavior.feature     # @depends-on tests
│   │   └── 04-version-independence.feature # @depends-on tests
├── pages/                             # Page objects
├── steps/                             # Step definitions
├── fixtures/                          # Playwright fixtures (shared-state, db-helper, signalr-helper)
└── helpers/                           # API helpers
```

## Environment Configuration

### Docker Compose
- **ALWAYS** use `tests/e2e/docker-compose.e2e.yml` - NEVER the root `docker-compose.yml`
- E2E ports (isolated from development):
  - **WebApi**: `http://localhost:8090`
  - **Frontend**: `http://localhost:3002`
  - **PostgreSQL**: `localhost:5433`
  - **Worker**: `http://localhost:3003`

### Running Tests
```bash
cd tests/e2e
npm run test:e2e    # Runs cross-platform node run-e2e.js script
npm run test:report # Opens HTML report in browser
```

The `run-e2e.js` script handles:
1. Starting containers with fresh database
2. Running tests with proper environment variables
3. Cleaning up containers and data after tests

## Test Assets

Located in `tests/e2e/assets/`:
- **Models**: `test-cube.glb` (GLB only - safe to modify), `test-cone.fbx`, `test-cylinder.fbx`, `test-icosphere.fbx`, `test-torus.fbx`
- **Textures**: `blue_color.png`, `red_color.png`, `green_color.png`, `yellow_color.png`, `pink_color.png`, `black_color.png`

> **WARNING**: Only `.glb` files can be safely modified for uniqueness via `UniqueFileGenerator`. FBX/OBJ files are binary and will corrupt if modified.

## Critical Selector Patterns

### Use Accessible Selectors
Always prefer role-based and accessible selectors over CSS classes:

```typescript
// ✅ GOOD - Uses role and name
await page.getByRole('button', { name: 'Add Version' }).click();
await page.getByRole('button', { name: 'Upload textures' }).click();

// ❌ BAD - Fragile CSS selectors
await page.locator('.viewer-controls button:has(.pi-plus)').click();
```

### URL Patterns
The application uses query parameter-based routing:
```typescript
// ✅ CORRECT - Query param format
const match = url.match(/model-(\d+)/);

// ❌ WRONG - Old path format
const match = url.match(/\/models\/(\d+)/);
```

### Texture Sets Page Navigation
Navigate to Texture Sets tab using direct URL:
```typescript
await page.goto('http://localhost:3002/?leftTabs=modelList,textureSets&activeLeft=textureSets');
```

## Page Object Guidelines

### TextureSetsPage
- Navigate via direct URL, not UI click-through
- Upload textures via hidden file input: `page.locator('input[data-testid="texture-upload-input"]').setInputFiles()`
- App creates texture set with file basename as name

### ModelViewerPage
- Wait for canvas to be visible and loading to disappear
- Use `getByRole('button', { name: 'Add Version' })` for version upload
- Version dropdown uses `.version-dropdown-trigger` and `.version-dropdown-menu`

### ModelListPage
- Close upload progress window after uploads to prevent click blocking

## Shared State Management

### Storing Data
```typescript
// Store model after creation
sharedState.saveModel('single-version-model', { id: modelId, name: fileName });

// Store texture set after creation
sharedState.saveTextureSet('blue_color', { id: textureSetId, name: 'blue_color' });
```

### Retrieving Data
```typescript
const model = sharedState.getModel('single-version-model');
if (!model) {
    throw new Error(`Model not found in shared state`);
}
```

### Feature File Patterns
```gherkin
# Setup scenarios create data
@setup
Feature: Create Models
  Scenario: Create single-version model
    When I upload a model "test-cube.glb" and store it as "single-version-model"

# Dependent scenarios verify state first
@depends-on:setup
Feature: Default Behavior
  Background:
    Given the following models exist in shared state:
      | name                 |
      | single-version-model |
```

## Debugging Workflow

### When Tests Fail
1. **Check error-context.md** in `test-results/` directories for page snapshots
2. **View screenshots** captured on test failures
3. **Check WebApi logs**: `docker logs webapi-e2e`
4. **Test API directly**: 
   ```bash
   curl http://localhost:8090/health
   curl http://localhost:8090/texture-sets
   ```

### Common Issues

| Issue | Solution |
|-------|----------|
| 500 errors from API | Check webapi logs, verify database connectivity, ensure fresh database |
| Selector not found | Check error-context.md for actual DOM structure, use getByRole() |
| Model not in shared state | Verify setup scenarios run before dependent scenarios |
| Unique constraint errors | Clean database: `docker compose -f docker-compose.e2e.yml down -v` |
| Port already allocated | Stop conflicting containers, check for running dev environment |

### Database Cleanup
Always clean up before running tests:
```bash
docker compose -f docker-compose.e2e.yml down -v
rm -rf ./data  # or Remove-Item -Recurse -Force ./data on Windows
```

## SignalR & Real-time Updates

Use `SignalRHelper` fixture for:
- `ThumbnailStatusChanged`: When thumbnails finish rendering
- `ModelProcessed`: When model processing completes

## Screenshots

Tests capture screenshots on pass and fail (`screenshot: "on"` in config). These appear in the HTML report for visual verification.

## Files to Ignore (in .gitignore)

```
test-results/
playwright-report/
.features-gen/
data/
node_modules/
*.log
```
