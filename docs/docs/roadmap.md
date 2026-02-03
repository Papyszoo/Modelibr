---
sidebar_position: 1
title: Roadmap
---

# Modelibr Roadmap

Tasks ordered by priority. AI agents should work from top to bottom.

---

## Priority 1: Texture Type Improvements - Phase 3 ✅

**Completed 2026-01-07.** See [Changelog](./changelog.md) for details.

---

## Priority 2: Enhanced Model File Support

**Why:** Better support for industry-standard 3D formats with external dependencies and embedded assets.

### A. Multi-file glTF/GLB Upload

Files with the same base name uploaded **in the same batch** (e.g., `Model.gltf` + `Model.bin` dropped together) should be grouped into one model version.

- [ ] **Backend:** Detect related files by matching base filename within same upload batch
- [ ] **Backend:** Store `.bin` files as associated files on the model version
- [ ] **Backend:** Serve glTF with correct resource paths for `.bin` references
- [ ] **Frontend:** Group files by base name in upload progress UI (same batch only)
- [ ] **Worker:** Load glTF with all dependencies from storage
- [ ] **E2E tests:** Upload multi-file glTF, verify viewing works

### B. Extract Embedded Textures from GLB/FBX

After upload, extract embedded textures into a Texture Set for use in Blender addon.

- [ ] **Worker:** Parse GLB binary and extract embedded images
- [ ] **Worker:** Parse FBX and extract embedded textures
- [ ] **Backend:** Auto-create TextureSet from extracted textures
- [ ] **Backend:** Associate created TextureSet with model version
- [ ] **Backend:** Detect texture type from glTF material properties (baseColor, normal, etc.)
- [ ] **Frontend:** Show "Embedded textures extracted" notification
- [ ] **E2E tests:** Upload GLB with textures, verify TextureSet created

### C. Smart Texture Upload to Model Versions

When uploading texture files (png, jpg, etc.) to a model version, prompt user for destination.

**Dialog options:**

1. Add to default texture set _(only shown if one exists)_
2. Create new texture set with these textures
3. Just store as version files (current behavior)
4. \*To think about - create new version of a model - but what to do with textures?

**Batch behavior:** Apply user's choice to all texture files in batch. Non-texture files always stored on version.

**Texture assignment:** Files uploaded to texture set are associated but unassigned. User manually assigns texture type via Files tab.

- [ ] **Frontend:** Detect texture file types in upload batch
- [ ] **Frontend:** Show destination dialog when textures detected
- [ ] **Frontend:** "Remember choice" option for session/permanently
- [ ] **Frontend:** Quick-access link to open associated texture set from model preview
- [ ] **Backend:** Route texture files to appropriate destination based on choice
- [ ] **Backend:** Associate files to texture set without auto-assigning type
- [ ] **E2E tests:** Upload textures with each dialog option, verify correct destination

### D. Auto-detect Texture Type from Filename _(Future)_

Automatically assign texture type based on filename patterns (albedo, normal, roughness, etc.).

**Deferred due to complexity:**

- Overwrite logic when existing texture of same type exists
- Conflicting patterns in filenames
- User override preferences

---

---

## Priority 2.5: Blender Addon Test Improvements

**Why:** Current tests only cover ~20% of functionality (mappings/config). Critical import/export logic is untested and could break silently.

### Current State

- **80 unit tests** run in CI but use `fake-bpy-module` (type stubs only)
- **No actual Blender execution** - can't test shader analysis, texture application, export
- **Coverage gap:** `analyze_material_textures()`, `apply_textures_to_materials()`, `export_textures()` all untested

### Implementation Plan

#### A. Enable Blender in CI (Priority)

Modify `.github/workflows/ci.yml` to run real Blender tests.

**Tools:**

- `pytest-blender` - pytest plugin for headless Blender testing
- Xvfb - virtual framebuffer for display

**CI Changes needed:**

```yaml
- name: Install Blender
  run: |
      sudo snap install blender --classic
      blender --version

- name: Run Blender integration tests
  uses: GabrielBB/xvfb-action@v1
  with:
      run: blender -b --python tests/integration/run_in_blender.py
```

- [x] Add `numpy` to test dependencies
- [x] Update CI job to install Blender via snap
- [x] Add Xvfb for headless display
- [x] Run integration tests inside Blender

#### B. Integration Test Suite ✅

Tests that run inside Blender with real materials.

**Created:** `blender-addon/tests/integration/test_texture_flow.py`

- Create Blender scene with materials programmatically
- Test full import/export cycle
- Verify shader connections are correct

- [x] Create test scene builder helper
- [x] Test `analyze_material_textures()` with real nodes
- [x] Test `classify_textures_for_export()` classification
- [x] Test channel extraction from ORM textures

#### C. Test Categories

| Category    | Location             | Runs In       | Coverage                      |
| ----------- | -------------------- | ------------- | ----------------------------- |
| Unit        | `tests/unit/`        | Python        | Mappings, config, logic       |
| Integration | `tests/integration/` | Blender       | Shader analysis, texture flow |
| E2E         | `tests/e2e/`         | Blender + API | Upload/download cycle         |

---

## Priority 3: User Documentation

- [ ] 3D Viewer Controls (detailed guide)

---

## Needs Refinement

Features that exist but need design/implementation improvements before E2E testing.

### Multiple Texture Sets per Model

**Status:** Complex feature with many edge cases. Needs thorough design before implementation.

- [ ] Design how multiple sets work in Blender addon import/export
- [ ] Handle edge case: which set to use on import?
- [ ] Handle edge case: creating vs updating sets on export

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

## Priority 4: Promotional Website & Community

### Completed

- [x] Landing page with hero, audience cards, features, how-it-works sections
- [x] Discord and GitHub links in navbar/footer
- [x] Create Discord server and update invite links
- [x] Deploy to GitHub Pages or custom domain

### Remaining

- [ ] Add screenshots/demo GIFs to landing page
- [ ] Add contributor guidelines (CONTRIBUTING.md)

---

## Ideas (Not Refined)

Features that need discussion and design before implementation:

- **Stages Rework** - Current implementation disappointing; environment/lighting presets need redesign
- **Scenes** - Compose multiple models into a scene arrangement
- **VR Mode** - View models in VR headset
- **Model Categories** - Organize models into user-defined categories/folders
- **Frontend Three.js Renderer Tests** - Unit tests for 3D viewer components using Three.js test renderer
- **Interactive Lighting Controls** - Click light helper to toggle on/off, right-click for settings popup (distance, size, color, intensity). Part of Stages rework.
- **Electron/Tauri Desktop App** - Wrap frontend in native desktop shell for one-click "Open in File Explorer" functionality. Enables native file manager integration that browser-based PWA cannot provide. Blender addon registration for protocol handling is optional alternative.

---

## Guidelines for AI Agents

1. **Check this file first** before starting any work
2. **Use E2E tests as source of truth** for expected behavior
3. **If purpose is unclear, ASK user** - don't guess
4. **Keep docs, code, and tests in sync**
5. **Challenge often** - question if existing code makes sense
