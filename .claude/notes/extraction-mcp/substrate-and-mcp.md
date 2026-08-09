# Asset extraction substrate + MCP server

Branch `feat/extraction-substrate` (prompts 20–27). Commit `746e3861` on the
current branch carries the substrate, semantic search, and MCP agent server.

## Validating against a fresh instance

Bring up a fresh Docker stack (webapi + worker images rebuilt from the working
tree) rather than reusing a populated one — the extraction pipeline behaves
differently against assets that already carry derivations.

Moving `./data/` aside instead of deleting it makes the old instance restorable:
`docker compose down`, move postgres/uploads/thumbnails aside, `up`. Leave
`data/certs`, `data/backups` and `data/restore` in place.

- A fresh DB migrates all 24 migrations including the 5 extraction ones.
- MCP endpoint serves at `https://localhost:8443/mcp` (SSE) with `MCP_ENABLED`.
- Postgres credentials come from root `.env`.

## The MCP surface today

**11 tools + 1 prompt.** Read (always on): `search_assets`, `get_asset`, `get_part`,
`compute_on_demand`, `list_facets`. Write (only with `MCP_WRITE_ENABLED=true`):
`set_tags`, `set_category`, `create_pack`, `add_to_pack`, `trigger_rederive`,
`import_model`, plus the `import_library` prompt. All return real data.

**Every write tool is Model-only.** There is no agent-reachable path for sounds,
textures, texture sets, sprites or env maps — importing the CC0 sound corpus had to
bypass MCP and POST to `/sounds/with-file`. Nor can an agent bind a texture set,
create a category, delete, or undo. "Everything a user can do" is about one sixth true.

## Real-data validation

**3 packs, 1,357 models, 0 dead extractions:** base-meshes 900 (CC0), glTF Sample
Assets 118 (`.glb`, rigged/animated/morph/PBR), POLYGON City 339 (Synty FBX).
Imported via host-side curl scripts, **not** MCP (it's read-only). macOS bash 3.2
has no `declare -A` — use awk for dedup.

Works well: name/token/fuzzy (trigram) matching across packs; structural filters
discriminate (`hasAnimations` → only the rigged Fox; min/maxTriangles; cross-pack);
`get_asset` shows rig/bone hierarchy; `compute_on_demand` degrades gracefully to
`{"status":"pending"}` (executor gap).

## Three bugs found and fixed, verified live

1. **Part dimensions ignored the node transform.** Parts used local
   `Detail.boundingBox` (2.5×2.5×0.5) while the asset reported
   `Rollups.WorldBounds` (2×0.4×2). Fix: worker `lib/sceneGraph.js` emits per-part
   `worldBoundingBox` via `Box3().setFromObject` (extractor version 1→2),
   `modelDataService.js` forwards it, `SceneGraphDerivationMapper` prefers it
   (local box = fallback for v1/bpy). +3 tests.
2. **"mesh — mesh" summary.** `AssetDerivationEngine.PartBrowseSummary` no longer
   repeats the object type when the name already fell back to it → "mesh — 384
   tris, 2×0.4×2 m". The generic-name→object-type fallback itself is intended. +1 test.
3. **`ModelVersionRepository.GetByIdAsync` lacked `.Include(v => v.Model)`**, so
   `version.Model?.Name` was null during scene-graph import → every asset indexed
   as "Model {id}" with empty tokens, unsearchable by name. Fix = add the Include.
   Regression test `ModelVersionIncludeModelRegressionTests`. After the fix all
   1,357 assets carry their real name.

All suites green after fixes: worker 173, backend non-integration 776,
integration 19.

## Texture binding is a manual 2-step

Import put the atlas in the pack but created **0 model associations**. Binding:

```
POST /texture-sets/{setId}/models/{modelId}/all-versions
PUT  /models/{id}/default-texture-set
```

Validated visually (hydrant grey→red, apartment brick+windows), then applied to
all 339. Synty FBX carry only a generic Maya material `blinn283` with no
resolvable texture, so they render grey until bound. The set is albedo-only —
normal/metallic need the pre-upload-fileId flow.

**Viewer color trap:** the default texture-variant strips the model's own
materials; the user must pick the "Embedded" variant to see colors. Frontend
model-viewer default, `__embedded__` logic near
`src/frontend/src/mocks/dynamic-demo/shared.ts:825`.

## Second validation run — 2026-08-09, imported *through* MCP

Fresh stack (data wiped, images rebuilt), `MCP_WRITE_ENABLED=true`, driven over the
real `/mcp` transport. **1,717 models imported by the MCP write tools themselves**
(base-meshes 900 `.glb`, glTF Sample Assets 120 `.glb`, POLYGON City 697 FBX/OBJ),
0 import failures, 3,438 audit rows. Plus 4,375 CC0 sounds via HTTP (MCP cannot carry
them). This is the run that found the two bugs below.

**Two bugs found and fixed on PR #579:**

1. **MCP flags never reached the container.** `MCP_ENABLED` / `MCP_WRITE_ENABLED` were
   read from configuration but absent from both `docker-compose.yml` and
   `.env.example` — so on the Docker stack (how Modelibr actually runs) writes could
   not be turned on at all and `MCP_ENABLED=false` did not turn the endpoint off.
2. **Idempotency was a check-then-act race.** Each tool looked the key up, wrote, then
   inserted the audit row. Two concurrent calls with one key both passed the lookup and
   both applied; the loser tripped the unique index *after* mutating. Reproduced with two
   concurrent `create_pack` calls: **two `Packs` rows, one audit row**, and an opaque
   "An error occurred invoking 'create_pack'" instead of `already-applied`. Fixed by
   claiming the key first (`TryClaimAsync` → handler → `CompleteClaimAsync`, or
   `ReleaseClaimAsync` on failure). Verified live: 5 concurrent same-key calls → 1 pack,
   1 audit row, 4 `already-applied`. Regression test is a **concurrency** integration
   test — the sequential retry test could never have caught it.

**Co-located import needs a mount.** `import_model(path)` reads server-side, so the
library must be visible *inside* the container. colima only mounts `$HOME`, not
`/Volumes`, so an external-disk corpus has to be staged under `$HOME` and bind-mounted.

**The remote branch is unaudited.** `import_model` without `path` hands back an HTTP
endpoint and steps out — those uploads get no `AgentOperationLog` entry and no
idempotency, the two guarantees the co-located path advertises.

## v0.6 direction — full agent surface (writes)

User's end goal, stated 2026-08-08: MCP should let an agent **do everything a
user can do in the app**, not just read. This is a larger phase than the
originally-sketched "prompt 28 write tools".

Agreed design constraints:

- **Keep MCP a thin pass-through over the existing REST API** — one source of
  truth. The frontend already routes 100% of its behavior through feature `api/`
  modules on `lib/apiBase.ts`, so "everything the user can do" ≈ "everything the
  API exposes". Don't fork logic into MCP.
- **File upload when client ≠ server (LAN).** A server-side `import_from_path`
  only works co-located. Remote uploads need the bytes to travel: **MCP = control
  plane, HTTP = data plane** — an `import_model` tool points at an upload URL
  (existing `POST /models`), the agent's host streams bytes over HTTP, a second
  call finalizes (name/pack/tags). base64-in-tool-call only for small meshes.
  **Support both** `path` (co-located, zero-copy, local-first) and URL/stream.
- **Auth/exposure.** Once writes exist and the server is LAN-reachable, an agent
  on another box can mutate the library — needs a token + scoping (reuse the
  store import-token pattern; respect the prompt-23/27 network-exposure threat
  model). MCP must not widen reach without auth.
- **Audit.** Every agent write routes through the prompt-20 `AgentOperationLog` +
  idempotency schema hooks (already built, currently unused) so mutations are
  recorded and replay-safe.

Related: [[search-quality.md]]
