# Shared cross-runtime render code (`src/asset-processor/lib/`)

The convention: THREE and UTIF are **injected**, each module has a `.d.ts`
sibling, and the worker reaches it via a `window.modelibr*` side-effect. It holds
logic that must behave **identically** across three runtimes - the frontend
viewer, the worker's Puppeteer thumbnail, and demo mode.

**Prompt 16 is fully DONE. No extraction is pending.**

## What is shared

- `tiffDecode.js`, `stlMesh.js` (pre-existing).
- **`sceneLighting.js`** - the balanced model-preview light rig
  (`DEFAULT_LIGHTING`, `resolveSceneLighting`, `buildSceneLights`). *Fixed:* the
  viewer's drei `<Stage>` was injecting a second light rig that swamped the
  ambient/environment controls.
- **`textureMaterial.js`** - `resolveTextureMaterialConfig` (metalness/roughness/
  specular gated on their **own** maps, not the base-color map) + `ensureAoMapUv2`.
  *Fixed two viewer-only drifts:* base-color-gated metalness made non-metals black
  mirrors, and missing uv2 made AO collapse all indirect light.
- **`displacementNormal.js`** - `addSharedDisplacementNormal(THREE, geom)` +
  `applyDispNormalDisplacement(mat)` (the two displacement GLSL chunks). Frontend
  imports via the `sharedDisplacementNormal.ts` wrapper; worker uses
  `window.modelibrDispNormal`.
- **`textureChannels.js`** - the texture-type→material-slot map plus the
  channel-extraction shaders: `MATERIAL_SLOT_BY_TEXTURE_TYPE` /
  `resolveMaterialSlot`, `TEXTURE_TYPE` / `TEXTURE_CHANNEL` enum mirrors,
  `textureTypeNeedsInvert`, `getChannelUniformIndex` / `channelNeedsExtraction`,
  `slotIsColorData`, and the GLSL (`CHANNEL_VERTEX_SHADER`,
  `CHANNEL_EXTRACT_FRAGMENT_SHADER` with 0-based `uChannel` + `uInvert`,
  `RGB_INVERT_FRAGMENT_SHADER`).
  *Fixed two real drifts:* the worker had **no Glossiness slot** and silently
  dropped inverted-roughness maps in thumbnails, and the two extraction shaders
  used different channel numbering (0-based vs 1-based).

Render-to-target orchestration stays per-runtime.

## Intentionally NOT shared - do not "dedupe"

- **`normalizeModel` / framing.** The viewer floors the model at y=0; the worker
  centers on the bbox for the orbit camera. Different by design.
- `mocks/dynamic-demo/shared.ts`'s `parseTextureType` has its own drifted
  name→number map, but only entries 1/2/5/6 are consumed (the demo filters to
  albedo/normal/roughness/metallic before rendering), so the wrong entries are
  inert. Out of scope - not worth the fixture-audit risk.

## Demo mode is a third parallel implementation

`frontend/src/mocks/services/browserAssetProcessor.ts` renders in-browser WebGL,
not Puppeteer. It now adopts the shared lib: one `setupSceneLighting` helper
builds `buildSceneLights` plus a neutral `RoomEnvironment` IBL (replacing 5
ad-hoc rigs), and `applyTextureMaps` uses `resolveTextureMaterialConfig` +
`ensureAoMapUv2`. The `normalizeModel` `setScalar` bug is fixed to
`multiplyScalar`. It intentionally does not share render orchestration -
in-browser constraints differ.

## Test coverage worth knowing about

`src/frontend/webgl-tests/channel-extraction.spec.ts` (`npm run test:webgl`, own
`playwright.webgl.config.ts`, forced SwiftShader, no app/backend/Docker, ~2 s)
runs the **actual shared GLSL** over a 1×1 packed texture and reads pixels back,
asserting the correct channel value, invert, and `getChannelUniformIndex` mapping.
It replaced a flaky, shallow full-app e2e that only checked `mat.map` was truthy.

Related: [[webgpu-shelved.md]], the `asset-processor-patterns` skill
