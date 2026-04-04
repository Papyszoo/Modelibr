---
name: "Modelibr Asset Processor Instruction"
description: "Use when editing the Modelibr Node.js asset processor under src/asset-processor. Covers config usage, processor/service boundaries, ProcessorRegistry, offline-safe runtime behavior, and worker verification."
applyTo: "src/asset-processor/**"
---

# Asset Processor Patterns

## Configuration

- Keep runtime configuration in `src/asset-processor/config.js` (75+ env vars organized into rendering, orbit, encoding, thumbnail storage, blender, etc.). Avoid scattering new `process.env` reads through processors and services unless you are extending the config surface itself.
- The only acceptable `process.env` reads outside `config.js` are short-circuit feature flags where the config surface does not already cover the use case.

## Processor Architecture

- `ProcessorRegistry` (Strategy pattern) maps `job.assetType` → processor instance. Registered types: `Model`, `Sound`, `TextureSet`, `MeshAnalysis`.
- `BaseProcessor` provides the template method lifecycle: `execute()` wraps `process()` with error handling, logging via `withJobContext()`, and API callbacks via `JobApiClient`.
- New processor types must: extend `BaseProcessor`, implement `get processorType()` and `async process(job, jobLogger)`, and register in `ProcessorRegistry` constructor.

## Service Boundaries

- Reuse `JobApiClient`, `JobEventService`, `BaseProcessor`, and structured `logger` instead of adding ad-hoc job lifecycle code or duplicate axios clients.
- Keep per-job logic in `processors/` and transport concerns in service or client files.

## Worker API Contracts

- The worker calls backend via: `POST /thumbnail-jobs/dequeue`, `POST /thumbnail-jobs/{id}/finish`, `POST /thumbnail-jobs/sounds/{id}/finish`, `POST /thumbnail-jobs/texture-sets/{id}/finish`.
- If backend endpoint shapes change, worker `JobApiClient` methods must be updated to match.

## Offline-Safe Behavior

- Rendering and processing flows must work without external network calls. Puppeteer + Three.js rendering uses local assets. Blender CLI uses a local installation.
- Do not add CDN imports, external API calls, or hosted inference services in processing pipelines.

## Verification

- Verify worker changes with `cd src/asset-processor && npm test && npm run lint`.
