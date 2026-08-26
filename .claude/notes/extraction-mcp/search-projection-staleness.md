# The search projection goes stale in two different ways

Search never reads a model. It reads `AssetSearchDocument`, a denormalised projection
built once, at extraction time, by `SearchDocumentBuilder`. Two independent things can
leave it wrong, they need different fixes, and until 2026-08-18 only one of them had one.

## Staleness of the second kind: the signals underneath

Tokens, prominence, quality flags, the browse summary — computed by
`AssetDerivationEngine` from the raw extraction. When that logic changes, the stored
answer is old. Fix: `trigger_rederive`, which re-reads the file, recomputes, and
reprojects on the way out. Expensive: it is the whole extraction pipeline.

## Staleness of the first kind: the index itself

Everything the **projection step** decides, over inputs that have not changed:

- **The vocabulary.** `SearchVocabulary` widens an asset's tokens at **index** time, on
  purpose, so the query side stays a plain literal match and stays explainable. The
  consequence nobody had costed: adding `rug ↔ carpet` changes no stored row. The new
  word finds nothing until every asset is written again.
- The denormalised **tags, description, packs, category** — each has a patch path for
  the edit that caused it, but nothing rebuilds them wholesale.

Before `reindex_search`, the only route was re-extraction: re-downloading and re-parsing
every file to arrive at parts and rollups **already sitting in two tables**. On the real
1,762-model library that is hours of work to apply a one-line vocabulary change, which in
practice means the vocabulary is never changed.

## Why a reprojection is possible at all

`ImportModelSceneGraphCommand` persists every input the builder takes, and persists it
verbatim:

| Builder input | Read back from |
| --- | --- |
| `rawParts` (`SceneGraphPartDto`) | `AssetPart` rows — field for field, `Detail` as stored JSON text |
| `rollups` (`SceneGraphRollupsDto`) | `ModelVersion`'s technical metadata, written by the same handler |
| `derived` (`DerivedAsset`) | `AssetDerivation.Payload`, PascalCase JSON |

The one field that does not round-trip is `WorldBounds.Min`/`Max`; `ModelVersion` keeps
only the dimensions. It does not matter: the origin those describe was already resolved
into `DerivedAsset.OriginInBounds`, and the builder reads `WorldBounds.Dimensions` only
as a fallback behind the version's own bounding box.

`ReprojectSearchDocumentsCommand` re-runs **only** the projection step over those. It
cannot fix staleness of the second kind, and says so instead of appearing to succeed —
re-running the projection over old signals faithfully reproduces the old answer.

The claim the whole thing rests on is a single test:
`Reprojecting_Reproduces_What_The_Extraction_Path_Indexed`. Without it a reindex could
silently rewrite the library into a *different* index than an extraction would, and
nothing anywhere would say so.

## The defect this turned up

`ModelVersionRepository.GetByIdAsync` included the model's category and packs but **not
its tags**, while the extraction path reads `version.Model.Tags` to denormalise them.
Lazy loading is off, so that collection came back empty and every re-derive wrote a
document with no tags — blanking, on the projection only, the vocabulary a user had
typed. Silent in both directions: the tags stayed correct in the library, and search
simply stopped answering to them until someone edited them again.

The comment above that line already said re-derivation must not drop authored tags. The
include it depended on was never there. Guarded now by
`ModelVersionRepositoryIncludesTests`, which fails if any of the four denormalised
fields stops loading.

**The general rule:** when a projection denormalises a field, the repository that feeds
the rebuild has to load it, and no unit test with a mocked repository can tell you it
doesn't. See [[substrate-invariants]] for the rest of the cross-layer rules this file
belongs to.
