---
sidebar_position: 100
title: Changelog
---

# Changelog

History of completed features and improvements.

---

## 2026-02-03

### WebDAV Hierarchical Restructuring

- Models: organized by version subdirectories (`/Models/{ModelName}/v{N}/`)
- TextureSets: separated into TextureTypes/ and Files/ subdirectories
- Added read-only DbContext query pattern for optimized WebDAV data loading

---

## 2026-02-02

### Texture Channel Mapping Fixes

- Fixed frontend bug where changing channel mapping created duplicate textures instead of updating
- Updated database constraint to enforce strict uniqueness for per-channel texture mapping (one type per channel per file)
- Added migration to clean up existing duplicate texture mappings
- Fixed Albedo persistence when switching to Split Channels in frontend
- Resolves bug where files disappeared from UI when unmapped (implemented TextureType.SplitChannel placeholder)
- Fixed bug where channel mapping was incorrectly inferred from other channels
- Hidden internal "SplitChannel" type from UI lists and WebDAV folders
- Deduplicated file listings in WebDAV
- Implemented on-the-fly channel extraction for WebDAV (opening single channel file now serves extracted channel properly)

---

## 2026-01-07

### Blender Addon: Selective Upload & Channel Packing

- Implemented selective texture upload - only uploads modified textures, references unchanged by file ID
- Added `classify_textures_for_export()` for modification detection with per-file hash comparison
- Added `_create_texture_set_selective()` for mixed source texture sets
- Added channel packing dialog with "Pack into ORM" option in upload UI
- Created `pack_textures_to_orm()` to combine AO/Roughness/Metallic

### Blender Addon: Test Infrastructure

- Created `test_texture_flow.py` with 6 integration tests for shader analysis
- Updated CI to install Blender via snap + Xvfb for headless testing

### Texture Type Improvements (Phase 3)

- Blender Addon: Import with channel mapping support for ORM packed textures
- Added `extract_channel_from_image()` function to extract R/G/B/A channels
- Integrated `sourceChannel` data from API into texture import workflow

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
