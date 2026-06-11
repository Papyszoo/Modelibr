---
name: asset-processor-patterns
description: Modelibr asset-processor (Node.js worker) conventions — config.js discipline, ProcessorRegistry/BaseProcessor lifecycle, service boundaries, worker↔backend API contracts, offline-safe rendering. Use when creating or editing code under src/asset-processor.
---

# Asset processor patterns (Node.js worker)

## Configuration
- ALL runtime config lives in `src/asset-processor/config.js` (75+ env vars:
  rendering, orbit, encoding, thumbnail storage, blender, …). Don't scatter
  `process.env` reads through processors/services — extend the config surface.

## Processor architecture
- `ProcessorRegistry` (Strategy) maps `job.assetType` → processor. Registered:
  `Model`, `Sound`, `TextureSet`, `MeshAnalysis`.
- `BaseProcessor` is the template method: `execute()` wraps your `process()` with
  error handling, `withJobContext()` logging, and `JobApiClient` callbacks.
- New processor = extend `BaseProcessor`, implement `get processorType()` +
  `async process(job, jobLogger)`, register in the `ProcessorRegistry` constructor.

## Service boundaries
- Reuse `JobApiClient`, `JobEventService`, `BaseProcessor`, structured `logger` —
  no ad-hoc job lifecycle code or duplicate axios clients.
- Per-job logic in `processors/`; transport concerns in service/client files.

## Worker ↔ backend contract
Worker calls: `POST /thumbnail-jobs/dequeue`, `POST /thumbnail-jobs/{id}/finish`,
`POST /thumbnail-jobs/sounds/{id}/finish`, `POST /thumbnail-jobs/texture-sets/{id}/finish`.
If backend endpoint shapes change, update `JobApiClient` to match (and vice versa).

## Offline-safe (product invariant)
Rendering/processing must work with no external network: Puppeteer + Three.js use
local assets; Blender CLI uses a local install. No CDN imports, external APIs, or
hosted inference in pipelines. (macOS note: rendering uses Metal — swiftshader has
no WebGL there.)

## Testing & verify
Vitest. Verify: `cd src/asset-processor && npm test && npm run lint`
