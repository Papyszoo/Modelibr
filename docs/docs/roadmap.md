---
sidebar_position: 1
title: Roadmap
---

# Modelibr Roadmap

Tasks ordered by priority. AI agents should work from top to bottom.

---

## Priority 1: Texture Type Improvements - Phase 3

**Why:** Complete integration with Blender and viewers for channel-packed textures.

> **📋 Detailed Design:** [TEXTURE_CHANNEL_MAPPING.md](./ai-documentation/TEXTURE_CHANNEL_MAPPING.md)

### Tasks
- [ ] Blender Addon: Import with channel mapping *(user will add as needed)*
- [ ] Blender Addon: Export packs textures *(user will add as needed)*
- [ ] Thumbnail Worker: Handle channel-packed textures *(user will add as needed)*
- [x] Three.js Viewer: Shader-based channel extraction

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
1. Add to default texture set *(only shown if one exists)*
2. Create new texture set with these textures
3. Just store as version files (current behavior)

**Batch behavior:** Apply user's choice to all texture files in batch. Non-texture files always stored on version.

**Texture assignment:** Files uploaded to texture set are associated but unassigned. User manually assigns texture type via Files tab.

- [ ] **Frontend:** Detect texture file types in upload batch
- [ ] **Frontend:** Show destination dialog when textures detected
- [ ] **Frontend:** "Remember choice" option for session/permanently
- [ ] **Frontend:** Quick-access link to open associated texture set from model preview
- [ ] **Backend:** Route texture files to appropriate destination based on choice
- [ ] **Backend:** Associate files to texture set without auto-assigning type
- [ ] **E2E tests:** Upload textures with each dialog option, verify correct destination

### D. Auto-detect Texture Type from Filename *(Future)*
Automatically assign texture type based on filename patterns (albedo, normal, roughness, etc.).

**Deferred due to complexity:**
- Overwrite logic when existing texture of same type exists
- Conflicting patterns in filenames
- User override preferences

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



---

## Guidelines for AI Agents

1. **Check this file first** before starting any work
2. **Use E2E tests as source of truth** for expected behavior
3. **If purpose is unclear, ASK user** - don't guess
4. **Keep docs, code, and tests in sync**
5. **Challenge often** - question if existing code makes sense
