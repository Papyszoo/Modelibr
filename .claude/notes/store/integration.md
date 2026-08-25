# Store ↔ Modelibr integration contract

Canonical contract doc lives in the store repo: `docs/INTEGRATION.md`.

## Auth: import tokens, not JWT

- `POST /api/library/{assetId}/import-token` mints a **short-lived, single-use,
  asset-scoped** token (~10 min, hash-only `ImportToken` entity, DB-counted
  20/min rate limit).
- Credential is the header `Authorization: ImportToken <token>` - **never a query
  param** (log leakage). Never put a JWT in a deep link.
- Manifest fetch consumes the token; downloads ride the same token.
- Integration endpoints get an **open, no-credentials CORS policy**
  (`ModelibrImport`) - safe because auth is bearer-token, not cookies. A startup
  guard throws if any cookie auth scheme registers.
- Absolute URLs come from `Store:PublicBaseUrl` via `IStoreUrlProvider` - never
  the Host header.

## Manifest v1

Entitlement-gated `GET /api/assets/{id}/manifest`. Typed `PackItems` mirroring
Modelibr's 5 asset types, per-file SHA-256, `Role` strings like `Texture:Albedo`.

Role / itemType table for authoring CC0 GitHub packs:

| Modelibr type | itemType | role |
|---|---|---|
| Model | `Model` | `Mesh` |
| Texture set | `TextureSet` | `Texture:<Type>[:<Ch>]` |
| Sound | `Sound` | `Audio` |
| Sprite | `Sprite` | `Image` |
| Environment map | `EnvironmentMap` | `Panorama` |

Files are matched to items by `path`. Known v1 gaps logged in store VISION:
category mapping, license enum, texture coverage, per-item description, sprite
metadata, `Other`.

## Modelibr side - native importer (PR #578)

`POST /store-imports {storeUrl, assetId, importToken}` → 202 + job id;
`GET /store-imports/{id}` = status + per-item outcomes; SignalR `/storeImportHub`.

- Queue follows the `BlendFileGenerationQueue` pattern (in-process Channel +
  BackgroundService, per-job DI scope). Import survives page close; only a
  backend restart fails it.
- `IStoreImportSink` is a **thin adapter over existing handlers** - no parallel
  persistence layer.
- Provenance = 4 nullable Pack columns (`StoreImportUrl` / `AssetId` /
  `ManifestVersion` / `ImportedAt`, indexed) = the idempotency key. Re-run yields
  `skipped-dedupe`.
- Token is in-memory only, sent only to the store host, never persisted or logged.
- **SSRF defenses:** https-or-loopback only, manual redirect hops re-validated,
  size cap from manifest, SHA-256 verify per file, DNS-rebind pin via
  `SocketsHttpHandler.ConnectCallback`.
- **The address classifier is the IANA registries, written as prefix tables**
  (`StoreUrlSafety`). Three things it teaches:
  - The loopback exception belongs INSIDE the IPv4 classifier, not in front of the
    address-family dispatch. `127.0.0.0/8` is deliberately absent from the table because
    it is the one range with an exception - and NAT64/6to4 unwrap an embedded IPv4 and
    call that table directly, so `64:ff9b::7f00:1` and `2002:7f00:1::` reached loopback
    from a public store.
  - Only `64:ff9b::/96` is RFC 6052 embedded-address syntax. Matching the first four
    bytes made all of `64:ff9b::/32` look like it, which let `64:ff9b:1::808:808` through
    on the strength of 8.8.8.8 being public - `64:ff9b:1::/48` is a separate RFC 8215
    local-use reservation that embeds nothing.
  - A table of named prefixes cannot be the whole IPv6 answer. Global unicast is
    `2000::/3` and everything else is Reserved by IETF, so the classifier ends by refusing
    what is outside it; otherwise the space between the rows is reachable by omission,
    which is how `3fff::/20` and `100:0:0:1::/64` stayed open.
- Deliberate deviation from the CLI importer: source channels bind to the real
  `TextureChannel` enum (`R/G/B/A/RGB`), not the CLI's long names.
- Partial import: `selectedItemIds` filters the manifest; empty = whole pack.
- Store thumbnails are reused - a model item's `Turntable` (or static
  `Thumbnail`) preview is attached via `UploadThumbnailCommand` and worker
  generation is suppressed via `AddModelCommand.GenerateThumbnail`.

## Asset Store page (Modelibr frontend)

`assetStore` TabType + `features/asset-store/`. Own axios client via the
`createApiClient` factory in `apiBase`. Tokens memory-only in
`assetStoreAuthStore`… **except** session persistence was later added
(`persist` to localStorage + `resumeStoreSession()` in App.tsx) because reloads
wiped in-memory tokens and users appeared logged out. 8-min proactive refresh vs
the store's 10-min JWT.

**Adding a new tab type touches SIX places** - `ui.ts`, `TabContent`,
`NewTabPage` TILES + icons, `DraggableTab`, `navigationStore` label, and **both**
`tabSerialization` allowlists. (`useTabMenuItems` never existed; the
frontend-patterns skill was corrected.)

## E2E trick worth reusing

`store-fixture-e2e` container with `network_mode: service:webapi-e2e` so ONE URL
`http://localhost:9280` is the store for **both** the browser (host publish on
webapi-e2e) and the backend importer (loopback = the http-dev exception).
Manifest URLs are same-host so the token is actually sent.

**Trap:** the store fixture originally served the shared
`tests/e2e/assets/test-cube.glb` byte-identical, so earlier fast-lane scenarios
that upload it raw made the importer SHA-dedupe onto the wrong model. Only
reproduces in FULL-suite runs. Always collision-check fixture assets against
shared e2e assets; fixed with a spec-compliant GLB retag
(`asset.extras._storeFixture`).

## Contract-drift gap (open, flagged to owner)

Modelibr e2e uses a hand-written store fixture (`server.mjs`) that encodes
`INTEGRATION.md`; store e2e covers its own endpoints; real-vs-real is manual
only. Recommended: a store-side contract check replaying the fixture's
expectations, with cross-repo compose e2e as a manual pre-release step.

Related: [[incidents.md]]
