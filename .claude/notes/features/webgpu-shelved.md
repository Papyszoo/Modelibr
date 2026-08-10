# WebGPU renderer migration — SHELVED

**Decision (June 2026): the full WebGPU renderer migration was shelved.**

PR #538 (`feat/webgpu-rendering`) migrated every viewer plus the worker to
`WebGPURenderer` with a classic-WebGL fallback. In practice it bought **no
user-visible benefit** for this app's workload (model/texture previews and
thumbnails — WebGL2 handles them fine), added a **dual code path** (two renderers,
plus TSL *and* GLSL to maintain), caused persistent **CI instability**, and
**regressed demo mode** (the demo app failed to mount on GPU-less CI).

The user agreed to shelve after reviewing cost vs benefit. **#538 was closed;
`feat/webgpu-rendering` stays parked** for a future *concrete* driver — e.g. a
feature that actually needs GPU compute.

## What did land — PR #539, on the existing classic `WebGLRenderer`

1. **three.js r185** — three + @types/three 0.180 → 0.185, frontend and worker.
   fiber 9 / drei 10 were already current.
2. **Local-first preview IBL** — the texture-set preview used drei
   `<Stage environment="city">`, which **fetches an HDR from a CDN**: a local-first
   violation that breaks offline. Replaced with a `PreviewEnvironment` doing
   `THREE.PMREMGenerator` + the addon `RoomEnvironment` in-process. The model
   viewer's `<Environment map={envMap}>` was already local (it uses the user's own
   map). **Still unfixed:** stage-editor `SceneHelpers.tsx` `preset="city"` is a
   separate CDN case.

## Gotchas preserved, if WebGPU is ever resumed

Already paid for on the parked branch:

- **Headless Chrome SwiftShader advertises WebGPU but crashes mid-render**
  (`createBuffer … too large when mappedAtCreation`). Must detect the
  software/fallback adapter (`isFallbackAdapter`, or info matching
  `/swiftshader|llvmpipe|lavapipe|software|basic render|microsoft basic/`) and
  force WebGL2.
- **`WebGPURenderer` can't compile raw GLSL** `ShaderMaterial` / `onBeforeCompile`.
  drei `ContactShadows` plus the channel/displacement shaders needed TSL ports —
  `ShadowNodeMaterial` for the shadow catcher, otherwise a black plane.
- **Worker WebGPU** needs Puppeteer `--enable-unsafe-webgpu` (plus Linux Vulkan)
  and dropping `--disable-gpu`.

## Leftover: the worker still probes for a renderer that isn't shipped

Observed 2026-08-09 across a ~1,700-model bulk render. `render-template.html` still
tries WebGPU first, and
`node_modules/three/examples/jsm/renderers/webgpu/WebGPURenderer.js` does not exist in
the asset-processor image — so **every** thumbnail job logs two
`net::ERR_FILE_NOT_FOUND` errors plus two console errors before falling back to WebGL.
Harmless (the fallback works, thumbnails are fine) but it makes worker logs read as
though every job failed, which is exactly the noise that hides a real failure during
triage. Drop the probe, or gate it on the file actually being present.

Related: [[shared-render-lib.md]], [[../testing/flakiness.md]]
