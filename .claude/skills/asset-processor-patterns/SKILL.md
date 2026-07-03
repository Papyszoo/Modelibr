---
name: asset-processor-patterns
description: Modelibr asset-processor (Node.js worker) conventions — config.js discipline, ProcessorRegistry/BaseProcessor lifecycle, job queue/timeout traps, RendererPool/Puppeteer rules, unified API-client usage, shared cross-runtime lib, offline-safe rendering, Vitest. Use when creating or editing code under src/asset-processor.
---

# Asset processor patterns (Node.js worker)

ESM (`"type": "module"`), Vitest (NOT Jest — the frontend is the inverse),
structured winston `logger` + `withJobContext(jobId)` — never `console.log`.
Known debt + planned refactors: prompts 24 (folder grouping), 41 (dead code +
timeout cancellation), 42 (client factory + hygiene) in `.claude/prompts/`.

## Configuration
- ALL runtime config lives in `config.js` (rendering, orbit, encoding,
  thumbnail storage, blender, …). Never read `process.env` elsewhere — known
  violations (`POLL_INTERVAL_MS` in jobProcessor, Chrome paths in
  puppeteerRenderer) are slated for prompt 42; don't add more. New env vars
  also go in root `.env.example`.
- Blender + thumbnail-render settings are refreshed FROM the backend API
  (`refreshBlenderConfigFromApi` etc.) — user-editable settings flow through
  the DB, not env.
- ESLint enforces an architectural boundary: `config.js` must not import
  business logic.

## Processor architecture
- `ProcessorRegistry` (Strategy) maps `job.assetType` → processor.
  Registered: `Model`, `Sound`, `TextureSet`, `EnvironmentMap`,
  `MeshAnalysis` (stub — logs not-implemented; `meshProcessor.js` documents
  the planned shape).
- `BaseProcessor` is the template method: `execute()` wraps your `process()`
  with error handling, `withJobContext` logging, and `JobApiClient`
  callbacks. New processor = extend it, implement `get processorType()` +
  `async process(job, jobLogger)`, register in the registry constructor.
- TRAP — `jobProcessor.js` still contains a full LEGACY inline pipeline
  (`processModelJobAsync`/`processSoundJobAsync`/`processModel`/
  `processSound`, ~580 lines) that nothing calls; dispatch goes through the
  registry. Don't fix or extend the legacy path — prompt 41 deletes it.

## Job lifecycle (how work arrives and runs)
- Delivery is belt-and-braces: SignalR push notification → worker CLAIMS via
  `POST /thumbnail-jobs/dequeue` (backend arbitrates racing workers) →
  local queue (cap 50; full = drop notification, fallback polling sweeps
  later) → up to `config.maxConcurrentJobs` (default 3) run concurrently.
- TRAP — the job timeout is a `Promise.race`: it marks the job failed but
  does NOT cancel the work; a hung render keeps its pool renderer (slot
  starvation). Prompt 41 fixes this — until then never rely on the timeout
  to free resources; make your processor's awaits fail rather than hang.
- Retry/dead-letter logic is backend-side (`FinishThumbnailJobCommand`) —
  the worker just reports finish/fail honestly.

## Puppeteer / RendererPool rules
- One shared browser, one page per pool renderer (= isolated WebGL context
  per concurrent job). Always `acquire()` / `release()` in try/finally.
- Pages crash (frame detach, OOM on 4K textures). `PuppeteerRenderer` has
  `isPageUsable()` + `reinitialize()` — check/recover instead of assuming
  the page survived; reuse this machinery, don't invent recovery.
- The odd launch flags (`--disable-crashpad`, `--crash-dumps-dir=/tmp`, …)
  are load-bearing container fixes — don't remove; macOS uses Metal
  (swiftshader has no WebGL there).
- External processes (Blender) via `execFile` with arg arrays — never
  `exec`/shell strings.

## API clients (worker → backend)
- TRAP — six hand-rolled axios clients exist and have drifted:
  `jobEventService` sends NO `X-Api-Key`; coverage is inconsistent. Prompt
  42 introduces one `createWorkerApiClient` factory. Until then: never
  create another bare `axios.create` — reuse an existing keyed client, and
  any new request surface must attach `X-Api-Key` from
  `config.workerApiKey`.
- Contract endpoints: `POST /thumbnail-jobs/dequeue`, `POST
  /thumbnail-jobs/{id}/finish` (+ sound/texture-set/environment-map finish
  variants). If backend endpoint shapes change, update the client to match
  (and vice versa).

## Shared cross-runtime code (single source of truth)
Logic that must behave **identically** in more than one runtime — the
frontend viewer, this worker's Puppeteer render (`render-template.html` +
`page.evaluate`), demo mode — lives ONCE in `lib/`, never hand-copied.
- **Shape:** dependency-light ESM that injects heavy deps as arguments
  (`THREE`, `UTIF`) so one file runs in the Vite bundle AND the
  classic-script page context; `window.modelibr*` side-effect for the page;
  `.d.ts` sibling for the TS frontend.
- **Modules:** `tiffDecode`, `stlMesh`, `sceneLighting`, `textureMaterial`,
  `displacementNormal`, `textureChannels`. See `lib/README.md`.
- `lib/` stays FLAT — frontend/demo import it by relative path; moving files
  breaks cross-runtime consumers (prompt 24 explicitly excludes it).
- Rule of thumb: writing render code whose output another runtime must
  match? It's shared code — put it here first.

## Offline-safe (product invariant)
Rendering/processing must work with no external network: local Three.js
assets, local Blender install, no CDN imports or hosted inference.

## Testing
- Vitest in `tests/*.test.js`. Meaningful tests: services, processors, queue
  mechanics — not render pixels (visual parity is covered by other suites).
- `tests/test-crashpad-fix.js`, `test-puppeteer.js`, `test-scene-cleanup.js`
  are MANUAL debug scripts, not Vitest suites (prompt 42 relocates them) —
  don't pattern-match new tests on them.

## Verify
`cd src/asset-processor && npm test && npm run lint && npm run format:check`
(format:check is a required CI gate not covered by lint.)
