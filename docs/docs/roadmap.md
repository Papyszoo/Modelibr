---
sidebar_position: 1
title: Roadmap
---

# Modelibr Roadmap

Tasks ordered by priority. AI agents should work from top to bottom.

---

## Priority 1: E2E Test Expansion

**Why:** Prevent regressions on complete features that currently have zero test coverage.

### Phase 1: Packs & Projects (CRITICAL)
Complete backend features with 12 endpoints each but no E2E tests.

- [x] **Packs E2E Tests** ✅
  - [x] Create/Read/Update/Delete pack
  - [x] Add/remove models to pack
  - [x] Add/remove texture sets to pack
  - [ ] Add/remove sprites to pack
  - [ ] Pack filtering on model list

- [ ] **Projects E2E Tests**
  - [ ] Create/Read/Update/Delete project
  - [ ] Add/remove models to project
  - [ ] Add/remove texture sets to project
  - [ ] Add/remove sprites to project
  - [ ] Project filtering on model list

### Phase 2: Model Management (HIGH)
User-facing features that could break silently.

- [ ] **Delete Model Version** - `DELETE /models/{modelId}/versions/{versionId}`
- [ ] **Thumbnail Regeneration** - `POST /models/{id}/thumbnail/regenerate`
- [ ] **Custom Thumbnail Upload** - `POST /models/{id}/thumbnail/upload`

### Phase 3: Sprites CRUD (MEDIUM)
Only recycling is tested, but create/update/list are not.

- [ ] **Sprites E2E Tests**
  - [ ] Create sprite with file upload
  - [ ] Update sprite name/type
  - [ ] List sprites with filters
  - [ ] Sprite categories CRUD

### Phase 4: Stages (LOW)
Environment/lighting presets feature.

- [ ] **Stages E2E Tests**
  - [ ] Create/Read/Update stage
  - [ ] Save and load stage configuration

---

## Priority 2: Texture Type Improvements

**Why:** Enables ORM channel-packed textures.

### Phase 1: Simplify Types (Quick Win)
- [ ] Remove `Diffuse`, `Specular` from TextureType enum
- [ ] Add RGB group vs single-channel classification
- [ ] Update frontend texture type selector

### Phase 2: Channel Mapping (Major)
- [ ] Backend: Store channel mapping metadata
- [ ] Frontend: Files View with RGB/split logic
- [ ] Frontend: Texture Types View with source selection
- [ ] Frontend: Real-time grayscale channel extraction
- [ ] Viewer: Shader-based channel extraction

### Phase 3: Integration
- [ ] Blender Addon: Import with channel mapping *(user will add as needed)*
- [ ] Blender Addon: Export packs textures *(user will add as needed)*
- [ ] Thumbnail Worker: Handle channel-packed textures *(user will add as needed)*

### E2E Test Scenarios (to implement after feature)
```gherkin
Feature: Channel-Packed Texture Upload
  Scenario: Upload ORM texture and assign channels
    Given I have a texture set
    When I upload "material_orm.png"
    And I set RGB mode to "Split Channels"
    And I assign R channel to "AO"
    And I assign G channel to "Roughness"
    And I assign B channel to "Metallic"
    Then the texture types view should show AO, Roughness, Metallic as assigned

  Scenario: Upload texture with Normal in RGB and Height in Alpha
    When I upload "material_normal_height.png"
    And I set RGB to "Normal"
    And I set A channel to "Height"
    Then the texture types view should show Normal and Height as assigned

  Scenario: View grayscale preview for single-channel type
    Given a channel-packed texture with Roughness in G channel
    When I view "Roughness" in texture types view
    Then the preview should show a grayscale image extracted from G channel

  Scenario: Switch Height/Displacement/Bump mode
    Given Height is assigned to a texture
    When I change the mode dropdown from "Height" to "Displacement"
    Then the backend should store "Displacement" as the type
    And the Blender addon should use displacement node on import
```

---

## Priority 3: User Documentation

- [ ] 3D Viewer Controls (detailed guide)

---

## Needs Refinement

Features that exist but need design/implementation improvements before E2E testing.

### Model Tags & Description
**Status:** Unhappy with service worker results. Needs refactoring before testing.

- [ ] Review current tags/description generation logic
- [ ] Refine service worker prompts or approach
- [ ] Add E2E tests after refactoring

### Settings Functionality
**Status:** Mostly mocked, not many things work.

- [ ] Audit which settings actually persist/work
- [ ] Implement missing settings functionality
- [ ] Add E2E tests for working settings

---

## Blocked: Needs User Action

These tasks require manual user action and cannot be completed by AI:

- [ ] **Manual screenshots** for docs:
  - File upload dialog (native picker)
  - Batch upload progress window
  - Version upload modal
  - Context menus

---

## Priority 4: Promotional Website (Future)

- [ ] Landing page for Modelibr
- [ ] Feature overview with visuals
- [ ] Documentation integration
- [ ] Deployment (GitHub Pages / self-hosted TBD)

---

## Ideas (Not Refined)

Features that need discussion and design before implementation:

- **Scenes** - Compose multiple models into a scene arrangement
- **VR Mode** - View models in VR headset
- **Model Categories** - Organize models into user-defined categories/folders
- **Frontend Three.js Renderer Tests** - Unit tests for 3D viewer components using Three.js test renderer

---

## Completed

- **Frontend Unit Tests** (2026-01-02)
  - Created comprehensive unit tests for `uploadProgressStore` (100% coverage of store actions)
  - Created unit tests for `textureTypeUtils`
  - Resolved global Jest configuration issues with `import.meta.env`
  - Fixed all failing frontend tests (22 suites, 224 tests passing)
- **Texture Reuse** (2026-01-02)
- Unit tests for `textureTypeUtils.ts` (15 tests for utility functions)
- Unit tests for `uploadProgressStore.ts` (19 tests covering all store methods)
- Unit test review (backend kept, removed `ApiClient.test.ts`)
- User Interface documentation (panels, tabs, URL state)
- Updated texture-sets.md with version independence
- Documentation sync for all features

---

## Guidelines for AI Agents

1. **Check this file first** before starting any work
2. **Use E2E tests as source of truth** for expected behavior
3. **If purpose is unclear, ASK user** - don't guess
4. **Keep docs, code, and tests in sync**
5. **Challenge often** - question if existing code makes sense
