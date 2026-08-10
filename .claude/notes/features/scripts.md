# Script asset type

Editable code assets. Phase-4 refinement pass 2026-06-18; reworked 2026-06-19 on
`feat/script-asset-type` (PR #524).

## Shipped

- File-like cards, a description field (migration `AddScriptDescription`).
- Editor moved from a modal to **its own tab** (`scriptViewer` TabType →
  `ScriptViewer` / `ScriptEditor` page).
- Richer C# highlighting + a dedicated GLSL `shader` mode.
- **Live GLSL/HLSL shader preview** (`ScriptPreview`, raw WebGL,
  ShaderToy-compatible) — stays live on keystroke.
- Models-style **category tree** (shared `CategoryTreePanel` +
  `ScriptCategoryManagerDialog`) — see [[categories.md]].
- **Script templates** — a built-in catalog (Unity MonoBehaviour, three.js GLSL
  vert/frag, three.js TSL, Lua, Python) plus custom DB-persisted templates (Domain
  `ScriptTemplate` + migration `AddScriptTemplates` + repo + CQRS + endpoints),
  managed in Settings → Script Templates, selectable in the New Script dialog
  (prefills language + content). Demo: `scriptTemplates` IDB store (DB v8).
- Fixed a real bug: `getScriptsPaginated` dropped `packIds` / `projectIds`, so
  every pack/project showed the whole script library.

## three.js scene preview — in-page, NOT an iframe

`ScriptScenePreview` runs a JS/TS script that `export default`s a three.js
material (or a setup function) via `new Function`, with THREE and three/tsl
injected. Import rewriting lives in the standalone, unit-tested
`utils/transformUserSource.ts`.

Rebuilt on **React-Three-Fiber + a WebGPU `gl` factory** (the repo's first
WebGPU-on-R3F usage), giving drei `OrbitControls`, lights and control speeds from
the shared `viewerSettingsStore`, and the material applied to a **primitive**
(sphere/cube/plane/cylinder/torus) **or** a library model (obj/fbx/gltf/glb via
the model-viewer loaders).

- Scene preview is **Run-gated** — explicit Run, never on keystroke. The shader
  preview stays live.
- A **WebGPU/WebGL2 badge** reports which backend `WebGPURenderer` actually
  initialised. `WebGPURenderer` auto-falls-back to WebGL2 when `navigator.gpu` is
  absent. The user confirmed WebGPU works on his machine.
- **Honest limit told to the user:** a *synchronous* infinite loop at setup is
  uninterruptible in-page. Only a terminable Web Worker + OffscreenCanvas would
  fix it.
- The render path can't be exercised in jsdom/CI (error-boundary guarded).

## UI layout decisions

`ScriptViewerMenubar` (reusing the model page's `ViewerMenubar.css`) hosts Show
Preview / Download / Save **as menu items**, styled like Geometry/Viewer, plus the
geometry/model picker and viewer options. **Run** sits next to Pause in the
scene-preview header. The right/below **panel toggle** is `PreviewLayoutToggle` in
each preview header, **not** the menubar. Description is inline in the main
header. Prefs persist in `scriptPreviewStore`.

## E2E notes

Docker e2e (`@scripts`) realigned to the page flow — after editing, return to the
list via `clickTab`, **NOT** `navigateToAppClean`, which clears localStorage
mid-test.

**Assertion bug worth remembering:** `saveEditor()` waited for
`aria-disabled="true"` on the menubar Save item, but **PrimeReact disables a
menubar item via the `p-disabled` class** with no `aria-disabled` attribute — so
it timed out even though the save completed. Now asserts
`toHaveClass(/p-disabled/)`.

**The two `@serial @authoring` scenarios are local-only and never run on GitHub
CI, so CI green ≠ scripts authoring verified.** They were run live 2026-06-20 and
pass. The non-authoring `@scripts` scenarios (upload / shader-preview / packs /
recycle) have still not been individually run live.

Related: [[categories.md]]
