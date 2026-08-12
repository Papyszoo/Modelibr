# MCP search quality - the verdict and what to do about it

> **Resolved 2026-08-09 (PR #579).** Measured on the same 1,717-model library, fully
> re-derived: **P@5 69.2% → 89.7%, MRR 75.8% → 87.8%, nDCG 76.0% → 91.2%**, cases
> containing a forbidden near-miss **8 → 0**, plural-parity failures **3 → 0**,
> structural failures **2 → 0**. `building` 0% → 100%, `streetlight` 0% → 100%,
> "a rundown city street at night" 0% → 80%, `furniture` 40% → 100%.
> The regression suite is `SearchRelevanceGoldenTests` (seeded documents, runs in CI).
> The history below is kept because it explains *why* each fix exists.

Measured 2026-08-08 with a throwaway retrieval harness against a real
1,357-model instance (probes: `flint_tool`, `Fox`, `OfficeRound`).

## Verdict: lexically excellent, semantically blind

**Hits target at rank #1:** exact name, tokens, natural phrase, ≥3-char typos
(trigram), and every structural filter.

**Misses completely - every conceptual query:** `weapon` → 0 hits,
`animal` → no Fox, `building` → no office, plus `prehistoric` / `creature` /
`vehicle`. There is no category, tag, or embedding layer bridging concept →
instance.

**Conclusion: useful for an agent that already knows the author's vocabulary; not
for intent-based retrieval - which is how agents naturally reason.**

## The chosen bridge: auto-categorization

The user's **auto-categorization** idea is the pragmatic local-first fix - a
deterministic keyword→category derive rule, reusing the base-meshes category
pipeline. A local ONNX embedding model is the heavier alternative and **must stay
offline** to respect the local-first invariant.

## Calibration follow-ups

- **Duplicate hits** - asset-level AND part-level docs both return for the same
  asset. Noisy; group by asset.
- **Shape-class miscalibrated** - 396/1357 classified "planar" (29%) is too high.
  Uncalibrated by design (prompt 26; geometric priors off by default). A torus
  classifies as "blocky".
- **Degenerate/empty nodes get indexed** (e.g. "8 tris, 0×0×0 m") - pure noise.
- **base-meshes is normalized to ~2 m**, so dimension filtering can't discriminate
  within that pack.
- **Asset-level tokens are still empty.** Name search works via `DisplayName`
  ILIKE, but fuzzy trigram only fires on *part* tokens - the prompt-23
  "asset-name Include" follow-up would fix this.

## Re-measured 2026-08-09 - the verdict holds, with detail

Second run against a fresh 1,717-model library (base-meshes + glTF samples + POLYGON
City), probed over the MCP transport. **Prompt 29 did not close the semantic gap**: the
schema has `Tokens`, `Symbols` and `CategoryName`, and nothing writes concept labels
into any of them - `CategorySuggester` output only surfaces on
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
- **Empty query returns 0**, so no filter-only browse - `list_facets` advertises filters
  that need a text query to work. "Every rigged asset" is unanswerable.
- **Duplicate + inconsistent counts**: asset-level and part-level docs both return, so
  `chair` = 46 docs but `chair` + any attribute filter = 17, because attributes live only
  on asset-level docs.

### After the POLYGON City pack finished indexing

Lexical retrieval improves a lot with real game-library content: `apartment`, `SM_Bld`,
`bench`, `traffic`, `vehicle` (`SM_Veh_Car_Van_01` #1) and `hasRig` → 15 rigged Synty
characters are all correct. Three data-quality problems then dominate:

- **Degenerate nodes rank first.** `car` + `maxTriangles=10000` → `car-01 - 8 tris,
  0×0×0 m` at #1. Known noise source, now actively winning scene queries.
- **`building` still returns doors** with 334 `SM_Bld_*` indexed - the tokenizer never
  expands `Bld`. Synty-style abbreviations (`Bld`/`Veh`/`Env`, `SM_`/`SK_`) need an
  expansion layer; this naming is ubiquitous in game asset packs.
- **FBX and OBJ imports of the same mesh disagree on part scale by ~100×.**
  `SM_Bld_Apartment_01` (456 tris) → `1.92×1.15×2 m` from FBX, `0.02×0.01×0.02 m` from
  OBJ. Asset-level world bounds stay correct on both, so only part-level size filtering
  is poisoned - but that is exactly what an agent uses.

**Correction:** an earlier note here claimed `trigger_rederive` re-indexed 147 models in
~2 minutes. It did not - those documents were written by the thumbnail queue draining at
the same time. A model re-derive queued **without an explicit versionId was a silent
no-op**: the worker extracted the file, 400'd on both save calls, and still reported the
job completed. Fixed by resolving the current version in the enqueue handler; before that
fix, re-deriving all 1,717 models reported success and changed nothing.

### Mechanism - why multi-word queries behave the way they do

`AssetSearchQueryHandler` passes the **raw, unsplit term** to `SearchRepository`, which
ORs four clauses: whole-phrase adjacency ILIKE on `Tokens`/`Symbols`, whole-phrase
substring on `DisplayName`, `trigram(entire token blob, entire term) > 0.2`, and
`to_tsvector('simple', BrowseSummary) @@ plainto_tsquery('simple', term)`.

The first two need the whole phrase contiguous and the fourth ANDs its lexemes against a
*summary*, so **multi-word queries are decided almost entirely by whole-blob trigram
similarity** - noise that sometimes lands (`traffic light` → `SM_Prop_TrafficLight_01`
#1) and sometimes does not (`streetlight for a city street` → `b_RightForeArm_07`). It is
also why adding words *raises* the result count: `apartment` 103 → `apartment building`
243, with `SM_Bld_Apartment_Door_01` outranking `SM_Bld_Apartment_01`.

`'simple'` means no stemming and no stopwords, so plurals silently lose most results:
`chair` 57 → `chairs` 33, `box` 98 → `boxes` 30, `building` 200 → `buildings` 174. And
the 0.2 trigram floor is self-described as a guess - `stree` works, `strt` returns
`strap`/`straw`.

Fix plan is the v0.6 retrieval-bridge prompt: **split the query and score per word**
(the cheapest large win), `english` config for prose with a `setweight`ed tsvector +
GIN index, concept labels and abbreviation expansion at index time, folder/pack path as
free tokens, filter-only browse, group-by-asset, a calibrated trigram floor, and dropping
degenerate nodes. A local ONNX embedding model stays a live option - the invariant bans
*hosted* inference, and Blender's download-on-demand is the precedent for shipping an
optional local model.

Related: [[substrate-and-mcp.md]]
