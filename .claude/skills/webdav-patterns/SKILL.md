---
name: webdav-patterns
description: Modelibr WebDAV virtual drive — middleware interception (Blender Safe Save), virtual store/collections, client-compat shims for macOS Finder/Windows Explorer/Blender, temp-file lifecycle, data-safety rules. Use when creating or editing src/WebApi/Infrastructure/WebDavMiddleware.cs, src/WebApi/Services/*WebDav*/RequestHandlerFactory, or anything under src/Infrastructure/WebDav.
---

# WebDAV patterns (virtual asset drive)

## The cardinal rule
Every odd-looking branch here is a **client-compat shim debugged against real
Finder / Windows Explorer / Blender traffic**, and its comment explains which
client demands it. Never simplify or remove a shim because it looks
redundant. Any behavior change requires a manual test against at least one
real client — name the client/OS in the PR (generically; no machine-specific
details in public content).

## Map
- `WebApi/Infrastructure/WebDavMiddleware.cs` (~830 lines) — mounted at
  `/modelibr` (`app.UseWebDav`). Intercepts special flows itself; everything
  else dispatches to NWebDav (`0.1.36` — dormant package, wrapped
  deliberately).
- `WebApi/Services/RequestHandlerFactory` → `MacOsPropFindHandler` (PROPFIND)
  / `CustomWebDavHandler` (OPTIONS/GET/HEAD).
- `Infrastructure/WebDav/VirtualAssetStore` (~1,200 lines) — DB-driven
  virtual tree: `Projects/ Packs/ Models/ TextureSets/ EnvironmentMaps/
  Sprites/ Sounds/ Selection/`. Per-type `Virtual*Collections` classes
  (mirrors the six-clone problem — prompt 18 note; don't add a seventh
  without reading it).

## Intercepted flows (order matters in `InvokeAsync`)
1. `._*` AppleDouble noise → discarded with per-method status codes.
2. Blender Safe Save: PUT `*.blend@` (temp) → HEAD/PROPFIND/PROPPATCH
   verification (Windows MiniRedirector requires these or reports the write
   failed) → MOVE to `*.blend` = hash-compare + create model version via
   CQRS. `.blend1` backup ops are silently ignored.
3. LOCK/UNLOCK: synthetic, **never enforced** (uuid theater; NWebDav's
   `NoLockingManager` would 403 otherwise). New file = 201, existing = 200.
   Concurrent editors both "hold" exclusive locks — versioning makes
   concurrent saves fork versions instead of corrupting; that's the accepted
   trade-off. OPTIONS advertises `DAV: 1, 2`; changing that or lock behavior
   is compat-sensitive — test against Windows write flows first.
4. PUT `/modelibr/Models/{name}.blend` = create model (403 if Blender
   integration disabled/installing; 409 only under the Reject duplicate-name
   policy — default is Allow). **0-byte PUT is a client pre-create stub →
   201 WITHOUT creating a model** — the real content PUT follows.

## Name resolution (names are NOT unique)
Duplicate asset names are allowed (policy default "Allow"). WebDAV segments
follow one shared contract — `WebDavUtilities` `TryParseIdSuffix` /
`ComputeDisplayNames` / `ResolveSegment`:
- Listings: plain name while unique among same-type siblings; on a
  case-insensitive collision ALL colliders render `{name} [{id}]` (flat
  files: `Name [17].wav`). Id = DB int id, stable.
- Resolution: id-suffix match first (name must still match), else
  case-insensitive plain-name match that must be **exactly one** — zero or
  multiple = null/404/refuse. **Never `FirstOrDefault` by name.** Use the
  shared helpers, not a local copy.
- Inner filenames (`generated-/uploaded-{name}.blend`, version folders) use
  the plain model name — the folder segment already disambiguates.

## Data-safety rules
- **Never delete an unprocessed Blender temp file.** Failure paths
  quarantine via `BlenderTempFileQuarantine` → `{uploads}/webdav-blend-
  orphans/` + JSON sidecar (request path, timestamp, reason, candidate ids);
  the quarantine write is uncancellable (no request token). Ambiguous-name
  saves refuse + quarantine, never guess a model.
- Retention: `BlenderRetentionSweeper` (hosted, startup + 24h) — temp >24h
  → quarantined (not deleted), orphans >30d → deleted (the ONE place bytes
  disappear). Backups exclude `webdav-blend-temp/`, keep orphans.
- Missing physical blob = 404 via the `Stream.Null` contract in
  `CustomWebDavHandler.WriteFileAsync` + Error log with hash/path. Never
  return an empty/zero-length stream any other way.
- Temp files: `{uploads}/webdav-blend-temp/`, keyed by SHA256 of the
  normalized path (`GetTempFileKey`) — traversal-safe by construction; keep
  it that way.

## Store rules
- `VirtualAssetStore` is a **singleton**; all DB access via
  `_scopeFactory.CreateScope()` per request — never cache a scoped service.
- Virtual filenames = asset name + original file's extension
  (`WebDavUtilities.GetVirtualFileName`) so listings show asset names, not
  upload filenames — plus the id-suffix contract above when names collide.
- Physical paths come from the persisted `File.FilePath` (written by
  `HashBasedFileStorage`, non-nullable since the initial migration). Never
  re-derive the `root/aa/bb/{hash}` layout in WebDAV code.
- Perf: resolvers load full aggregate graphs per request and clients send
  PROPFIND storms — don't add `Include`s casually (read-model plan:
  prompt 28).

## NWebDav quirks (why the wrappers exist)
- Writes responses **synchronously** → middleware opts in
  `AllowSynchronousIO` per request. Keep that; Kestrel blocks sync IO
  otherwise.
- Crashes on empty PROPFIND body → `MacOsPropFindHandler` injects `allprop`
  (RFC-legal empty body from macOS) and rewrites collection hrefs to end
  with `/` (Finder requirement).

## Testing
Unit coverage: path resolution + ambiguity refusal (`VirtualAssetStoreTests`),
the disambiguation contract (`WebDavUtilitiesTests`), quarantine + retention
sweep, missing-blob 404. E2E: `tests/e2e/features/15-blend-upload` (@slow)
covers the real PUT/Safe-Save/lock/0-byte dances. Still missing until prompt
31's client-replay suite lands: recorded Finder/Explorer sequences through
`WebApplicationFactory`, `Category=Integration`. Any middleware/handler
change = manual client verification (Blender save is the highest-value
smoke). This surface is unauthenticated by design (prompt 23) — never
add write endpoints here without checking the threat-model page.

## Verify
`dotnet build Modelibr.sln && dotnet test Modelibr.sln --no-build --filter
"Category!=Integration"` + backend-integration suite if integration tests
were touched + the manual client check above.
