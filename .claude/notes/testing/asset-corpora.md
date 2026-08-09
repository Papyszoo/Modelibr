# CC0 corpora for testing — what we use and what is worth adding

The local test library (staged outside the repo — **never commit these**) currently holds
1,717 models + 4,375 sounds:

| Corpus | What | Why it earns its place |
|--------|------|------------------------|
| **base-meshes** (CC0) | 900 `.glb` household/prop objects | Clean `snake_case` names, one asset per file, self-contained. The control group for name search. **Normalised to ~2 m**, so useless for size-filter testing |
| **glTF Sample Assets** (Khronos) | ~120 `.glb` + loose `.gltf` | The only source of rigged/animated/morph/PBR edge cases, and the multi-file `.gltf` + `.bin` + textures case. Also the only DRACO and KTX2 assets — which is how we found the worker registers neither loader |
| **POLYGON City** (Synty, licensed) | ~700 FBX/OBJ | Real production naming (`SM_Bld_Apartment_01`), real kit structure, rigged `SK_` characters. Everything we learned about abbreviations came from here. **Not CC0** — do not redistribute |
| **CC0 Public Domain Sounds** | 4,375 `.wav`/`.ogg`/`.m4a` | Volume + format spread for the audio extractor |

## Gaps worth filling, in priority order

1. **Kenney** (kenney.nl, CC0) — the single highest-value addition. Dozens of *themed*
   kits (city, nature, sci-fi, medieval, racing, furniture, weapons) with consistent
   naming and tiny file sizes. Themed kits are exactly what a concept-retrieval test
   needs: a query for "weapon" has an unambiguous right answer set, and cross-theme
   distractors come free. Also ships 2D sprites, UI packs and audio — coverage for the
   asset types MCP still cannot import.
2. **Quaternius** (quaternius.com, CC0) — low-poly themed packs (Ultimate Nature, Modular
   Buildings, Animated Characters, Vehicles). Strong on **rigged + animated** content,
   where our corpus is thin: exactly one animated character today, so `hasAnimations` and
   `hasRig` are barely exercised.
3. **ambientCG** (CC0) — PBR material sets (albedo/normal/roughness/AO/displacement) at
   multiple resolutions. The only way to test texture-set binding, channel mapping and —
   once it exists — texture baking against realistic inputs. Our texture coverage is
   currently whatever shipped inside the models.
4. **Poly Haven** (CC0) — HDRIs for environment maps, plus photogrammetry models and
   textures. HDRIs are the env-map path's real input and we have almost none.
5. **Smithsonian Open Access / Scan the World** (CC0) — high-poly scanned meshes. Useful
   as the *opposite* extreme: hundreds of thousands of triangles, no UVs, no materials —
   the decimation/unwrap/bake path's motivating case, and a stress test for extraction
   timeouts.

## What to keep in mind when adding a corpus

- **Never commit the assets.** They are staged on disk and bind-mounted; the repo stays
  free of blobs (standing invariant).
- Prefer packs with **author-written folder taxonomy** — the folder names are free
  training data for retrieval, and the plan is to index path segments.
- A corpus is most valuable when it contains **near-misses**: things that look
  semantically close but are not. `credit_card` vs a car is worth more to a relevance
  suite than another correct chair.
- Record the licence per corpus. CC0 can ship in demos and docs videos; Synty cannot.

## The relevance suite does not need any of them

`SearchRelevanceGoldenTests` seeds ~55 asset **names** directly as search documents — no
meshes, no worker, no files — so corpus-level relevance regressions are caught in CI in
seconds. Real corpora are for *calibration* (finding what to assert) and for the paths
that need real geometry: extraction, thumbnails, baking.

Related: [[../extraction-mcp/search-quality.md]], [[strategy.md]]
