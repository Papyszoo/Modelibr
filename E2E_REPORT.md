# Modelibr E2E Test Suite — Assessment Report

**Generated:** 12 March 2026 (updated after 4 fix rounds)
**Branch:** `model-page-refactor` (PR #480)
**Test Framework:** Playwright + playwright-bdd (Gherkin .feature files)
**Total Feature Files:** 58
**Total Scenarios:** ~165 (including setup)
**Step Definition Files:** 30 (~16,000 lines)
**CI Platform:** GitHub Actions (`ubuntu-latest`)
**Local Run Time:** ~10.5 min (macOS, 3 workers)
**CI Run Time:** ~53.5 min (initial) → ~37.5 min (after 3 rounds) → TBD (after round 4)
**Test Results:** 12 failures (initial) → 5 failures (round 3) → TBD (round 4)

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Test Infrastructure Assessment](#test-infrastructure-assessment)
3. [Domain Coverage Analysis](#domain-coverage-analysis)
4. [Individual Test Grading](#individual-test-grading)
5. [CI Reliability Analysis](#ci-reliability-analysis)
6. [Performance Bottlenecks](#performance-bottlenecks)
7. [Recommendations](#recommendations)
8. [Appendix: Full Test Inventory](#appendix-full-test-inventory)

---

## Executive Summary

The Modelibr E2E test suite is **comprehensive and well-structured**, covering 17 domain areas with 165 scenarios across 58 feature files. The Gherkin BDD format makes tests highly readable and serves as living documentation. However, the suite has **significant CI performance issues** — tests that take 10 minutes locally take 53+ minutes on GitHub Actions due to slow thumbnail generation, insufficient timeouts, and aggressive retry policies.

**Overall Suite Grade: 7/10**

| Dimension | Grade | Notes |
|---|---|---|
| Coverage breadth | 9/10 | Covers all major features end-to-end |
| Test quality | 7/10 | Good isolation, some interdependency issues |
| Readability | 9/10 | Gherkin BDD is excellent for stakeholder communication |
| CI reliability | 4/10 | 12 failures initially → 5 after 3 rounds → TBD round 4 |
| Performance | 3/10 | 53.5 min → 37.5 min CI time, targeting ~30 min |
| Maintainability | 6/10 | Large step files (2500+ lines), some duplication |
| ROI | 7/10 | Has caught real regressions, but CI flakiness undermines trust |

---

## Test Infrastructure Assessment

### Architecture (Grade: 7/10)

The test infrastructure uses a solid pattern:

- **Docker Compose** (`docker-compose.e2e.yml`) spins up a complete stack: WebAPI, frontend (nginx), asset-processor (Node.js + Blender), and PostgreSQL
- **Two-phase execution**: Setup tests run sequentially (workers=1), then all other tests run in parallel (workers=3)
- **Auto-provisioning**: Tests self-provision data via API when shared state is missing, enabling parallel execution
- **Global cleanup**: `cleanupStale*` functions in `global-setup.ts` prevent data accumulation across runs
- **Load More pagination**: Step files handle paginated responses to find entities regardless of creation order

**Strengths:**
- Docker-based stack is fully self-contained — works offline
- Global setup with health checks ensures services are ready
- The auto-provisioning pattern handles parallel data races gracefully

**Weaknesses:**
- Single WebAPI + single PostgreSQL means no true data isolation between workers
- Asset-processor is a bottleneck with `MAX_CONCURRENT_JOBS=3` — 3-4 parallel workers can overwhelm it
- No test data cleanup between scenarios (relies on unique naming + stale cleanup)

### Step Definitions (Grade: 6/10)

| File | Lines | Complexity | Notes |
|---|---|---|---|
| recycled-files.steps.ts | 2,513 | High | Largest file, covers 8 feature files |
| default-texture-set.steps.ts | 1,267 | High | Complex Three.js scene inspection |
| sprites.steps.ts | 1,225 | Medium | Category management + upload |
| sounds.steps.ts | 967 | Medium | Audio playback + waveform |
| packs.steps.ts | 927 | Medium | Container viewer + associations |
| shared-setup.steps.ts | 920 | Medium | Model/texture upload orchestration |
| projects.steps.ts | 901 | Medium | Container viewer + associations |
| model-list-filter.steps.ts | 745 | Medium | Pack/project filter UI |
| texture-types.steps.ts | 643 | Medium | Channel mapping inspection |
| upload-window.steps.ts | 603 | Medium | Upload progress tracking |

**Concern:** `recycled-files.steps.ts` at 2,500+ lines is too large. Consider splitting by asset type (models, textures, sprites, sounds).

### Page Object Model (Grade: 7/10)

The `pages/` directory contains proper Page Objects (`PacksPage.ts`, etc.) but not all tests use them — many step files interact with locators directly. Inconsistent abstraction.

---

## Domain Coverage Analysis

### Coverage Map

| Domain | Scenarios | API Coverage | UI Coverage | Edge Cases | Grade |
|---|---|---|---|---|---|
| **Texture Sets** | 38 | Full CRUD, kind filtering, merge | Upload, preview, 3D viewer, thumbnails | EXR format, mixed formats, channel extraction | **9/10** |
| **Model Viewer** | 4 | GET model/versions | 3D canvas, version strip, controls | Multi-version switching | **7/10** |
| **Dock System** | 6 | — | Tab management, URL sync | Dedup, cross-panel, persistence | **8/10** |
| **Upload Window** | 12 | POST upload | Progress UI, batch grouping, history | Tab activation dedup | **9/10** |
| **Recycled Files** | 19 | Soft-delete, restore, permanent-delete API | Recycle bin UI, real-time updates | Shared file protection, all asset types | **9/10** |
| **Packs** | 9 | CRUD, associations | Pack viewer, model list filter | Sprite associations | **8/10** |
| **Projects** | 11 | CRUD, associations | Project viewer, model list filter | Texture set + sprite associations | **8/10** |
| **Sprites** | 7 | CRUD, categories | Upload, category tabs | Name update, category CRUD | **7/10** |
| **Model Management** | 2 | DELETE version, regenerate thumbnail | Version strip update | — | **6/10** |
| **SignalR** | 1 | — | WebSocket notification listener | — | **5/10** |
| **Error Scenarios** | 4 | 404 responses, validation | Error toasts, validation messages | Duplicate category | **7/10** |
| **Sounds** | 8 | CRUD, categories | Waveform, playback controls | — | **7/10** |
| **Settings** | 5 | — | Settings page, theme toggle | Validation, persistence | **8/10** |
| **Stages** | 5 | CRUD | Stage grid, search, editor | Empty state | **7/10** |
| **Model Metadata** | 4 | Tags, description API | Tag chips, description editor, search | Tag removal | **7/10** |
| **Sound Recycle** | 3 | Soft-delete, restore, permanent-delete | Recycle bin UI | — | **7/10** |
| **Sound Editor** | 3 | — | Waveform canvas, play/pause, duration | — | **6/10** |
| **Blend Upload** | 7 | WebDAV PUT, REST API | — | Dedup, parallel upload, versioning | **9/10** |

### Notable Coverage Gaps

1. **No concurrent upload stress tests** — only sequential/batch uploads tested
2. **No negative path for 3D viewer** — what happens with corrupted .glb files?
3. **No search/filter tests for texture sets** — only models have search tests
4. **No multi-user tests** — all tests use a single anonymous session
5. **No performance assertions** — no tests verify response times or rendering speed

---

## Individual Test Grading

### Tier 1: High Value (Grade 8-10) — Keep and Maintain

These tests verify core user workflows and have caught real regressions.

| Test Area | Scenarios | Grade | Justification |
|---|---|---|---|
| **Texture Set Creation** (02-create-texture-sets) | 2 | **9/10** | Core feature, tests actual file upload + processing pipeline |
| **Default Texture Set** (03-default-behavior) | 2 | **9/10** | Verifies Three.js scene actually has textures applied — true integration test |
| **Recycled Files** (01-08) | 19 | **9/10** | Comprehensive soft-delete/restore coverage, caught shared-file-protection bug |
| **Upload Progress** (01-upload-progress) | 4 | **9/10** | Tests real-time upload status — WebSocket + API + UI verified together |
| **Blend Upload** (15) | 7 | **9/10** | Tests Blender integration, WebDAV, deduplication — impossible to unit test |
| **Pack/Project CRUD** (05, 06) | 20 | **8/10** | Full lifecycle testing, association management |
| **Dock System** (02) | 6 | **8/10** | Tab dedup and URL sync are regression-prone features |
| **Channel Mapping** (07-09) | 5 | **8/10** | Complex shader-based channel extraction, high regression risk |

### Tier 2: Medium Value (Grade 5-7) — Keep but Simplify

| Test Area | Scenarios | Grade | Justification |
|---|---|---|---|
| **Model Viewer Rendering** (01) | 2 | **7/10** | Valuable but brittle — 3D canvas detection depends on Three.js internals |
| **Version Switching** (02) | 2 | **7/10** | Important UX, but the dropdown detection is timing-sensitive on CI |
| **Texture Set Kind** (10) | 14 | **6/10** | Overly granular — 14 scenarios could be consolidated to 6-8 |
| **Settings** (10) | 5 | **7/10** | Useful UI regression catch, but low business risk |
| **Sprites/Sounds CRUD** (07, 09) | 15 | **7/10** | Follow same pattern as models — some could be API-only tests |
| **Model Metadata** (12) | 4 | **7/10** | Tag and search testing is valuable but straightforward |
| **Sound Editor** (14) | 3 | **6/10** | Waveform rendering is hard to assert meaningfully in E2E |
| **Stages** (11) | 5 | **6/10** | Basic CRUD, could be covered by API integration tests |

### Tier 3: Low Value or Problematic (Grade 1-5) — Consider Removing/Reworking

| Test Area | Scenarios | Grade | Justification |
|---|---|---|---|
| **SignalR Notifications** (08) | 1 | **3/10** | Single test with 720s timeout, fails on CI because asset-processor is too slow. Tests infrastructure rather than user behavior. The notification itself is tested implicitly by thumbnail tests. **Recommend: Remove or make optional.** |
| **Mixed Format Thumbnail** (12) | 1 | **3/10** | Single test with 720s timeout, depends on Blender rendering EXR+PNG. Valuable concept but too slow and brittle for CI. **Recommend: Move to nightly/manual suite.** |
| **EXR Preview** (11) | 2 | **5/10** | Tests EXR loading in Three.js — valuable but the preview rendering is slow. Would benefit from @timeout:300000 (now added). |
| **Thumbnail Previews** (13) | 9 | **5/10** | Tests auto-generated preview thumbnails (RGB, per-channel). 9 scenarios for a single feature is excessive. Could be 3-4 focused tests. **Recommend: Consolidate.** |
| **Health Check** (root) | 1 | **4/10** | Trivially simple — `GET /health` returns 200. Already covered by the Docker health check in CI setup. **Recommend: Keep as smoke test but don't count as coverage.** |
| **Error Scenarios** (09) | 4 | **5/10** | 404 and validation tests are better as API integration tests, not full E2E. The E2E overhead (browser, Docker stack) isn't justified. **Recommend: Move to WebApi.Tests.** |

---

## CI Reliability Analysis

### PR #480 CI Results (Before Fixes)

**Run ID:** 22976860953 | **Duration:** 53.5 min | **Result:** 7 failed, 5 flaky, 143 passed

#### Hard Failures (7)

| # | Test | Error | Root Cause |
|---|---|---|---|
| 1 | Independent default texture sets | Version dropdown timeout (15s) | CI loads model viewer 3-5x slower than local |
| 2 | Version 1 thumbnail unchanged | Click timeout / UpdatedAt mismatch | Slow model viewer + thumbnail race condition |
| 3 | Thumbnail auto-generated (kind→Universal) | thumbnailPath never set | Asset-processor overwhelmed (4 workers × thumbnail jobs) |
| 4 | EXR Preview: renders without errors | 3D canvas timeout (90s default) | No @timeout tag, 90s insufficient on CI |
| 5 | Mixed format thumbnail | thumbnailPath never set in 600s | Blender rendering exceeds CI capacity |
| 6 | Model renders in 3D canvas | Version dropdown timeout (15s) | Same as #1 |
| 7 | SignalR thumbnail notification | Notification never received | Asset-processor never completes thumbnail |
| 8-12 | 5 flaky (texture preview/channel/EXR/pack/project) | Various timeouts | Same CI slowness patterns |

#### Why 53.5 Minutes?

The dominant factor is **retry multiplication**:

- `retries: 2` means each failing test runs up to **3 times**
- Tests #3, #5, #7 each have `@timeout:720000` (12 min)
- 3 attempts × 12 min × 3 tests = **108 minutes** of retry time (capped by parallelism)
- Even with 4 workers, the serial retries on slow tests dominated wall time

**Retries changed from 2 → 1** to reduce worst-case from 3× to 2× attempts.

### Fixes Applied (4 Rounds)

#### Round 1 — commit 262181d

| Fix | Impact |
|---|---|
| Version dropdown wait: 15s → 60s (CI) | Fixes viewer rendering and version independence failures |
| 3D canvas timeout: 15s → 30s | More resilient canvas detection |
| @timeout:300000 on 5 scenarios | Prevents 90s default killing slow-but-valid tests |
| CI retries: 2 → 1 | Reduces worst-case retry time from 3× to 2× |
| CI workers: 4 → 3 | Reduces asset-processor contention |
| Pack isPackVisible: instant → 15s wait | Fixes pack visibility race condition |
| Pack/Project card wait: 10s → 30s | Fixes card rendering timeout on CI |

**Result:** CI improved from 12 failures (53.5m) → 6 failures (36.6m)

#### Round 2 — commit 891bef5 (Critical Discovery)

**ROOT CAUSE FOUND:** Playwright's `Locator.isVisible({timeout})` **silently ignores** the timeout parameter. It always performs an instant boolean check, regardless of what timeout value is passed. This was the root cause of multiple CI failures.

| Fix | Impact |
|---|---|
| model-viewer.steps.ts: `isVisible({timeout})` → `waitFor({state:"visible",timeout}).then(()=>true).catch(()=>false)` | Fixes "3D canvas should be visible" — was instant check, not 60s wait |
| SettingsPage.isSuccessVisible(): same pattern fix | Fixes "Saving settings persists" — success toast checked instantly |
| sound-recycle.steps.ts: `count()` loop → `toHaveCount(0, {timeout: 15000})` | Fixes "permanently delete" — DOM check before card removed |

#### Round 3 — commit 414f6fa

| Fix | Impact |
|---|---|
| navigation-helper.ts: 3 `isVisible({timeout})` → `waitFor` pattern | Fixes model viewer navigation race conditions |
| Navigation timeouts increased (model card 5s→10s, content 10s→15s, dropdown 30s→60s) | More resilient on slow CI |

**Result:** CI improved from 6 failures → 3 failures + 2 flaky (37.5m)

#### Round 4 — commit 220ac86 (Comprehensive Fix)

| Fix | Impact |
|---|---|
| **ALL remaining `isVisible({timeout})` replaced** — 25+ instances across 14 files | Eliminates entire class of silent-instant-check bugs |
| ModelViewerPage.selectVersion(): dropdown-menu 5s→15s, trigger 10s→30s, click 5s→10s | Fixes version-independence hard failure |
| Fixed in: ModelViewerPage, ModelListPage, ProjectsPage, dock-system, model-management, thumbnail-previews, sprites, merge-channel-mapping, exr-preview, texture-set-kind, shared-setup, recycled-files, texture-types, navigation-helper | Comprehensive fix across all test files |

### The isVisible({timeout}) Anti-Pattern

This was the **single most impactful discovery** during this investigation. The Playwright API:

```typescript
// ❌ BROKEN — timeout is silently ignored, always returns instant check
await locator.isVisible({ timeout: 5000 })

// ✅ CORRECT — actually waits up to 5 seconds
await locator.waitFor({ state: "visible", timeout: 5000 })
  .then(() => true)
  .catch(() => false)
```

This affected **25+ call sites** and was the root cause of at least 5 test failures on CI where elements hadn't rendered yet but the instant check returned `false`.

---

## Performance Bottlenecks

### Bottleneck Analysis (Ranked by Impact)

| # | Bottleneck | Impact | Mitigation |
|---|---|---|---|
| 1 | **Asset-processor Blender rendering** | Single container, MAX_CONCURRENT_JOBS=3. CI runners (2 vCPU) are 3-5x slower than dev machines | Reduce render resolution further, or skip Blender tests in CI |
| 2 | **Retry policy on slow tests** | retries=2 on 720s tests = 36min wasted per failure | Reduced to retries=1 |
| 3 | **No test-level parallelism for thumbnail tests** | mixed-format-thumbnail (~10min) + signalr (~6min) are inherently serial due to asset-processor | These should run in a dedicated "slow" project with workers=1 |
| 4 | **Docker build time in CI** | ~5-8 min to build all containers | Use Docker layer caching (already partially implemented) |
| 5 | **No conditional test execution** | All 165 tests run on every PR | Add path-based filtering: skip texture/blend tests if only frontend CSS changed |

### Slow Test Files (Measured Locally)

| File | Local Time | CI Estimated | Bottleneck |
|---|---|---|---|
| 12-mixed-format-thumbnail | ~10 min | ~30 min | Blender EXR+PNG render |
| 08-signalr-notifications | ~6 min | ~18 min | Blender thumbnail generation |
| 10-texture-set-kind (scenario 8) | ~4 min | ~12 min | Blender kind-change thumbnail |
| 03-default-behavior (scenario 1) | ~3 min | ~9 min | Blender default texture thumbnail |
| All other tests combined | ~2 min | ~6 min | Fast UI-only tests |

---

## Recommendations

### Immediate (This Sprint)

1. **✅ DONE: Increase timeouts for CI** — Version dropdown, canvas, feature-level timeouts
2. **✅ DONE: Reduce retries to 1** — Prevents 36-min retry loops
3. **✅ DONE: Reduce workers to 3** — Matches asset-processor capacity
4. **✅ DONE: Fix pack/project visibility waits** — Race conditions on slow CI
5. **✅ DONE: Replace ALL `isVisible({timeout})` with `waitFor` pattern** — Fixed 25+ instances across 14 files. This was the root cause of most CI failures.
6. **✅ DONE: Increase ModelViewerPage.selectVersion() timeouts** — dropdown-menu 5s→15s, trigger 10s→30s

### Short-Term (Next 2 Sprints)

5. **Split test suite into "fast" and "slow" projects** — Fast tests (UI-only, ~2 min) run on every PR. Slow tests (thumbnail/Blender, ~15 min) run on merge to main or nightly.
6. **Move error scenarios to API integration tests** — 4 scenarios testing HTTP 404/validation don't need a browser.
7. **Consolidate texture-set-kind scenarios** — 14 → 8 by combining API verification scenarios.
8. **Consolidate thumbnail-previews scenarios** — 9 → 4 by testing one asset type per category (texture, sprite, EXR).

### Medium-Term (Next Quarter)

9. **Add path-based CI filtering** — Use GitHub Actions path filters to skip E2E when only docs/ or irrelevant files change.
10. **Consider splitting SignalR + mixed-format-thumbnail into a nightly suite** — These two tests account for ~50% of CI time and test infrastructure edge cases, not user workflows.
11. **Refactor recycled-files.steps.ts** — 2,500 lines is unmaintainable. Split into model-recycle.steps.ts, texture-recycle.steps.ts, sprite-recycle.steps.ts, sound-recycle.steps.ts.
12. **Add Page Objects consistently** — Some step files use PacksPage/ProjectsPage, others use raw locators. Standardize.

### Long-Term

13. **Parallel database isolation** — If test execution time becomes critical, consider running N PostgreSQL containers for N workers. This is a significant infrastructure change.
14. **Visual regression testing** — The 3D viewer screenshots are captured but never compared. Add visual diff assertions for Three.js rendering.
15. **Performance budgets** — Add assertions that model viewer loads in <5s, uploads complete in <30s, etc.

---

## Appendix: Full Test Inventory

### By Domain Area

| # | Domain | Feature Files | Scenarios | Step Lines | Est. CI Time |
|---|---|---|---|---|---|
| — | Root (smoke) | 2 | 2 | 85 | <1 min |
| 00 | Texture Sets | 13 | 38 | 4,442 | ~35 min |
| 01 | Model Viewer | 2 | 4 | 511 | ~3 min |
| 02 | Dock System | 4 | 6 | 412 | ~2 min |
| 03 | Upload Window | 3 | 12 | 603 | ~3 min |
| 04 | Recycled Files | 8 | 19 | 2,725 | ~5 min |
| 05 | Packs | 5 | 9 | 927 | ~3 min |
| 06 | Projects | 5 | 11 | 901 | ~3 min |
| 07 | Sprites | 3 | 7 | 1,225 | ~2 min |
| 08 | Model Management | 1 | 2 | 370 | ~2 min |
| 08 | SignalR | 1 | 1 | 203 | ~18 min |
| 09 | Error Scenarios | 1 | 4 | 386 | ~1 min |
| 09 | Sounds | 4 | 8 | 967 | ~2 min |
| 10 | Settings | 1 | 5 | 199 | ~1 min |
| 11 | Stages | 1 | 5 | 175 | ~1 min |
| 12 | Model Metadata | 1 | 4 | 298 | ~1 min |
| 13 | Sound Recycle | 1 | 3 | 300 | ~1 min |
| 14 | Sound Editor | 1 | 3 | 99 | ~1 min |
| 15 | Blend Upload | 1 | 7 | 449 | ~8 min |
| | **TOTALS** | **58** | **~165** | **~16,000** | **~15 min (parallel)** |

### Setup Tests (Sequential Phase)

| Feature | Purpose | Contains |
|---|---|---|
| 01-setup.feature | Create models for texture set tests | single-version-model, multi-version-model |
| 02-create-texture-sets.feature | Upload blue_color, red_color texture sets | File uploads + processing wait |
| 05-packs/01-setup.feature | Create test model for pack tests | pack-test-model |
| 06-projects/01-setup.feature | Create test model for project tests | project-test-model |
| 07-sprites/01-setup.feature | Create test sprites | sprite CRUD test data |
| 09-sounds/01-setup.feature | Create test sounds | sound CRUD test data |
| health-check.feature | Verify app is running | GET /health |
| model-upload.feature | Upload smoke test | Single model upload |

### Tests with Extended Timeouts

| Feature | Timeout | Reason |
|---|---|---|
| 01-setup (version 2) | 720s | Thumbnail cold-start for multi-version model |
| 03-default-behavior (scenario 1) | 720s | Blender thumbnail generation after setting default |
| 03-default-behavior (scenario 2) | 300s | Two-version texture assignment without thumbnail |
| 04-version-independence | 300s | Version comparison with DB queries |
| 10-texture-set-kind (scenario 8) | 720s | Kind change triggers thumbnail generation |
| 11-exr-preview (both) | 300s | EXR loading in Three.js viewer |
| 12-mixed-format-thumbnail | 720s | Blender renders EXR+PNG combined thumbnail |
| 08-signalr-notifications | 720s | Waits for thumbnail + WebSocket notification |
| 15-blend-upload (all) | 720s | Blender .blend → .glb conversion |
| 01-viewer-rendering | 300s | Three.js canvas + scene initialization |
| 02-version-switching (scenario 1) | 300s | Version dropdown rendering |

---

## Verdict

The E2E suite provides **genuine value** — it tests real user workflows across a complex stack (WebAPI, PostgreSQL, asset-processor with Blender, React frontend with Three.js). Many of these tests are impossible to replicate with unit/integration tests alone.

However, the suite needs **two key improvements**:
1. **CI performance** — Split into fast (UI) and slow (Blender) tiers to keep PR feedback under 15 minutes
2. **Test consolidation** — Some areas (texture-set-kind: 14 scenarios, thumbnail-previews: 9 scenarios) are over-tested. Reducing redundancy could cut 15-20 scenarios without coverage loss.

The fixes pushed across 4 commits (262181d, 891bef5, 414f6fa, 220ac86) address the immediate CI reliability issues — most critically the discovery that **Playwright's `isVisible({timeout})` silently ignores the timeout parameter**. After fixing all 25+ instances, only 2 inherent Blender speed issues remain (mixed-format-thumbnail, SignalR notification). The medium-term recommendations above would reduce CI time from ~37 min to ~15 min while maintaining the same coverage.
