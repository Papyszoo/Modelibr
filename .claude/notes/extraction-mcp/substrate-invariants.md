# Substrate invariants - the cross-layer rules the pipeline broke

Found by review of PR #579 and fixed in the same branch. Each of these was **green on
every test** while being wrong: the bugs live in the seams between the worker, the
command handlers and the projection, and the suites all mocked at least one side.

Related: [[substrate-and-mcp.md]], [[search-quality.md]]

## Extraction: the scene graph is the single authoritative write

`ImportModelSceneGraphCommand` refreshes the flat technical-metadata columns **and**
upserts the verbatim v2 payload into the same `AssetExtraction` row.
`UpdateTechnicalMetadataCommand` upserts the flat v1 payload into that *same* row.

So the two writes are not additive - the later one wins the raw payload. The extraction
executor ran scene graph → technical metadata, meaning **every successful re-derive
destroyed the raw extraction** it exists to preserve. The thumbnail path happened to run
them the other way round and was fine, which is why nothing showed.

Rule: exactly one raw write per extraction. The flat path is a *fallback*, used only when
no scene graph could be produced.

## Extraction: a `false` from a save is a job failure

`ModelDataService.saveSceneGraph` / `saveTechnicalMetadata` convert an API error into
`false` and never throw. The executor ignored the return and marked the job Done, so a
transient 400/500/timeout **permanently completed a job that rebuilt nothing** - no
retry, and `trigger_rederive` silently did nothing.

The unit test mocked those methods as `undefined` and still expected success. When you
mock a boolean-returning API client, mock the boolean.

## Extraction: measure the model before you frame it

`normalizeModel(model, 2.0)` multiplies the root scale so the model fits a 2-unit
thumbnail view box. The scene-graph extractor read `Box3.setFromObject(root)` *after*
that, so a 10×4×2 m asset was indexed as ~2×0.8×0.4 - corrupting every size fact, size
filter and any future placement reasoning.

Fix: the payload is captured in `loadModel`, before normalization; `extractSceneGraph()`
returns that capture and refuses rather than measuring a normalized model.
(`extractTechnicalMetadata` was already correct - it uses the saved `originalSize`.)

## Search: "current version" is `Model.ActiveVersionId`, not arrival order

The projection marked every incoming extraction current and cleared the flag on all
other versions. Whichever job finished **last** therefore decided what search returned:
a delayed job for an old version, an upload against a non-active version, or a re-derive
could each silently swap the asset's searchable version.

## Search: the projection is denormalized, so every transition must be mirrored

`SearchRepository` reads projection state only. Anything not written into
`AssetSearchDocuments` is simply invisible to it until something re-derives:

| Transition | What was wrong |
| --- | --- |
| soft delete / restore | recycled assets stayed fully searchable (now `IsActive`) |
| permanent delete | no FK from the projection, so nothing cascaded - documents orphaned |
| active-version change | current-version marker never moved |
| `set_category` | category is stamped at extraction time, so an agent could not confirm its own write with a category-filtered search |

## Search: structural filters describe the asset, part rows describe a part

Part documents carry only triangles/vertices/UVs; everything else is null. Applying
whole-asset filters per document was wrong in **both** directions:

- `maxTriangles` passed a 4M-triangle asset on the strength of one small part;
- `hasRig=false` passed a rigged model, because its parts have a null `BoneCount`;
- conversely `category` dropped every part hit, since only the asset row carries it.

Filters now run against the asset-level document and admit/reject all of that asset's
rows; part rows remain for textual matching.

## Queues and claims: a claim row is not proof of work

Two instances of the same mistake:

- **Extraction jobs.** `finish` validated neither worker identity nor lease, so a worker
  whose lease had lapsed could overwrite the outcome of the run that replaced it. And an
  expired lock bypassed `MaxAttempts` entirely - a job that reliably hangs the worker
  was re-claimed forever, never dead-lettered.
- **MCP idempotency.** The key is (correctly) claimed *before* the mutation, but any
  existing row was then read as "already applied". A crash, exception or cancellation
  between claim and mutation therefore burned the key permanently: every retry was told
  the write had landed when nothing had. Claims carry Pending/Completed/Failed plus an
  owner and a lease; only Completed replays as applied, a live claim answers
  `in-progress`, and a Failed claim is taken over by conditional UPDATE.

### The half of that which was still wrong (0.6)

Two follow-ups, both about the same thing: a claim row records who *started*, and the
first version of the fix quietly assumed it also recorded what *happened*.

- **An abandoned Pending claim is ambiguous, not free.** The mutation commits before the
  entry is marked Completed. A claim still Pending when its owner died may sit on either
  side of that, and nothing distinguishes "never ran" from "ran and was not recorded".
  Taking it over silently is how one crash becomes two packs. The lease now moves such a
  claim to a fourth status, `Interrupted`, which is **terminal**: every call on that key
  gets the same explicit recovery answer, and proceeding means a new key. Reporting it
  once and then releasing it to `Failed` is not a fix - it moves the duplicate to the next
  call, which is the one nobody is watching.
- **Settling by key alone is a lost update.** A caller whose lease lapsed, whose row was
  then taken over, still completed "its" key on the way out and stamped its outcome onto
  the new owner's in-flight work. Every claim now carries a generation (`ClaimToken`),
  regenerated on takeover, and every settle matches on it.

The same two mistakes were in **reversal**, in a sharper form: `ReversedAt` was stamped
*before* the inverse ran, so it was serving as both the mutual exclusion and the record of
fact. An inverse that was cancelled, threw, or died with its process therefore left an
operation permanently marked as undone that was never undone - and nothing can undo it
again. The lock is now `ReversalToken`/`ReversalClaimedAt` and the fact stays in
`ReversedAt`, written only after the inverse lands. A reversal claim past its lease is
`Interrupted` for exactly the reason above, and a batch that meets one **stops** rather
than skipping to the older steps that depend on it.

### The half of THAT which was still wrong: a claim covers one write, not two

Both of the above are about a claim recording who started rather than what happened. The
next layer down is a claim covering an operation that is **several separately-committing
writes**, where "what happened" has no single answer:

- `bind_texture_set` associated the set with every version (commit), then made it the
  model's default (commit). A model with versions but no ACTIVE version answers
  `NoActiveVersion` to the second one - so the tool returned a failure, and the guard
  reads a returned failure as "declined before mutating" and hands the key back as
  retryable. The association was already on disk, described by no completed entry, and
  the retry ran it again.
- The composite reversals (`distribute-assets`, `place-assets-batch`, `create-room`)
  remove a row of nodes one command at a time. Three of forty gone and then a refusal
  released the reversal claim, so the next attempt re-applied an inverse that had already
  half happened.

Rule: **a guarded operation must not be able to produce a retryable failure after a
durable write.** Either the whole thing is one transaction (`IUnitOfWork.InTransactionAsync`
- what both of these now use), or it reports applied-partial and keeps the claim, the way
`import_texture_set` does for a set whose later channels failed. What it may never do is
return a plain failure with something already committed behind it.

## Multi-file glTF: identity includes what the file references

A loose `.gltf` is identity-incomplete. Dedup ran on the primary hash alone, and the
second import then **skipped** its own `scene.bin` because a link at that relative path
already existed - two different assets collapsed into one and the second's geometry was
lost silently. Identity now compares the referenced resources' hashes; a mismatch
imports a distinct model instead of merging.

## Multi-file glTF: one import path, or the shapes drift apart

`.zip` import used to POST the archive to a server-side unzip route that answered
`{batchId, imported[]}`, while every other upload path answered
`{succeeded, failed, total}`. The shared success callback reads `results.succeeded`, so
it threw: no imported model was associated with the pack the import was started from,
and the grid never refreshed - all *after* the progress window had reported success.
The renderability/`.blend` gates did not apply either, because they are client-side and
the archive never passed through them.

Fixed by deleting the divergence rather than translating between shapes: the archive is
expanded in the browser (`shared/utils/zipImport.ts`) into `File`s carrying their
archive-relative path, and handed to the folder path. There is no zip-specific code after
that. The backend `/models/zip` route stays for remote MCP agents that cannot run a
browser; nothing in the app calls it.

Lesson: a second route that produces "the same thing" in a different shape is a bug
waiting for the first shared consumer. Prefer one path with an adapter at the edge.

## Multi-file glTF: two runtimes, two loading managers

The worker resolving external references says nothing about the browser. The viewer
attached the shared `safeLoadingManager`, which rewrites anything that isn't
`/files/<id>` to a transparent PNG - so an imported loose `.gltf` opened with its
`scene.bin` replaced by an image, i.e. **no geometry at all**, while the thumbnail
looked perfect. The E2E only ever checked worker output.

Whenever a resource-resolution rule lands in the worker, ask what the viewer does with
the same file, and assert it by *opening the model*, not by reading the DB.

## Offline: unresolved means blocked, not passed through

`buildResourceResolver` returned unmatched URLs untouched, and the render template
installed no resolver at all when the map was empty. A glTF naming
`http://…`/`//host/…` could therefore make the renderer's Chromium fetch an arbitrary
host or local-network address. The resolver is now installed unconditionally and
substitutes a blocked placeholder for anything it cannot resolve locally.
