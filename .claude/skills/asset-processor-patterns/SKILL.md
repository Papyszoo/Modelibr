---
name: asset-processor-patterns
description: Modelibr asset-processor (Node.js worker) conventions - config.js discipline, ProcessorRegistry/BaseProcessor lifecycle, job queue/timeout traps, RendererPool/Puppeteer rules, unified API-client usage, shared cross-runtime lib, offline-safe rendering, Vitest. Use when creating or editing code under src/asset-processor.
---

# Asset processor patterns (Node.js worker)

ESM (`"type": "module"`), Vitest (NOT Jest - the frontend is the inverse).
Structured winston `logger` + `withJobContext(jobId)` - never `console.log`.
Rendering must be offline-safe: local Three.js/Blender, no CDN imports.

## Configuration

- ALL runtime config lives in `config.js`; never read `process.env` elsewhere -
  known violations (`POLL_INTERVAL_MS` in jobProcessor, Chrome paths in
  puppeteerRenderer) are accepted debt. New env vars also go in root `.env.example`.
- Blender + thumbnail-render settings refresh FROM the backend API
  (`refreshBlenderConfigFromApi`) - user-editable settings flow through the DB, not env.
- ESLint enforces an architectural boundary: `config.js` must not import business logic.

## Processor architecture

- `ProcessorRegistry` (Strategy) maps `job.assetType` → processor. Registered:
  `Model`, `Sound`, `TextureSet`, `EnvironmentMap`, `Scene`, `Vfx`.
- `BaseProcessor` is the template method: `execute(job, signal)` wraps your
  `process()` with error handling, `withJobContext` logging, and `JobApiClient`
  callbacks. New processor = extend it, implement `get processorType()` +
  `async process(job, jobLogger, signal)`, register in the registry constructor.
- `jobProcessor.js` dispatch goes exclusively through `ProcessorRegistry` - no other path.
- `Vfx` (animated effect thumbnails) follows the scene pattern: `vfxRenderer.js`
  drives the app's own `?render=vfx` page, stepping its clock via
  `window.__VFX_RENDER__.setTime(t)` - no real-time playback, one VFX renderer.
  Frames are encoded to one looping WebP with `FrameEncoderService`
  (`frameDelayMs`, `animatedOnly`); frame count/rate limits live in
  `config.vfxRender`.

## Job lifecycle

- Delivery: SignalR push notification → worker CLAIMS via
  `POST /thumbnail-jobs/dequeue` (backend arbitrates racing workers) → local
  queue (cap 50; full = drop notification, fallback polling sweeps later) → up to
  `config.maxConcurrentJobs` (default 3) concurrently.
- The job timeout (`processQueue` in `jobProcessor.js`) aborts an
  `AbortController` whose `signal` flows into `process()`. Renderer-backed
  processors (Thumbnail/TextureSet/EnvironmentMap) MUST arm it right after
  acquiring (`this._armRendererAbort(...)`), then call the returned `disarmAbort()`
  in `finally` before `release()`. Skipping this reintroduces slot starvation. On
  abort it calls `rendererPool.forceReinit(renderer)` →
  `PuppeteerRenderer.reinitialize()`, so the slot returns usable instead of hung.
- `BaseProcessor.execute()` checks `signal?.aborted` before calling
  `markCompleted`/`markFailed` - the backend has no double-finish guard
  (`MarkAsCompleted`/`MarkAsFailed` unconditionally overwrite status), so a late
  result from an aborted job is discarded.
- Retry/dead-letter logic is backend-side (`FinishThumbnailJobCommand`) - the
  worker reports finish/fail honestly.

## Puppeteer / RendererPool rules

- One shared browser, one page per pool renderer (= isolated WebGL context per
  concurrent job). Always `acquire()` / `release()` in try/finally.
- Pages crash (frame detach, OOM on 4K textures). `PuppeteerRenderer` has
  `isPageUsable()` + `reinitialize()` - check/recover instead of inventing recovery.
- The odd launch flags (`--disable-crashpad`, `--crash-dumps-dir=/tmp`, …) are
  load-bearing container fixes - don't remove; macOS uses Metal (swiftshader has
  no WebGL there).
- External processes (Blender) via `execFile` with arg arrays - never `exec`/shell strings.

## API clients (worker → backend)

- TRAP - six hand-rolled axios clients exist and have drifted: `jobEventService`
  sends NO `X-Api-Key`; coverage is inconsistent. Never create another bare
  `axios.create` - reuse an existing keyed client, and attach `X-Api-Key` from
  `config.workerApiKey` on any new surface.
- Contract endpoints: `POST /thumbnail-jobs/dequeue` and
  `POST /thumbnail-jobs/{id}/finish` (+ sound/texture-set/environment-map
  variants). Keep the client matching the backend shape.

## Shared cross-runtime code (single source of truth)

Logic that must behave **identically** in the frontend viewer, this worker's
Puppeteer render and demo mode lives ONCE in `lib/`, never hand-copied.

- **Shape:** dependency-light ESM injecting heavy deps as arguments (`THREE`,
  `UTIF`) so one file runs in the Vite bundle AND the classic-script page
  context; `window.modelibr*` side-effect; `.d.ts` sibling for the TS frontend.
- **Modules:** `displacementNormal`, `geometryHash`, `gltfResources`,
  `materialStats`, `partPath`, `renderSignals`, `sceneGraph`, `sceneLighting`,
  `stlMesh`, `textureChannels`, `textureMaterial`, `tiffDecode` (see `lib/README.md`).
- `lib/` stays FLAT - frontend/demo import by relative path; moving files breaks
  cross-runtime consumers.

## Testing

- Vitest in `tests/*.test.js`. Meaningful tests: services, processors, queue
  mechanics - not render pixels.
- `tests/test-crashpad-fix.js`, `test-puppeteer.js`, `test-scene-cleanup.js` are
  MANUAL debug scripts, not Vitest suites - don't pattern-match new tests on them.

## Verify

`cd src/asset-processor && npm test && npm run lint && npm run format:check`
