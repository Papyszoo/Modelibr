# Release history and what each cut taught

## v0.3.0 - 2026-07-02

Bundled: three.js r185 + local-first preview IBL (#539), shared cross-runtime
render lib (#537), STL/3MF (#536), tags-all-types (#523).

Merge order used: #545 (machine-name scrub) → #546 (E2E @serial) → #541 → #542 →
#543 → #540 (version bump) into `version/0.3`, then #547 → `main` + tag.

Release-review findings were posted as a comment on the prep PR and fixed one
commit per finding in #542: displacement NaN fallback, per-asset tag vocabulary,
`viewerSettingsStore` persist version+migrate, demo emissive/bump/alpha via shared
TextureType, dispose textured-model materials on rebuild.

**Deferred cleanups** (noted, not done - cross-runtime/build risk): TexturedModel
5-component consolidation, model-normalization cross-runtime extraction,
displacement scale/bias shared constant, cross-package path alias.

**Post-release CI hardening (#548–#551 → `version/0.3.1`):** the v0.3.0 main push
went red because two GPU-dependent jobs flaked on GitHub's GPU-less runners.
`generate-videos` flaked → blocked `build-docs` → **the Pages deploy was skipped**
and 0.3 docs didn't go live until a manual `gh run rerun --failed`.

## v0.3.1 - 2026-07-03

PR #555, tag `v0.3.1`. Contents: #548 (@serial E2E lane), #549 (installer smoke
`--fast-only` + updater diagnostics), #550 (Windows self-update silent fix), #551
(video-gen retry), #552 (FileType registry), #553 (skills refresh), #554 (bump).

**`--fast-only` validated live:** the release-triggered Native Installers run went
fully green - all 6 builds + all 3 installer smoke tests, where v0.3.0's
equivalent had failed all 3 Test jobs.

## v0.4.0 - 2026-07-12, shipped with a known bug

The user chose "publish now + 0.4.1 immediately after" over delaying. The
unit-of-work regression (#568) left Blender enablement broken: install completes
but `BlenderEnabled` never persists, so `.blend` processing stays off.

## v0.4.1 - 2026-07-12 (same day)

Blender unit-of-work commit fix + `ServicesCommitStagedMutationsTests` gate, e2e
perf-step fixes (virtualized DOM counts → API), desktop-suite TAP via
`NODE_OPTIONS`, video-spec fixes round 1, `upgrade-test` `from_tag` → v0.3.1.

## v0.4.2 - 2026-07-13

`TexturePreviewPanel` `frameloop="demand"` (prompt 48 DONE), packs +
model-management video de-flakes. **Docs CI still failed:** all 8 video specs
passed but the analyze gate rejected `model-management.webm` at 60.5–60.8 s
against its 45 s cap. Local was ~40 s ≈ 90% of cap - **CI software rendering paces
recorded waits ~1.5× local.**

## v0.4.3 - 2026-07-13

model-management cap 45 → 75 with a CI-pacing comment. **Its main push finally
went fully green: docs CI success → Docker Publish SUCCESS - the first 0.4.x
Docker images.** Docs site deployed with regenerated videos.

## Standing lesson

Docker Publish is chained behind docs CI with no manual trigger. A video spec
broken by a UI change is invisible until main-push, and then it blocks image
publishing. See [[process.md]] and [[../features/docs-videos.md]].
