# MCP search quality — the verdict and what to do about it

Measured 2026-08-08 with a throwaway retrieval harness against a real
1,357-model instance (probes: `flint_tool`, `Fox`, `OfficeRound`).

## Verdict: lexically excellent, semantically blind

**Hits target at rank #1:** exact name, tokens, natural phrase, ≥3-char typos
(trigram), and every structural filter.

**Misses completely — every conceptual query:** `weapon` → 0 hits,
`animal` → no Fox, `building` → no office, plus `prehistoric` / `creature` /
`vehicle`. There is no category, tag, or embedding layer bridging concept →
instance.

**Conclusion: useful for an agent that already knows the author's vocabulary; not
for intent-based retrieval — which is how agents naturally reason.**

## The chosen bridge: auto-categorization

The user's **auto-categorization** idea is the pragmatic local-first fix — a
deterministic keyword→category derive rule, reusing the base-meshes category
pipeline. A local ONNX embedding model is the heavier alternative and **must stay
offline** to respect the local-first invariant.

## Calibration follow-ups

- **Duplicate hits** — asset-level AND part-level docs both return for the same
  asset. Noisy; group by asset.
- **Shape-class miscalibrated** — 396/1357 classified "planar" (29%) is too high.
  Uncalibrated by design (prompt 26; geometric priors off by default). A torus
  classifies as "blocky".
- **Degenerate/empty nodes get indexed** (e.g. "8 tris, 0×0×0 m") — pure noise.
- **base-meshes is normalized to ~2 m**, so dimension filtering can't discriminate
  within that pack.
- **Asset-level tokens are still empty.** Name search works via `DisplayName`
  ILIKE, but fuzzy trigram only fires on *part* tokens — the prompt-23
  "asset-name Include" follow-up would fix this.

## Re-measured 2026-08-09 — the verdict holds, with detail

Second run against a fresh 1,717-model library (base-meshes + glTF samples + POLYGON
City), probed over the MCP transport. **Prompt 29 did not close the semantic gap**: the
schema has `Tokens`, `Symbols` and `CategoryName`, and nothing writes concept labels
into any of them — `CategorySuggester` output only surfaces on
`get_asset.suggestedCategories`. So the "conceptual queries hit via deterministic
concept labels" claim is not backed by the index.

Still excellent: exact/partial names, trigram typos, and **every structural filter**
(`chair` + `minTriangles=5000` → exactly the 3 hero-detail chairs).

Newly pinned failures:

- `vehicle` → `credit_card`; `character` → `roman_pottery_01`; `building` → six
  `door_0N`; `medieval weapon` → `medieval_bookcase`, `bowl_01`.
- **Trigram noise outranks substring matches**: `street` → `strap`, `straw`.
- **Longer queries collapse**: `a city street at night` → 0 hits;
  `streetlight for a city street` → 1 junk hit. Adding words can *reduce* results to none.
- **Empty query returns 0**, so no filter-only browse — `list_facets` advertises filters
  that need a text query to work. "Every rigged asset" is unanswerable.
- **Duplicate + inconsistent counts**: asset-level and part-level docs both return, so
  `chair` = 46 docs but `chair` + any attribute filter = 17, because attributes live only
  on asset-level docs.

Fix plan is the v0.6 retrieval-bridge prompt: concept labels as an indexed column
(weighted below tokens), filter-only browse, group-by-asset, and a trigram floor.

Related: [[substrate-and-mcp.md]]
