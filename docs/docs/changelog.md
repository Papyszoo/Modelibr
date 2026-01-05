---
sidebar_position: 100
title: Changelog
---

# Changelog

History of completed features and improvements.

---

## 2026-01-05

### Texture Type Improvements (Phases 0-2 Complete)
- Removed deprecated `Diffuse` and `Specular` texture types
- Added Height/Displacement/Bump mutual exclusivity validation
- Implemented channel mapping UI (Files tab with per-channel dropdowns)
- Added Texture Types tab with source selection per type
- Created merge dialog enhancement for per-file channel mapping
- All E2E tests passing for new texture workflow

### Promotional Website
- Created landing page with hero, audience cards, features, and how-it-works sections
- Added Discord and GitHub links to navbar/footer

---

## 2026-01-03

### E2E Test Expansion
- Phase 1: Packs & Projects CRUD and filtering
- Phase 2: Sprites CRUD (upload, update, search, categories)
- Phase 3: Sprite Associations (add/remove sprites to packs and projects)
- Phase 4: Model Management (version deletion, thumbnail regeneration/upload)

### Model List Filter Redesign
- Replaced single dropdown with multiselect filters for Packs and Projects
- Filters moved to dedicated filter section in `ModelGrid.tsx`

---

## 2026-01-02

### Frontend Unit Tests
- Created comprehensive unit tests for `uploadProgressStore` (100% coverage of store actions)
- Created unit tests for `textureTypeUtils`
- Fixed all failing frontend tests (22 suites, 224 tests passing)

### Texture Reuse
- Blender addon texture reuse by Modelibr ID prefix

### User Documentation
- Created Docusaurus docs site with UI, models, texture sets, packs, and projects documentation
