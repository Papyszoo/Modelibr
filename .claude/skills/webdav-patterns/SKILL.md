---
name: webdav-patterns
description: Modelibr WebDAV virtual drive - middleware interception (Blender Safe Save), virtual store/collections, client-compat shims for macOS Finder/Windows Explorer/Blender, temp-file lifecycle, data-safety rules. Use when creating or editing src/WebApi/Infrastructure/WebDavMiddleware.cs, src/WebApi/Services/*WebDav*/RequestHandlerFactory, or anything under src/Infrastructure/WebDav.
---

# WebDAV patterns (virtual asset drive)

## The cardinal rule

Every odd-looking branch is a **client-compat shim debugged against real Finder /
Windows Explorer / Blender traffic**; its comment names the demanding client.
Never simplify or remove a shim because it looks redundant. Behavior changes need
a manual test against a real client - name client/OS in the PR.

## Map

- `WebApi/Infrastructure/WebDavMiddleware.cs` - mounted at `/modelibr`
  (`app.UseWebDav`); intercepts special flows, dispatches the rest to NWebDav
  (`0.1.36`, wrapped deliberately).
- `WebApi/Services/RequestHandlerFactory` → `MacOsPropFindHandler` (PROPFIND) /
  `CustomWebDavHandler` (OPTIONS/GET/HEAD).
- `Infrastructure/WebDav/VirtualAssetStore` - DB-driven tree:
  `Projects/ Packs/ Models/ TextureSets/ EnvironmentMaps/ Sprites/ Sounds/
Selection/`; per-type `Virtual*Collections` mirror the six-clone problem.

## Intercepted flows (order matters in `InvokeAsync`)

1. `._*` AppleDouble noise → discarded with per-method status codes.
2. Blender Safe Save: PUT `*.blend@` (temp) → HEAD/PROPFIND/PROPPATCH verification
   (Windows MiniRedirector needs these or reports write failure) → MOVE to
   `*.blend` = hash-compare + create model version via CQRS. `.blend1` ignored.
3. LOCK/UNLOCK: synthetic, **never enforced** (uuid theater; NWebDav's
   `NoLockingManager` would 403). New file = 201, existing = 200. Concurrent
   editors both "hold" exclusive locks - versioning forks versions instead of
   corrupting; accepted. OPTIONS advertises `DAV: 1, 2` - changing that or lock
   behavior is compat-sensitive; test Windows write flows first.
4. PUT `/modelibr/Models/{name}.blend` = create model (403 if integration
   disabled/installing; 409 only under Reject duplicate-name policy - default
   Allow). **0-byte PUT is a pre-create stub → 201 WITHOUT creating a model.**

## Name resolution (names are NOT unique)

Duplicate names are allowed (default "Allow"). Segments follow one shared
contract - `WebDavUtilities` `TryParseIdSuffix` / `ComputeDisplayNames` /
`ResolveSegment`:

- Listings: plain name while unique among same-type siblings; on a
  case-insensitive collision ALL colliders render `{name} [{id}]` (flat files
  `Name [17].wav`).
- Resolution: id-suffix first (name must still match), else case-insensitive
  plain-name match that must be **exactly one** - zero or multiple = null/404/refuse.
  **Never `FirstOrDefault` by name.** Use the shared helpers.
- Inner filenames use the plain model name - the folder segment disambiguates.

## Data-safety rules

- **Never delete an unprocessed Blender temp file.** Failure paths quarantine via
  `BlenderTempFileQuarantine` → `{uploads}/webdav-blend-orphans/` + JSON sidecar;
  the quarantine write is uncancellable. Ambiguous-name saves refuse + quarantine.
- Retention: `BlenderRetentionSweeper` (startup + 24h) - temp >24h → quarantined
  (not deleted), orphans >30d → deleted (the ONE place bytes disappear). Backups
  exclude `webdav-blend-temp/`, keep orphans.
- Missing blob = 404 via the `Stream.Null` contract in
  `CustomWebDavHandler.WriteFileAsync` + Error log. Never return an empty stream.
- Temp files: `{uploads}/webdav-blend-temp/`, keyed by SHA256 of the normalized
  path (`GetTempFileKey`) - traversal-safe by construction.

## Store rules

- `VirtualAssetStore` is a **singleton**; DB access via
  `_scopeFactory.CreateScope()` per request - never cache a scoped service.
- Virtual filenames = asset name + original extension, plus the id-suffix
  contract on collision. Physical paths come from the persisted `File.FilePath`
  (written by `HashBasedFileStorage`, non-nullable since initial migration) -
  never re-derive `root/aa/bb/{hash}` in WebDAV code.
- Perf: resolvers load full aggregate graphs per request and clients send
  PROPFIND storms - don't add `Include`s casually.

## NWebDav quirks

- Writes responses **synchronously** → middleware opts in `AllowSynchronousIO`
  per request; keep it or Kestrel blocks sync IO.
- Crashes on empty PROPFIND body → `MacOsPropFindHandler` injects `allprop`
  (RFC-legal empty body from macOS) and rewrites collection hrefs to end with `/`.

## Testing

Unit: path resolution + ambiguity (`VirtualAssetStoreTests`), disambiguation
(`WebDavUtilitiesTests`), quarantine + retention, missing-blob 404. E2E:
`tests/e2e/features/15-blend-upload` (@slow) covers the PUT/Safe-Save/lock/0-byte
dances. Missing: recorded Finder/Explorer replay via `WebApplicationFactory`
(`Category=Integration`). Any handler change = manual client check (Blender save
best). This surface is unauthenticated by design - check the threat model first.

## Verify

`dotnet build Modelibr.sln && dotnet test Modelibr.sln --no-build --filter
"Category!=Integration"` + backend-integration if integration tests changed + the
manual client check.
