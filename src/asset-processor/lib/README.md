# src/asset-processor/lib — shared cross-runtime modules

Single source of truth for logic that must behave **identically** across more
than one runtime:

- the **frontend viewer** (Vite bundle),
- this worker's **Puppeteer thumbnail render** (`render-template.html`, parts of
  which execute as classic scripts inside `page.evaluate`),
- **demo mode** (the browser asset processor).

Keeping such logic here — instead of copying it into each — is what stops the
in-app viewer and the generated thumbnail from drifting apart. If you're writing
viewer/render code whose output another runtime has to match, it belongs here,
not in two places.

## How a module here is shaped

- A dependency-light **ESM** that **injects its heavy dependencies as arguments**
  (e.g. `THREE`, `UTIF`) — so the same file runs both in a bundler and in a raw
  browser page where those deps arrive as globals. (Don't `import 'three'` here:
  that risks a second three instance and breaks `instanceof`.)
- An optional `window.modelibr*` side-effect, so classic-script `page.evaluate`
  code can reach it.
- A `.d.ts` sibling, so the TypeScript frontend imports it without `@ts-expect-error`.

## Consumers

- **Frontend:** relative import,
  `import { x } from '../../../asset-processor/lib/x.js'` — permitted by Vite's
  `server.fs.allow` (see `src/frontend/vite.config.js`).
- **Render template:** `<script type="module" src="./lib/x.js">` or a module
  `import` in the inline scene script.

## Current modules

- **`tiffDecode.js`** — TIFF → RGBA8 (UTIF injected). Browsers can't decode TIFF
  natively; the texture viewer and the thumbnail texture pipeline share this so
  they interpret the same TIFF identically.
- **`stlMesh.js`** — STL `BufferGeometry` → configured Mesh/Group, including
  binary-STL vertex colors (THREE injected). Shared by the viewer, the worker
  thumbnail, and demo mode.
- **`sceneLighting.js`** — the balanced model-preview light rig
  (`DEFAULT_LIGHTING` + `resolveSceneLighting` + `buildSceneLights`, THREE
  injected). Single source for the ambient/directional/point/spot rig and the
  IBL `environmentIntensity`. The worker render template builds real lights from
  it; the frontend viewer maps the resolved descriptor to R3F primitives so the
  ambient/directional/environment controls land on one rig instead of being
  swamped by a second one. Demo mode (browserAssetProcessor) also builds its rig
  from this (plus a neutral RoomEnvironment IBL) so its thumbnails match.
- **`textureMaterial.js`** — texture-set → material pipeline slices shared by the
  viewer and the worker `applyTextures`. No THREE import.
  - `resolveTextureMaterialConfig(presentMaps)` — the metalness/roughness/
    specular gating rule (keyed on each map, not on the base-color map).
    Extracted after the viewer drifted to gating metalness on the base-color
    map, which made textured non-metal surfaces render as black mirrors in the
    viewer only.
  - `ensureAoMapUv2(geometry)` — copy `uv` -> `uv2` so an AO map samples the
    second UV set. Without it the AO term collapses and kills ALL indirect light
    (ambient + environment IBL), which made those viewer controls look inert.
- **`displacementNormal.js`** — `addSharedDisplacementNormal(THREE, geometry)` +
  `applyDispNormalDisplacement(material)`: average the displacement *direction*
  across coincident-position vertex duplicates (instead of welding) so hard-edged
  displaced meshes stay watertight without smearing per-face UVs. Holds the two
  displacement GLSL chunks as the single source. The frontend imports it through
  the `shared/three/sharedDisplacementNormal.ts` wrapper (which injects THREE);
  the worker `applyTextures` calls it via `window.modelibrDispNormal`.

## Adding to this directory

Adding viewer logic that the thumbnail render or demo must match? Put it here,
not in two places. Remaining not-yet-migrated case: the texture-type → material
slot map and the channel-extraction shader strings are still duplicated between
`useChannelExtractedTextures` / `TEXTURE_SLOTS` (frontend) and the
`applyTextures` `page.evaluate` (worker) — migrate the data/shaders here when you
next touch either side (the render *orchestration* stays per-runtime).
