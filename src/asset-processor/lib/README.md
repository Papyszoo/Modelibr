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

## Adding to this directory

Adding viewer logic that the thumbnail render or demo must match? Put it here,
not in two places. Known not-yet-migrated case: the displacement-normal shader
lives in `frontend/src/shared/three/sharedDisplacementNormal.ts` and is currently
hand-copied into `../puppeteerRenderer.js` — migrate it here when you next touch
either side.
