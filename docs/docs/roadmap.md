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
- [ ] Three.js Viewer: Shader-based channel extraction

---

## Priority 2: User Documentation

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

## Priority 3: Promotional Website & Community

### Completed
- [x] Landing page with hero, audience cards, features, how-it-works sections
- [x] Discord and GitHub links in navbar/footer

### Remaining
- [ ] Create Discord server and update invite links
- [ ] Add screenshots/demo GIFs to landing page
- [ ] Deploy to GitHub Pages or custom domain
- [ ] Add contributor guidelines (CONTRIBUTING.md)

---

## Ideas (Not Refined)

Features that need discussion and design before implementation:

- **Stages Rework** - Current implementation disappointing; environment/lighting presets need redesign
- **Scenes** - Compose multiple models into a scene arrangement
- **VR Mode** - View models in VR headset
- **Model Categories** - Organize models into user-defined categories/folders
- **Frontend Three.js Renderer Tests** - Unit tests for 3D viewer components using Three.js test renderer



---

## Guidelines for AI Agents

1. **Check this file first** before starting any work
2. **Use E2E tests as source of truth** for expected behavior
3. **If purpose is unclear, ASK user** - don't guess
4. **Keep docs, code, and tests in sync**
5. **Challenge often** - question if existing code makes sense
