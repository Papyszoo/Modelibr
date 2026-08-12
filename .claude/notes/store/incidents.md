# Store production incidents - two failures worth not repeating

Both surfaced on the live store in July 2026 after uploading a ~900-item pack.
Neither is reachable from Modelibr's own code, but both are failure modes this
stack can produce again.

## 1. Large packs cartesian-exploded

**Symptom:** the site went slow and the pack detail page failed after a long
spinner with "Asset Not Found".

**Root cause:** `GetAssetByIdQueryHandler`, `GetAssetManifestQueryHandler` (the
Modelibr import path) and `DeleteAssetCommandHandler` each eager-load an asset
with **four collection includes** (Files, Items, PreviewArtifacts, AssetTags). EF
Core's default single-query strategy joins them into a **cartesian product** -
roughly 900 × 900 × 1800 ≈ billions of rows → Postgres pegged → request timeout.
The catalog page's `.catch(() => setNotFound(true))` then renders "Asset Not
Found" for *any* fetch failure, which hid the real error. Small assets never hit
it, so it only appeared with the big pack.

**Fix:** default the Npgsql provider to `QuerySplittingBehavior.SplitQuery` in
`Infrastructure/DependencyInjection.cs`. It has to live in provider config rather
than per-query: `AsSplitQuery()` is relational-only, the store's read handlers sit
in the Application layer (core EF only), and unit tests use `UseInMemoryDatabase`
which **throws** on split queries.

**Regression tests:** a config test asserting the provider default (the
deterministic guard - split vs single return identical deduped rows, so only
config reliably fails on revert), plus an e2e uploading a 64-item pack against
real Postgres. Gotchas found writing it: `AddInfrastructure` eagerly needs
`ConnectionStrings:Default` + `Jwt:Secret`, and
`FindExtension<RelationalOptionsExtension>()` is exact-type - use
`options.Extensions.OfType<RelationalOptionsExtension>()`.

**Modelibr is NOT affected** - it already applies `.AsSplitQuery()` to every
multi-collection include (`ModelRepository`, `PackRepository.GetById`,
TextureSet/Sprite/Sound/Script/Project/EnvironmentMap, WebDAV
`VirtualAssetStore`), because its queries live in Infrastructure repos where
relational EF is available. **But Modelibr has no global default and relies on
developers remembering per-query** - a future multi-collection query can regress
exactly this way. See `backend-persistence`.

## 2. SPA deep-link / refresh 404

**Symptom:** opening a pack worked, but **refreshing** that page returned a raw
nginx 404.

**Root cause:** the SPA routes asset detail at `/assets/:id`, but Vite also emits
hashed build bundles under `/assets/`. The nginx config had a `location /assets`
long-cache block with **no index.html fallback**, shadowing the SPA route. In-app
navigation worked; a hard refresh asked nginx for a file that doesn't exist.

**Fix:** scope the cache block to real static-file **extensions** via regex
(`location ~* ^/assets/.+\.(js|mjs|css|png|…)$`) so `/assets/<uuid>` - no
extension - falls through to `try_files … /index.html`.

**Why e2e could never catch it:** the e2e compose builds the frontend with **no
`target:`**, so the last Dockerfile stage wins = the Vite **dev** server, which
always falls back to index.html. Production uses the nginx stage. Verification had
to run against the built production image.

**General lesson:** if your e2e frontend and your production frontend are
different Dockerfile stages, an entire class of serving bugs is invisible to the
suite. Check which stage the test stack actually builds.

## Process lesson from the same PRs

A test fix written locally but not committed before its PR merged left `main`'s
test red. **Commit the test fix before the PR merges.** Also: `npm run test | tail`
masks the real exit code, and `playwright-report/index.html` can be stale -
capture full output.

Related: [[integration.md]], [[../testing/flakiness.md]]
