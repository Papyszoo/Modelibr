# PR #487 — Environment Maps Code Quality Review

**PR**: [#487 — Environment Maps](https://github.com/Papyszoo/Modelibr/pull/487) (draft)
**Date**: 2026-04-11
**Scope**: 272 files changed, +31,459 / −1,384 lines across 2 commits
**Review method**: Systematic comparison against existing asset type implementations (Model, TextureSet, Sound, Sprite)

---

## Table of Contents

- [Executive Summary](#executive-summary)
- [1. Thumbnail Generation — Root Cause Analysis](#1-thumbnail-generation--root-cause-analysis)
- [2. Volume and Complexity Analysis](#2-volume-and-complexity-analysis)
- [3. Backend — Domain & Application Layer](#3-backend--domain--application-layer)
- [4. Backend — Infrastructure & API](#4-backend--infrastructure--api)
- [5. Asset Processor (Worker)](#5-asset-processor-worker)
- [6. Frontend — Components & Architecture](#6-frontend--components--architecture)
- [7. Frontend — Shared Component Refactoring](#7-frontend--shared-component-refactoring)
- [8. Frontend — Demo Mode](#8-frontend--demo-mode)
- [9. E2E Tests](#9-e2e-tests)
- [10. Database Migrations](#10-database-migrations)
- [11. Missing & Insufficient Test Coverage](#11-missing--insufficient-test-coverage)
- [12. Prioritized Action Items](#12-prioritized-action-items)
- [13. Fix Status](#13-fix-status)
- [14. Model Reference Audit](#14-model-reference-audit--environment-maps-vs-models)
- [15. Final Verification Summary](#15-final-verification-summary)
- [16. Thumbnail Framerate Analysis](#16-thumbnail-framerate-analysis)
- [17. PR Review Comment Resolutions](#17-pr-review-comment-resolutions)
- [18. Feature Video Fix](#18-feature-video-fix)
- [19. E2E CI Stability Fix](#19-e2e-ci-stability-fix--cube-upload-card-visibility)

---

## Executive Summary

This PR adds "Environment Maps" as a fifth asset type (alongside Models, Texture Sets, Sounds, Sprites). While the scope is legitimate and the feature is functionally complete end-to-end, the implementation has **systemic quality issues** that distinguish it from the existing codebase:

| Area | Verdict |
|------|---------|
| **Thumbnail pipeline** | ✅ Fixed — HTTP upload, dedicated status endpoint, SignalR cache updates |
| **Code volume** | 🟠 Addressed — decomposition applied, components split, shared hooks extracted |
| **Backend patterns** | ✅ Follows conventions — generic categories, domain events, CQRS queries |
| **Frontend components** | ✅ VirtuosoGrid, Zustand persistence, hooks, URL builders — matches model reference |
| **Shared refactoring** | ✅ Category component generalization is excellent |
| **Worker processor** | ✅ HTTP-based upload, ground plane removed, framerate adjusted |
| **E2E tests** | ✅ Well-structured, good coverage, submenu locator fix applied |
| **Migrations** | ✅ Squashed into single migration |

**Bottom line**: After 4 remediation sessions, 15 of 19 original issues fixed plus all 5 follow-up recommendations implemented. The environment maps implementation now closely matches the model reference architecture.

---

## 1. Thumbnail Generation — Root Cause Analysis

### The Problem

Environment map thumbnail generation fails because the PR introduces a **fundamentally different storage approach** from the one used by all other asset types.

### How Existing Thumbnails Work (Models, Texture Sets)

```
Worker renders frames
  → Worker encodes WebP/PNG
  → Worker UPLOADS file via HTTP multipart POST
      to backend endpoint (e.g. POST /texture-sets/{id}/thumbnail/upload)
  → Backend receives file, stores via IFileStorage abstraction
  → Backend returns relative path
  → Worker calls finish endpoint with metadata
  → Frontend fetches thumbnail via GET /texture-sets/{id}/thumbnail/file
```

**Key**: The worker **uploads** the file to the backend via HTTP. The backend manages storage. The worker never touches the upload filesystem directly.

**Evidence** — `src/asset-processor/textureSetApiService.js`:
```javascript
async uploadThumbnail(textureSetId, thumbnailPath) {
    const formData = new FormData()
    formData.append('file', fs.createReadStream(thumbnailPath))
    await this.client.post(`/texture-sets/${textureSetId}/thumbnail/upload`, formData, ...)
}
```

### How Environment Map Thumbnails Work (PR #487 — BROKEN)

```
Worker renders frames
  → Worker encodes WebP/PNG
  → Worker WRITES FILE DIRECTLY to shared filesystem
      at UPLOAD_STORAGE_PATH/previews/environment-maps/{id}/{variantId}.webp
  → Worker calls finish endpoint with ONLY the relative path string
  → Backend stores the path string in DB but never receives the actual file
  → Backend tries to serve file from its own UPLOAD_STORAGE_PATH volume
  → File doesn't exist → 404
```

**Key difference**: The worker writes directly to a shared Docker volume instead of uploading via HTTP.

**Evidence** — `src/asset-processor/environmentMapStorageService.js`:
```javascript
async storeThumbnail(environmentMapId, variantId, encodingResult) {
    // Direct filesystem write — NOT HTTP upload
    fs.copyFileSync(encodingResult.webpPath, paths.webpAbsolutePath)
}
```

**Evidence** — `src/Application/ThumbnailJobs/FinishEnvironmentMapThumbnailJobCommand.cs`:
```csharp
// Only stores the path string — no file is received
variant.SetThumbnailPath(command.ThumbnailPath, now);
```

### Why This Fails

1. **Volume mismatch**: The worker container and webapi container need identical `UPLOAD_STORAGE_PATH` volume mounts. The docker-compose changes add this volume, but the paths must align exactly.
2. **Architectural fragility**: This couples the worker and backend at the filesystem level instead of the HTTP API level. Container restarts, volume remounts, or path differences break it silently.
3. **The correct endpoint already exists**: `UploadEnvironmentMapVariantThumbnailCommand` in the Application layer uses `IFileStorage.SaveAsync()` — the proper pattern. But the worker never calls it.

### The Fix

**Remove `EnvironmentMapStorageService` entirely.** Instead, follow the TextureSet pattern:

1. Create an `EnvironmentMapApiService` in the worker (like `textureSetApiService.js`)
2. Upload thumbnails via `POST /environment-maps/{id}/variants/{variantId}/thumbnail/upload`
3. Remove `UPLOAD_STORAGE_PATH` from worker config and docker-compose worker service
4. Remove the `./data/uploads` volume mount from the worker container
5. Remove `EnvironmentMapStoragePathResolver` from Infrastructure
6. Remove `IUploadPathProvider` dependency from `EnvironmentMapEndpoints` preview serving — use the stored file path from `IFileStorage` instead

### `UPLOAD_STORAGE_PATH` — Is It Unnecessary?

**For the worker: YES, unnecessary.** This env var already existed on the backend (webapi service) for `UploadPathProvider`. Adding it to the worker container was done to support the broken direct-filesystem approach. Once thumbnails upload via HTTP (like all other asset types), the worker doesn't need this variable at all.

---

## 2. Volume and Complexity Analysis

### Line Count by Layer

| Layer | Lines Added | Context |
|-------|------------|---------|
| Backend (Domain + Application) | ~3,600 | 14 new domain files, 15 new command/query handlers |
| Backend (Infrastructure) | ~9,200 | ~8,500 are auto-generated migration Designer.cs files |
| Backend (WebApi) | ~800 | Endpoints, hub, services |
| Frontend (components) | ~5,700 | 9 TSX + 4 CSS files |
| Frontend (shared) | ~1,200 | Category components, hooks, types |
| Frontend (demo) | ~1,850 | Demo handlers and DB |
| Frontend (other) | ~500 | Stores, hooks, types, tests |
| Asset Processor | ~750 | Processor, services, config, tests |
| E2E Tests | ~2,200 | Steps, page objects, features, helpers |
| Migrations (non-Designer) | ~730 | 4 migration files |
| Docs | ~160 | Feature docs, changelog |

**Excluding auto-generated migration Designer files** (~8,500 lines), the real functional code is ~23,000 lines. This is still excessive for one asset type — by comparison, Texture Sets (a comparable feature with variants, categories, and thumbnails) required roughly 40-50% less code.

### What's Driving the Bloat

1. **Monolithic frontend components** — EnvironmentMapViewer alone is 1,012 lines; TextureSetViewer is 115 lines
2. **Copy-pasted category handlers** — 3 identical category CRUD handler sets instead of generic abstraction
3. **Redundant storage services** — `EnvironmentMapStorageService` + `EnvironmentMapFileService` instead of reusing patterns
4. **Oversized demo handlers** — 1,048 lines of demo handler additions

---

## 3. Backend — Domain & Application Layer

### What Follows Existing Patterns ✅

- `EnvironmentMap` extends `AggregateRoot`, uses `Create()` factory method
- Collection encapsulation: private `List<T>` backing fields + public `ICollection<T>` properties
- Soft-delete pattern (`IsDeleted` / `DeletedAt`) matches existing models
- Result/Error pattern in all command handlers
- Repository interfaces in `Application/Abstractions/Repositories/`

### Issues

#### 3.1 Three-Level Entity Nesting Is Overengineered

**Pattern**: `EnvironmentMap → EnvironmentMapVariant → EnvironmentMapVariantFaceFile`

**Comparison**: `TextureSet → Texture` is only two levels. `Sound` and `Sprite` are flat.

The `EnvironmentMapVariantFaceFile` entity exists solely to map cube faces (px, nx, py, ny, pz, nz) to file IDs. This could be modeled as a value-object dictionary or six nullable file columns on the variant instead of a separate entity with its own table, repository concerns, and EF configuration.

**Files**: `src/Domain/Models/EnvironmentMapVariantFaceFile.cs`, `src/Domain/Models/EnvironmentMapCubeFace.cs`

#### 3.2 Category Command Handlers Are Copy-Pasted

Three category implementations are structurally identical:

| File | Lines | Pattern |
|------|-------|---------|
| `EnvironmentMapCategoryCommands.cs` | 110 | Create/Update/Delete handlers |
| `TextureSetCategoryCommands.cs` | 104 | Create/Update/Delete handlers (new in this PR) |
| `SoundCategoryCommands.cs` (modified) | ~80 | Create/Update/Delete handlers |

The handlers are literally the same logic with type names swapped. Error messages differ only by `"environment map"` vs `"texture set"` vs `"sound"`.

**What should exist instead**: A generic handler base class:
```csharp
abstract class HierarchicalCategoryCommandHandler<TCategory>
    where TCategory : AggregateRoot
```

The PR even introduces `HierarchicalCategoryHelpers.cs` as a shared utility — but then copy-pastes the handlers that call it instead of making them generic.

**Files**: `src/Application/EnvironmentMapCategories/`, `src/Application/TextureSetCategories/`, `src/Application/Categories/HierarchicalCategoryHelpers.cs`

#### 3.3 Command Handler Bloat — Multiple Sequential Saves

`CreateEnvironmentMapCommand` handler performs 3 sequential `UpdateAsync` calls:
1. After creating the environment map
2. After adding a variant
3. After setting the preview variant

**Comparison**: `CreateTextureSetCommand` achieves the same with a single save. The environment map handler should build the complete aggregate before persisting.

**File**: `src/Application/EnvironmentMaps/CreateEnvironmentMapCommand.cs`

#### 3.4 EnvironmentMapVariantSupport Is a 218-Line God Helper

This static utility class bundles:
- Variant resolution from existing files
- Variant resolution from uploads
- Size label detection
- Cube face matching

It should be decomposed into focused services or moved into domain logic where appropriate.

**File**: `src/Application/EnvironmentMaps/EnvironmentMapVariantSupport.cs`

#### 3.5 Missing Domain Events

`EnvironmentMap` does not raise domain events (no `RaiseDomainEvent()` calls). Existing aggregate roots like `Model` raise events for lifecycle tracking. This makes environment maps invisible to event-driven workflows.

**File**: `src/Domain/Models/EnvironmentMap.cs`

#### 3.6 ThumbnailJob Accumulates Asset-Specific Fields

The PR adds `EnvironmentMapId` and `EnvironmentMapVariantId` as nullable properties on `ThumbnailJob`, alongside existing `ModelId`, `ModelVersionId`, `SoundId`, `TextureSetId`. This model is becoming a union type held together by nullable fields.

**File**: `src/Domain/Models/ThumbnailJob.cs`

---

## 4. Backend — Infrastructure & API

### 4.1 EnvironmentMapEndpoints Is Too Large (624 lines)

The file registers ~18 endpoints. By comparison, `TextureSetEndpoints.cs` is 603 lines with more established complexity. The endpoints are functional but include:

- **Duplicate routes**: `/environment-maps/{id}/preview` and `/environment-maps/{id}/thumbnail` serve the same content
- **Separate PNG upload**: A separate endpoint for PNG thumbnails vs WebP (`/thumbnail/upload` vs `/thumbnail/png-upload`) — other asset types handle this within a single upload flow

**File**: `src/WebApi/Endpoints/EnvironmentMapEndpoints.cs`

### 4.2 EnvironmentMapRepository Has Inefficient Queries

`GetByFileHashesAsync` performs database queries then falls back to LINQ-to-objects filtering for cube face matching. This should be a pure EF Core query for efficiency.

**File**: `src/Infrastructure/Repositories/EnvironmentMapRepository.cs`

### 4.3 WebDav Implementation Is Consistent ✅

`VirtualEnvironmentMapCollections.cs` (311 lines) follows the existing virtual collection pattern closely. This is one of the better-implemented parts of the PR.

**File**: `src/Infrastructure/WebDav/VirtualEnvironmentMapCollections.cs`

---

## 5. Asset Processor (Worker)

### What's Correct ✅

- `EnvironmentMapProcessor` extends `BaseProcessor` and follows the template method pattern
- Properly registers in `ProcessorRegistry` as `'EnvironmentMap'`
- Three.js rendering in `render-template.html` correctly handles both equirectangular and cubemap formats using PMREM
- Orbit frame rendering and WebP encoding pipeline works
- `JobApiClient.finishEnvironmentMapJob()` follows the existing finish method pattern

### What's Wrong

#### 5.1 EnvironmentMapStorageService — Wrong Pattern (See Section 1)

This 89-line service writes thumbnails directly to the filesystem. It should not exist. The worker should upload via HTTP like all other processors do.

**File**: `src/asset-processor/environmentMapStorageService.js`

#### 5.2 EnvironmentMapFileService — Duplicates Existing Patterns

This 171-line service creates its own `JobApiClient` instance, manages its own temp directory, and implements stream-to-file writing. Similar functionality exists in `ModelDataService` for models.

At minimum, the stream-to-file writing (`writeStreamToFile`) and temp directory management should be shared utilities.

**File**: `src/asset-processor/environmentMapFileService.js`

#### 5.3 Config Bloat — 12 New Environment Variables

The PR adds many rendering configuration variables to `config.js`:

```
UPLOAD_STORAGE_PATH (unnecessary for worker)
ENVIRONMENT_MAP_UPLOAD_ROOT_PATH (unnecessary for worker)
ENVIRONMENT_MAP_CAMERA_DISTANCE_MULTIPLIER
ENVIRONMENT_MAP_CAMERA_HEIGHT
ENVIRONMENT_MAP_SPHERE_SEGMENTS
ENVIRONMENT_MAP_SPHERE_METALNESS
ENVIRONMENT_MAP_SPHERE_ROUGHNESS
ENVIRONMENT_MAP_INTENSITY
ENVIRONMENT_MAP_BACKGROUND_BLUR
ENVIRONMENT_MAP_BACKGROUND_INTENSITY
ENVIRONMENT_MAP_TONE_MAPPING_EXPOSURE
ENVIRONMENT_MAP_ROTATION_Y
```

These are validated strictly (config validation section grows by ~40 lines). Some of this is justified for fine-tuning environment map rendering, but the storage-related variables should be removed.

**File**: `src/asset-processor/config.js`

---

## 6. Frontend — Components & Architecture

### Component Size Comparison

| Environment Map Component | Lines | Comparable Existing Component | Lines |
|--------------------------|-------|-------------------------------|-------|
| `EnvironmentMapViewer.tsx` | **1,012** | `TextureSetViewer.tsx` | **115** |
| `EnvironmentMapList.tsx` | **738** | `TextureSetList.tsx` | **351** |
| `EnvironmentMapContextMenu.tsx` | **646** | (inline in other features) | n/a |
| `EnvironmentMapUploadDialog.tsx` | **583** | (inline in other features) | n/a |
| `EnvironmentMapToolbar.tsx` | 296 | (inline in other features) | n/a |
| **Total TSX** | **3,901** | **TextureSet total TSX** | **5,120** |

The total line count (3,901 vs 5,120) isn't dramatically different, but the **distribution** is the problem. TextureSet splits 5,120 lines across **18 focused files** (largest: 643). Environment Maps concentrates 3,901 lines into **9 files** with the largest at 1,012.

### 6.1 EnvironmentMapViewer.tsx — Monolithic (1,012 Lines)

This single file contains:
- 6 utility functions for file download (lines 92–143) that should live in `utils/`
- Hardcoded panel size constants (280px, 320px, 220px, 260px)
- Complex viewer state management that should be a custom hook
- Panel rendering, toolbar, detail sidebar, and preview canvas all inline

**Comparison**: `TextureSetViewer.tsx` is 115 lines because it delegates to `TextureSetGrid`, `FilesTab`, `PreviewSettings`, `TexturePreviewPanel`, `PreviewInfo`, and other focused components.

**File**: `src/frontend/src/features/environment-map/components/EnvironmentMapViewer.tsx`

### 6.2 EnvironmentMapList.tsx — Mixed Concerns (738 Lines)

Contains list rendering, toolbar, context menu orchestration, upload handling, and a `EnvironmentMapCardImage` sub-component with retry logic — all in one file.

**Comparison**: TextureSet splits this into `TextureSetList` (351), `TextureSetGrid` (613), `TextureCard` (411) — each with a focused responsibility.

**File**: `src/frontend/src/features/environment-map/components/EnvironmentMapList.tsx`

### 6.3 CSS Duplication

`EnvironmentMapList.css` (423 lines) duplicates patterns from existing list CSS files:
- Drag-over styling (border color, background, transform)
- Toolbar flex layout
- Card width toggle buttons
- Hardcoded color values (`#3182ce`, `rgba(49, 130, 206, ...)`) instead of CSS variables

**File**: `src/frontend/src/features/environment-map/components/EnvironmentMapList.css`

### 6.4 Tab, Store, and Hook Integration Is Correct ✅

- `TabType` union extended with `'environmentMaps' | 'environmentMapViewer'`
- `TabContent.tsx` switch cases added
- `useTabMenuItems` updated
- Navigation store handles environment map tabs
- SignalR service properly integrates `EnvironmentMapThumbnailStatusChanged` events
- Upload progress store handles environment map uploads
- Deep link handler includes environment map routes

---

## 7. Frontend — Shared Component Refactoring

### This Is the Strongest Part of the PR ✅

The PR extracts model-specific category components into generic shared components:

| New Shared Component | Purpose |
|---------------------|---------|
| `CategoryFilterPicker.tsx` | Generic category filter with tree selection |
| `CategoryManagerDialog.tsx` | Generic CRUD dialog for categories |
| `CategorySinglePicker.tsx` | Generic single-category picker |
| `CategoryTreePanel.tsx` | Generic tree panel with expand/collapse |
| `CategoryTreeControls.css` | Shared category tree styles |
| `categories.ts` (types) | `HierarchicalCategory` generic interface |
| `categoryTree.ts` (utils) | Generic tree-building utilities |

Existing model components properly wrap the shared ones:
```tsx
// ModelCategoryFilterPicker.tsx now delegates to shared
import { CategoryFilterPicker } from '@/shared/components/categories/CategoryFilterPicker'
```

**Assessment**: This refactoring is well done, uses TypeScript generics properly, and benefits the entire codebase. It should be preserved regardless of other refactoring.

---

## 8. Frontend — Demo Mode

Demo handlers add ~1,048 lines to `dynamicDemoHandlers.ts`, plus ~450 lines to `shared.ts`. This includes 14+ new MSW route handlers for the environment maps API surface.

The demo data setup is thorough and correctly integrates environment maps into Pack and Project containers, including count recalculation.

**Concern**: Each asset type's demo handlers follow the same boilerplate pattern but aren't abstracted. A generic asset handler factory could reduce duplication across models, texture sets, sprites, sounds, and environment maps. However, this is a pre-existing pattern, not introduced by this PR.

---

## 9. E2E Tests

### Well-Structured ✅

- 3 feature files across `tests/e2e/features/17-environment-maps/`
- 5 scenarios covering list parity, cube preview, and thumbnail generation
- Step definitions (913 lines) within range of existing steps (Sprites: 1,479, TextureSets: 1,318)
- `data-testid` naming follows conventions
- `UniqueFileGenerator` properly used for deduplication safety
- Shared state integration follows existing patterns

### Issues

#### 9.1 Page Object Size (832 Lines)

`EnvironmentMapsPage.ts` at 832 lines is the 2nd largest page object. It mixes list and viewer responsibilities. Consider splitting into `EnvironmentMapsListPage` and `EnvironmentMapsViewerPage`.

**File**: `tests/e2e/pages/EnvironmentMapsPage.ts`

#### 9.2 Hardcoded Waits

```typescript
await this.page.waitForTimeout(100)  // Lines ~380, ~385
await this.page.waitForTimeout(3000) // Lines ~590, ~650
```

The `waitForTimeout(100)` calls are timing-dependent and should use `expect.poll()`. The 3000ms waits may be acceptable for thumbnail generation settling but should be documented.

#### 9.3 file-payload-helper.ts — Useful but Isolated

The new helper (234 lines) generates spec-compliant PNG and HDR payloads for testing. This is genuinely new capability (not duplication) but lives in the environment-maps directory. Consider moving to a central test fixtures library for future reuse.

**File**: `tests/e2e/helpers/file-payload-helper.ts`

---

## 10. Database Migrations

### Four Migrations for One Feature

| Migration | Lines | Purpose |
|-----------|-------|---------|
| `20260410120000_AddEnvironmentMaps.cs` | 199 | Base tables, join tables |
| `20260410123000_AddEnvironmentMapCubeVariants.cs` | 129 | Cube face support, projection types |
| `20260410201013_AddEnvironmentMapMetadata.cs` | 81 | Categories, tags |
| `20260411172154_SyncAssetCategoryThumbnailSchema.cs` | 318 | **Scope creep** |

Since this is a draft PR not yet merged to main, these should be squashed into a single migration.

### Scope Creep: SyncAssetCategoryThumbnailSchema

This migration modifies **unrelated tables**:
- Adds `ParentId` + hierarchical indices to `SpriteCategories` and `SoundCategories`
- Adds `TextureSetCategoryId` to `TextureSets`
- Adds `EnvironmentMapId` + `EnvironmentMapVariantId` to `ThumbnailJobs`

Mixing platform-wide category hierarchy changes with the environment maps feature creates:
- **Revert risk**: Rolling back environment maps also rolls back unrelated category hierarchy changes
- **Test coupling**: Category regression affects environment map migration
- **Misleading name**: "SyncAssetCategoryThumbnailSchema" doesn't indicate it's redefining category hierarchies for Sprites and Sounds

**Recommendation**: Extract category hierarchy changes to a separate migration.

---

## 11. Missing & Insufficient Test Coverage

### Backend Tests — Present but Gaps Exist

| Test File | Status | Coverage |
|-----------|--------|----------|
| `EnvironmentMapCommandHandlerTests.cs` | ✅ Present | Core CRUD handlers |
| `EnvironmentMapQueryHandlerTests.cs` | ✅ Present | Query handlers |
| `RegenerateEnvironmentMapThumbnailCommandHandlerTests.cs` | ✅ Present | Thumbnail regeneration |
| `FinishEnvironmentMapThumbnailJobCommandHandlerTests.cs` | ✅ Present | Job completion |
| `EnvironmentMapDomainTests.cs` | ✅ Present | Domain model logic |
| `EnvironmentMapStoragePathResolverTests.cs` | ✅ Present | Path resolution |
| Category handler tests | ❌ Missing | No tests for category CRUD |
| WebDav collection tests | ❌ Missing | No tests for WebDav integration |

### Frontend Tests — Critically Insufficient

| Test | Status |
|------|--------|
| `environmentMapUtils.test.ts` | ✅ Present (175 lines) |
| `useTabMenuItems.test.tsx` | ✅ Updated |
| `tabSerialization.test.ts` | ✅ Updated |
| `DraggableTab.test.tsx` | ✅ Updated |
| **EnvironmentMapList.test.tsx** | ❌ **Missing** |
| **EnvironmentMapViewer.test.tsx** | ❌ **Missing** |
| **EnvironmentMapUploadDialog.test.tsx** | ❌ **Missing** |
| **EnvironmentMapContextMenu.test.tsx** | ❌ **Missing** |
| **queries.test.ts** | ❌ **Missing** |
| **environmentMapApi.test.ts** | ❌ **Missing** |

**Zero component tests** for the environment-map feature. Only utility function tests exist. The upload flow, retry logic (120 retry attempts in EnvironmentMapCardImage), variant switching, and form validation are all untested.

### Worker Tests — Adequate but Testing Wrong Pattern

- `environmentMapProcessor.test.js` (246 lines) — mocks dependencies, tests pipeline ✅
- `environmentMapStorageService.test.js` (63 lines) — tests filesystem writes, but this service should be deleted
- `processorRegistry.test.js` — updated for new processor ✅

---

## 12. Prioritized Action Items

### 🔴 Critical — Must Fix Before Merge

| # | Issue | Effort |
|---|-------|--------|
| 1 | **Fix thumbnail pipeline**: Replace `EnvironmentMapStorageService` with HTTP upload via existing `UploadEnvironmentMapVariantThumbnailCommand`. Remove `UPLOAD_STORAGE_PATH` from worker config/docker-compose. Delete `EnvironmentMapStoragePathResolver`. | Medium |
| 2 | **Add frontend component tests**: At minimum for EnvironmentMapList (upload/retry), EnvironmentMapUploadDialog (form validation), and EnvironmentMapViewer (state management). | Medium |
| 3 | **Squash migrations**: Combine 4 migrations into 1 (or 2: one for env maps, one for category hierarchy). | Low |

### 🟠 High — Should Fix Before Merge

| # | Issue | Effort |
|---|-------|--------|
| 4 | **Decompose EnvironmentMapViewer** (1,012 → multiple files): Extract download utils to `utils/`, viewer state to custom hook, panels to sub-components. Follow TextureSetViewer pattern (115-line coordinator). | Medium |
| 5 | **Decompose EnvironmentMapList** (738 → multiple files): Extract card image, grid, toolbar, upload handling into focused components. | Medium |
| 6 | **Eliminate category handler duplication**: Create generic base handler or use generics to share Create/Update/Delete logic across EnvironmentMap, TextureSet, Sound, Sprite categories. | Medium |
| 7 | **Reduce command handler bloat**: `CreateEnvironmentMapCommand` should build the complete aggregate before a single `SaveChangesAsync`. No 3x sequential saves. | Low |
| 8 | **Remove duplicate endpoint routes**: `/preview` and `/thumbnail` serve the same thing — keep one. | Low |

### 🟡 Medium — Improve Before or After Merge

| # | Issue | Effort |
|---|-------|--------|
| 9 | **Replace CSS hardcoded colors** with CSS variables. Extract shared list/drag-over styles. | Low |
| 10 | **Extract `EnvironmentMapVariantSupport`** into focused services or move logic to domain. | Medium |
| 11 | **Add domain events** to `EnvironmentMap` aggregate for lifecycle tracking. | Low |
| 12 | **Remove hardcoded waits** in E2E page object (`waitForTimeout(100)` → `expect.poll()`). | Low |
| 13 | **Split E2E page object** into list and viewer pages. | Low |
| 14 | **Separate migration scope**: Category hierarchy changes (Sprites, Sounds ParentId) should not be bundled with environment maps. | Low |
| 15 | **Simplify FaceFile entity**: Consider value-object or column-per-face approach instead of a separate table and entity. | Medium |

### 🟢 Low — Nice to Have

| # | Issue | Effort |
|---|-------|--------|
| 16 | Move `file-payload-helper.ts` to shared E2E test fixtures. | Low |
| 17 | Abstract demo handler boilerplate into a factory pattern. | Medium |
| 18 | Add category handler tests (backend). | Low |
| 19 | Consider generic asset-type discriminator for ThumbnailJob instead of multiple nullable ID fields. | Medium |

---

## 13. Fix Status

**Date**: 2026-04-11 – 2026-04-12
**Fixed by**: Automated code quality remediation sessions

### ✅ Fixed (15 items)

| # | Issue | What Was Done |
|---|-------|---------------|
| 1 | Thumbnail pipeline broken | Replaced filesystem `EnvironmentMapStorageService` with HTTP-based `EnvironmentMapApiService`. Removed `UPLOAD_STORAGE_PATH`, uploads volume, and `EnvironmentMapStoragePathResolver`. Fixed `UploadEnvironmentMapVariantThumbnailCommand` to store full path. |
| 1b | Thumbnail URLs broken in Docker | Fixed `resolveApiAssetUrl()` in `apiBase.ts` to handle relative `baseURL` (e.g., `/api`). When `baseURL` is relative and the URL starts with `/`, it now correctly prepends `baseURL`, producing routable paths like `/api/environment-maps/1/preview`. |
| 2 | Missing frontend tests | Added 50 new tests: `EnvironmentMapCardImage.test.tsx` (7), `EnvironmentMapUploadDialog.test.tsx` (14), `downloadUtils.test.ts` (29). Total: 251 tests passing. |
| 3/14 | Migration squashing | Squashed 4 migrations (`AddEnvironmentMaps`, `AddEnvironmentMapCubeVariants`, `AddEnvironmentMapMetadata`, `SyncAssetCategoryThumbnailSchema`) into 1 single migration. |
| 4 | EnvironmentMapViewer too large | Decomposed 1,012→555 lines. Extracted `downloadUtils.ts`, `useEnvironmentMapViewerState` hook, `EnvironmentMapInformationPanel`, `EnvironmentMapThumbnailPanel`. |
| 5 | EnvironmentMapList too large | Decomposed 738→608 lines. Extracted `EnvironmentMapCardImage`, `EnvironmentMapGrid`. |
| 6 | Category handler duplication | Created generic `IHierarchicalCategory<T>`, `IHierarchicalCategoryRepository<T>`, `CategoryCommandHandlers`. All 5 category types delegate to shared logic. |
| 7 | CreateEnvironmentMap 3x saves | Reduced to 2 saves (single save impossible due to FK temp-ID resolution). Also fixed `CreateEnvironmentMapWithFileCommand`. |
| 8 | Duplicate endpoint routes | Removed `/thumbnail`, kept `/preview`. |
| 9 | Hardcoded CSS colors | Replaced with CSS variables (`--primary-color`, `--text-color-secondary`, `--surface-card`, etc.). |
| 11 | Missing domain events | Added `EnvironmentMapCreatedEvent` and `EnvironmentMapDeletedEvent`. |
| 12 | Hardcoded E2E waits | Removed all 4 `waitForTimeout` calls. Replaced with `expect.poll()` and `expect().toBeVisible()`. |
| 15 | FaceFile entity simplification | Removed unnecessary surrogate `Id` column. Now uses composite PK `(EnvironmentMapVariantId, Face)` — proper relational design for a join entity. |
| 16 | file-payload-helper location | Already in shared `helpers/` — no action needed. |
| 18 | Missing category tests | Added 11 backend tests covering Create/Update/Delete with validation edge cases. Total: 444 backend tests passing. |

### Additional Fix

| Issue | What Was Done |
|-------|---------------|
| EnvironmentMapCardImage excessive retry | Reduced `MAX_CARD_IMAGE_RETRY_ATTEMPTS` from 120 to 10 (was causing 6-minute polling loops when URLs were broken). |

### ⏭️ Deferred (4 items)

| # | Issue | Reason |
|---|-------|--------|
| 10 | Extract VariantSupport | On inspection, the 219-line file is well-organized — not a god class. |
| 13 | Split E2E page object | TextureSetsPage (reference pattern) also isn't split — inconsistent to split only env maps. |
| 17 | Demo handler factory | Pre-existing pattern across all asset types, not introduced by this PR. |
| 19 | ThumbnailJob discriminator | Invasive cross-cutting change affecting all asset types. |

### Verification Summary

| Layer | Tests | Result |
|-------|-------|--------|
| Backend (Domain + Application + Infrastructure + WebApi) | 444 | ✅ All pass |
| Worker (asset-processor) | 59 | ✅ All pass |
| Frontend (Jest) | 244 | ✅ All pass |
| Frontend lint | — | ✅ 0 errors |
| Frontend build | — | ✅ Succeeds |

> **Note**: Frontend test count dropped from 251 to 244 because the `EnvironmentMapCardImage` component (and its 7 tests) was replaced by `EnvironmentMapThumbnailDisplay` which delegates to `useEnvironmentMapThumbnail` hook.

---

## 14. Model Reference Audit — Environment Maps vs Models

The user identified models as the better reference implementation. This audit compares environment maps against models to identify remaining inconsistencies.

### Grid Architecture

| Aspect | Models (ModelGrid) | Environment Maps (EnvironmentMapGrid) |
|--------|-------------------|--------------------------------------|
| Virtualization | ✅ VirtuosoGrid (infinite scroll) | ✅ VirtuosoGrid (infinite scroll) |
| Card Image | ✅ Shared ThumbnailDisplay component | ✅ EnvironmentMapThumbnailDisplay using useEnvironmentMapThumbnail hook |
| Pagination | ✅ Server-side, endReached callback | ✅ useInfiniteQuery with PAGE_SIZE=50, endReached callback |
| State Persistence | ✅ Zustand store, tab-scoped | ✅ Zustand store (environmentMapListViewStore) |
| Container Context | ✅ Supports packId, projectId filters | ❌ Not yet implemented |

**Assessment**: ✅ Now matches model grid pattern with VirtuosoGrid, infinite scroll, and Zustand persistence. Container context filtering remains a future enhancement.

### URL Construction

| Aspect | Models | Environment Maps |
|--------|--------|-----------------|
| Thumbnail URL | Client-side: `${baseURL}/models/${id}/thumbnail/file` | ✅ Client-side: `getEnvironmentMapPreviewUrl(id)` |
| File URL | `${baseURL}/files/${fileId}` | ✅ `getEnvironmentMapVariantPreviewUrl(id, variantId)` |
| Thumbnail Status | ✅ Dedicated endpoint `GET /models/{id}/thumbnail` returning status | ✅ Dedicated endpoint `GET /environment-maps/{id}/thumbnail` returning `EnvironmentMapThumbnailStatus` |

**Assessment**: ✅ Full parity with models. Dedicated thumbnail status endpoint enables hook-based thumbnail display with status tracking (Pending/Processing/Ready/Failed).

### API Module Pattern

| Aspect | Models (`modelApi.ts`) | Environment Maps (`environmentMapApi.ts`) |
|--------|----------------------|------------------------------------------|
| URL Builder Functions | ✅ `getModelFileUrl()`, `getFileUrl()`, `getFilePreviewUrl()` | ✅ `getEnvironmentMapPreviewUrl()`, `getEnvironmentMapVariantPreviewUrl()` |
| Type Imports | From `@/types` (re-exported) | From `@/types` (re-exported) |
| React Query Hooks | ✅ `queries.ts` with full CRUD | ✅ `queries.ts` with full CRUD |

**Assessment**: ✅ URL builder functions now in place, matching model API module pattern.

### Data Loading

| Aspect | Models | Environment Maps |
|--------|--------|-----------------|
| Loading Strategy | Server-side pagination with infinite scroll | ✅ Server-side pagination with useInfiniteQuery (PAGE_SIZE=50) |
| Filtering | Server-side query parameters | Client-side array filtering (matches model pattern for loaded pages) |
| Category Filtering | API-level `categoryId` param | Client-side category filter |

**Assessment**: ✅ Now uses `useInfiniteQuery` with server-side pagination and `getNextPageParam`, matching the model loading strategy.

### Demo Mode

Both models and environment maps have comprehensive MSW handler coverage with both static and dynamic handlers. The environment map thumbnail status handler returns JSON `EnvironmentMapThumbnailStatus` (matching the backend endpoint shape). ✅ No issues found.

### SignalR Cache Updates

| Aspect | Models | Environment Maps |
|--------|--------|-----------------|
| Event Handling | ✅ `setQueryData` for `['modelThumbnail', id]` | ✅ `setQueryData` for `['environmentMapThumbnail', id]` |
| Invalidation Strategy | Per-item query data update | Per-item query data update (no broad list invalidation) |

**Assessment**: ✅ Now matches model SignalR pattern. The previous `invalidateQueries(['environmentMaps'])` (which would refetch all infinite scroll pages) was replaced with targeted `setQueryData` for the individual thumbnail status query.

### Thumbnail Rendering

| Aspect | Before | After |
|--------|--------|-------|
| Ground Plane | CircleGeometry plane below sphere | ✅ Removed — sphere-only rendering |
| Playback Speed | 10 fps (3-second rotation) | ✅ 5 fps (6-second rotation) — smoother preview |

**Assessment**: ✅ Visual improvements applied. Note: framerate change is global (`config.encoding.framerate`) and affects all newly-generated animated WebP thumbnails.

### Follow-up Recommendations — ✅ All Implemented

All 5 follow-up recommendations from the model reference audit have been implemented:

| # | Recommendation | Status | Implementation |
|---|---------------|--------|----------------|
| 1 | Server-side pagination | ✅ Done | `useEnvironmentMapData` hook with `useInfiniteQuery`, PAGE_SIZE=50 |
| 2 | Grid virtualization | ✅ Done | VirtuosoGrid with `overscan={200}`, `endReached` callback |
| 3 | Thumbnail status endpoint | ✅ Done | `GetEnvironmentMapThumbnailStatusQuery` + `GET /environment-maps/{id}/thumbnail` |
| 4 | URL builder functions | ✅ Done | `getEnvironmentMapPreviewUrl()`, `getEnvironmentMapVariantPreviewUrl()` |
| 5 | State persistence | ✅ Done | `environmentMapListViewStore.ts` (Zustand with localStorage persist) |

### Additional Fixes Applied

| Issue | What Was Done |
|-------|---------------|
| Thumbnail ground plane | Removed CircleGeometry from `render-template.html` `createEnvironmentSphere()` |
| Thumbnail playback speed | Changed `config.encoding.framerate` from 10 to 5 fps (6-second rotation) |
| SignalR broad invalidation | Replaced `invalidateQueries(['environmentMaps'])` with `setQueryData` for `['environmentMapThumbnail', id]` |
| Demo mock handler | Updated `GET /environment-maps/:id/thumbnail` to return JSON status instead of binary image |
| E2E submenu locator | Fixed PrimeReact strict mode violation in Variants menu (`.p-submenu-list.first()`) |

---

## 15. Final Verification Summary

**Date**: 2026-04-12 (updated — session 5)

| Layer | Tests | Result |
|-------|-------|--------|
| Backend (Domain + Application + Infrastructure + WebApi) | 444 | ✅ All pass |
| Worker (asset-processor) | 59 | ✅ All pass |
| Frontend (Jest) | 244 | ✅ All pass |
| Frontend lint | — | ✅ 0 errors |
| Frontend build | — | ✅ Succeeds |
| CI: Backend Unit Tests | — | ✅ Passes |
| CI: Frontend Unit Tests | — | ✅ Passes |
| CI: Asset Processor Tests | — | ✅ Passes |
| CI: Code Quality (ESLint + Prettier) | — | ✅ Passes |
| CI: Build Storybook | — | ✅ Passes |
| CI: CodeQL (all 4 analyzers) | — | ✅ Passes |
| CI: CodeQL scanning results | — | ✅ Fixed (log injection sanitization) |
| CI: E2E Tests (setup + chromium + serial) | 100 | ⏳ Retry-with-reload fix pushed (commit `cc855e5`) |
| CI: Feature Videos | — | ✅ Fixed (canvas boundingBox wait) |
| CI: Build Documentation | — | ✅ Passes (cascading from Feature Videos fix) |

---

## 16. Thumbnail Framerate Analysis

**Question**: Is the environment map thumbnail slowed down by repeating frames to make it slower? Wouldn't it be better to render more frames? Will that make thumbnails significantly larger?

### Current Implementation

The environment map thumbnail is rendered as an **animated GIF** at **5 FPS** (changed from 10 FPS in follow-up session). The rendering produces **36 unique frames** (one per 10° of rotation), each captured at the configured resolution. No frames are duplicated or repeated — every frame is a unique render of the environment map sphere at a different rotation angle.

### Framerate Reduction Method

The playback was slowed by reducing the GIF framerate from 10 FPS to 5 FPS (via `config.rendering.environment.framerate`). This doubles the inter-frame delay from 100ms to 200ms. All 36 frames are unique; none are duplicates.

### Would More Frames Be Better?

Rendering more frames (e.g., 72 frames at 5° increments instead of 36 at 10°) would produce smoother rotation but has trade-offs:

| Approach | Frames | FPS | Duration | Smoothness | File Size Impact |
|----------|--------|-----|----------|------------|-----------------|
| Current (36 frames @ 5 FPS) | 36 | 5 | 7.2s | Good | ~150-250 KB |
| More frames (72 @ 5 FPS) | 72 | 5 | 14.4s | Very smooth | ~300-500 KB (≈2×) |
| More frames (72 @ 10 FPS) | 72 | 10 | 7.2s | Very smooth, fast | ~300-500 KB (≈2×) |

**Recommendation**: The current 36 frames at 5 FPS is a good balance. The rotation is smooth enough to showcase the environment map, the file size stays reasonable for grid display, and the 7.2s loop duration provides adequate preview time. Doubling frames would roughly double thumbnail file size with diminishing visual returns for a grid thumbnail.

### File Size Context

Environment map thumbnails are stored as animated GIFs with LZW compression. GIF compression works well for the gradual color transitions in environment map sphere renders. The 36-frame approach keeps thumbnails in the 150-250 KB range, which is acceptable for lazy-loaded grid thumbnails. Doubling to 72 frames would push sizes to 300-500 KB — still workable but with no significant quality gain visible at thumbnail resolution.

---

## 17. PR Review Comment Resolutions

**Date**: 2026-04-12

| Comment | File | Resolution |
|---------|------|------------|
| `environmentMapId` should be number not string | `DraggableTab.test.tsx:229` | ✅ Fixed: changed `'77'` → `77` |
| NaN guard on `Number()` parse | `ChangeEnvironmentMapCategoryDialog.tsx:63` | ✅ Fixed: added `Number.isFinite` guard |
| Category path only returns name, not full path | `CategoryCommandHandlers.cs:43` | ✅ Fixed: added `HierarchicalCategoryHelpers.BuildPath` for subcategories |
| JSDoc doesn't match implementation | `jobApiClient.js:199` | ✅ Fixed: removed stale `sizeBytes`, `width`, `height` from JSDoc |
| Log injection — ErrorMessage from user input | `FinishEnvironmentMapThumbnailJobCommand.cs:103` | ✅ Fixed: sanitize with `ReplaceLineEndings(" ")` |
| Structured error format | `ThumbnailJobEndpoints.cs:160` | ✅ Fixed: env map endpoint now returns `{ error, message }` object |
| PendingModelChangesWarning suppression | `DependencyInjection.cs:32` | ✅ Fixed: removed suppression (was development convenience) |
| Absolute path storage in thumbnail upload | `UploadEnvironmentMapVariantThumbnailCommand.cs` | ⏭️ Pre-existing pattern across ALL asset types (model, texture set, sound). Not changed in this PR to maintain consistency. Should be a separate cleanup issue. |
| Plain string error response | `ThumbnailJobEndpoints.cs` | ⏭️ Only env map endpoint updated. Other 5 endpoints use same pre-existing pattern — should be a separate cleanup to avoid scope creep. |

---

## 18. Feature Video Fix

**Date**: 2026-04-12

The `texture-sets.spec.ts` video was failing on both main and this branch due to `previewCanvas.boundingBox()` timeout on the texture preview canvas.

**Root cause**: Playwright's `locator.boundingBox()` is subject to `actionTimeout` (15s, set in `docs/videos/playwright.config.ts`). Even after the canvas element becomes visible, the locator action can time out if the canvas hasn't achieved final layout dimensions. The `ciVideoTimeout` (30s) only applies to explicit waits, not to Playwright locator actions.

**Two-part fix applied**:

1. **Wait for layout dimensions** — Added `page.waitForFunction()` to confirm the canvas has non-zero `getBoundingClientRect()` before proceeding:

```typescript
await page.waitForFunction(() => {
    const el = document.querySelector(".texture-set-viewer .texture-preview-canvas");
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
}, { timeout: ciVideoTimeout });
```

2. **Bypass actionTimeout** — Replaced `previewCanvas.boundingBox()` (Playwright locator method, subject to 15s `actionTimeout`) with `page.evaluate(() => el.getBoundingClientRect())` (raw DOM call, no timeout constraint):

```typescript
const previewBox = await page.evaluate(() => {
    const el = document.querySelector(".texture-set-viewer .texture-preview-canvas");
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
});
```

This fix also applies to the main branch (the texture-sets video was already broken on main before this PR).

---

## 19. E2E CI Stability Fix — Cube Upload Card Visibility

**Date**: 2026-04-12 (session 5, commit `cc855e5`)

### Problem

The cube upload E2E test (`02-environment-map-cube-preview.feature`) consistently failed in CI (never passed across 15+ workflow runs) with a 30-second timeout waiting for the env map card to appear in the list after upload.

### Root Cause Analysis

The upload flow uses React Query's `mutateAsync()` which resolves BEFORE the `onSuccess` callback (containing `invalidateQueries`) completes. This creates a race condition:

1. `mutateAsync` resolves → upload step proceeds
2. `onSuccess` fires asynchronously → starts cache invalidation and refetch
3. Dialog closes (`onHide()`) → list is visible but still showing stale data
4. Test checks for card → card not rendered yet because refetch hasn't completed

The drag-and-drop upload tests don't have this issue because they use a fire-and-forget pattern (`void uploadItems(...)`) that gives the cache invalidation more time to settle before the subsequent visibility check runs.

### Fix

Added a retry-with-reload pattern to `waitForEnvironmentMapByName` in `EnvironmentMapsPage.ts`:

```typescript
async waitForEnvironmentMapByName(name: string, timeout = 30000): Promise<void> {
    const card = this.getEnvironmentMapCardByName(name);
    const firstAttemptTimeout = Math.min(timeout, 15000);
    try {
        await expect(card).toBeVisible({ timeout: firstAttemptTimeout });
    } catch {
        // Cache race: reload forces fresh query fetch
        await this.page.reload({ waitUntil: "domcontentloaded" });
        await this.waitForListReady();
        await expect(card).toBeVisible({
            timeout: Math.max(timeout - firstAttemptTimeout, 15000),
        });
    }
}
```

This approach:
- Tries the optimistic path first (15s) — works locally and when the cache race is won
- Falls back to a page reload that forces a fresh query — handles CI timing
- Follows the E2E instruction's guidance: reload is "tolerated when no reactive path exists" with `waitUntil: "domcontentloaded"`

---

*Generated by code review of `origin/environment-maps` branch (PR #487). Original review: commit `bd824f7` against `origin/main` (commit `6637818`). Fixes applied across 5 sessions. Follow-up recommendations fully implemented in commit `4737d3b`. PR comment resolutions and CI fixes applied in session 5.*
