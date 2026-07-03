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
   integration disabled/installing, 409 on name conflict). **0-byte PUT is a
   client pre-create stub → 201 WITHOUT creating a model** — the real
   content PUT follows.

## Data-safety rules
- **Never delete an unprocessed Blender temp file.** Failure paths must
  quarantine, not destroy (prompt 30 — if not yet landed, its findings still
  apply: unresolvable-model MOVE currently deletes + 204s, and name-based
  model resolution has no ambiguity guard; don't extend those paths without
  fixing them).
- Missing physical blob must become 404, never an empty stream.
- Temp files: `{uploads}/webdav-blend-temp/`, keyed by SHA256 of the
  normalized path (`GetTempFileKey`) — traversal-safe by construction; keep
  it that way.

## Store rules
- `VirtualAssetStore` is a **singleton**; all DB access via
  `_scopeFactory.CreateScope()` per request — never cache a scoped service.
- Virtual filenames = asset name + original file's extension
  (`WebDavUtilities.GetVirtualFileName`) so listings show asset names, not
  upload filenames.
- Physical paths = hash-based layout `root/aa/bb/{hash}` and MUST match
  `HashBasedFileStorage` (duplicated knowledge until prompt 30 switches to
  persisted `File.RelativePath`).
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
Coverage is thin (path-resolution unit tests only) until prompt 31's
client-replay suite lands — sequences per client dance through
`WebApplicationFactory`, `Category=Integration`. Until then: any middleware/
handler change = manual client verification (Blender save is the highest-
value smoke). This surface is unauthenticated by design (prompt 23) — never
add write endpoints here without checking the threat-model page.

## Verify
`dotnet build Modelibr.sln && dotnet test Modelibr.sln --no-build --filter
"Category!=Integration"` + backend-integration suite if integration tests
were touched + the manual client check above.
