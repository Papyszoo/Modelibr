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

## Today's MCP server is READ-ONLY

Five tools: `search_assets`, `get_asset`, `get_part`, `compute_on_demand`,
`list_facets`. All return real data.

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
