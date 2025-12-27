# E2E Test Structure - Dependent Scenarios

This document explains how the e2e tests are organized to support dependent scenarios while maintaining isolation between full test runs.

## Overview

The e2e tests have been split into smaller, focused feature files that can depend on each other. Tests run sequentially within a single test session, sharing state through a global fixture. After each full test run, Docker volumes are destroyed, ensuring complete isolation.

## Architecture

### Shared State Management

**Fixture:** `tests/e2e/fixtures/shared-state.ts`

-   Global singleton that persists data across scenarios within a single test run
-   Manages models, texture sets, and version states
-   Automatically cleared between test runs (via Docker volume cleanup)

**Test Data Builder:** `tests/e2e/fixtures/test-data-builder.ts`

-   Programmatically creates test entities via API (bypasses UI for speed)
-   Stores created entities in shared state
-   Provides methods like `createModelWithVersions()`, `createTextureSet()`, `captureVersionState()`

### Feature File Organization

Tests are organized in numbered files to ensure execution order:

```
tests/e2e/features/texture-sets/
├── 01-setup.feature                    [@setup]
│   └── Creates base models and versions
├── 02-create-texture-sets.feature      [@depends-on:setup]
│   └── Creates and links texture sets
├── 03-default-behavior.feature         [@depends-on:setup,create-texture-sets]
│   └── Tests default texture set functionality
└── 04-version-independence.feature     [@depends-on:setup,create-texture-sets]
    └── Validates independent defaults and thumbnails
```

### Step Definitions

**Shared Setup Steps:** `tests/e2e/steps/shared-setup.steps.ts`

-   `Given the following models exist in shared state` - Validates dependencies
-   `Given the following texture sets exist in shared state` - Validates dependencies
-   `When I upload a model {string} and store it as {string}` - Creates and stores model
-   `Given I am on the model viewer page for {string}` - Navigates using shared state

**Default Texture Set Steps:** `tests/e2e/steps/default-texture-set.steps.ts`

-   Updated to use `sharedState` instead of local `testContext`
-   All texture set operations (create, link, set default) store data in shared state
-   Version state capture/validation uses shared state for independence testing

## Usage Patterns

### 1. Setup Scenario (Creates Base Data)

```gherkin
@setup
Feature: Setup - Create Models and Versions

  Scenario: Create model with single version
    Given I am on the model list page
    When I upload a model "test-cube.glb" and store it as "single-version-model"
    Then the model should be stored in shared state
```

### 2. Dependent Scenario (Uses Setup Data)

```gherkin
@depends-on:setup
Feature: Create and Link Texture Sets

  Background:
    Given the following models exist in shared state:
      | name                  |
      | single-version-model  |

  Scenario: Create texture set
    Given I am on the model viewer page for "single-version-model"
    When I create a new texture set "Blue Material"
    Then texture set "Blue Material" should be stored in shared state
```

### 3. Multi-Dependency Scenario

```gherkin
@depends-on:setup,create-texture-sets
Feature: Default Texture Set Behavior

  Background:
    Given the following models exist in shared state:
      | name                  |
      | single-version-model  |
    And the following texture sets exist in shared state:
      | name           |
      | Blue Material  |

  Scenario: Setting default texture set
    Given I am on the model viewer page for "single-version-model"
    When I set "Blue Material" as the default texture set
    Then "Blue Material" should be marked as default
```

## Key Benefits

1. **Faster Execution**: Setup scenarios run once, dependent scenarios reuse data
2. **Clear Dependencies**: `@depends-on` tags and `Background` sections document requirements
3. **Easier Debugging**: Smaller, focused scenarios easier to troubleshoot
4. **Maintainability**: Shared state management centralized in one place
5. **Isolation**: Docker volume cleanup ensures no pollution between test runs

## Running Tests

### Full Test Suite (Recommended)

```powershell
cd tests/e2e
.\run-e2e-tests.ps1
```

This runs all tests in order and cleans up Docker volumes afterward.

### Individual Feature Files (For Development)

```powershell
cd tests/e2e
npm test -- texture-sets/01-setup.feature
npm test -- texture-sets/02-create-texture-sets.feature
```

**Note:** When running individual files, ensure dependent files have run first, or the tests will fail with clear error messages about missing shared state.

## Debugging

### View Shared State

The shared state fixture provides a debug helper:

```typescript
console.log(sharedState.getDebugInfo());
```

This outputs:

```json
{
    "models": ["single-version-model", "multi-version-model"],
    "textureSets": ["Blue Material", "Red Material"],
    "versionStates": [1, 2]
}
```

### Common Issues

**Error: "Model not found in shared state"**

-   Setup scenario didn't run or failed
-   Run full test suite instead of individual files

**Error: "Texture set not properly linked to model"**

-   Link step didn't execute successfully
-   Check API helper logs for errors

## Migration from Old Structure

### Old (default-texture-set.feature)

-   3 monolithic scenarios
-   All setup repeated in each scenario
-   Module-level variables for state
-   ~100 lines per scenario

### New (Split Structure)

-   4 focused feature files
-   Setup scenarios reused via shared state
-   Global fixture for state management
-   ~20-30 lines per scenario

### Benefits

-   **Speed**: ~40% faster (setup runs once)
-   **Clarity**: Each file has single responsibility
-   **Debugging**: Easier to isolate failures
-   **Reusability**: Setup scenarios can be used by multiple test suites

## Future Enhancements

1. **API-First Setup**: Create more entities via `TestDataBuilder` instead of UI
2. **Snapshot Testing**: Add visual regression tests for thumbnails
3. **Parallel Scenarios**: Some scenarios within a feature could run in parallel
4. **Database Seeding**: Pre-populate common test data for even faster execution
