import { isAwaitingGltfResources } from '../useGltfResources'

/**
 * The gate that decides when the model viewer may start loading a loose `.gltf`.
 *
 * The regression it catches is the model-viewer half of the one
 * `useSceneAssetSources` fixed on the scene side. The viewer had no gate at all:
 * `useGltfResources` returned an `isLoading` flag that its only caller
 * destructured away, so the scene mounted with an empty resource map on the
 * first render. The safe loading manager then rewrote the `.bin` to a
 * transparent PNG, and because `useLoader` caches failures the model stayed a
 * mesh with zero vertices for the life of the page.
 *
 * It surfaced as an intermittent, not a hard failure, because React Query
 * serves the auxiliary query from cache within its 5-minute staleTime - so
 * whether the map was already there on first render depended on what the user
 * (or the test) had opened just before.
 *
 * Asserted as a pure function for the same reason as the scene-side twin: the
 * failing state is one render tick inside React Query's scheduling.
 */
describe('isAwaitingGltfResources', () => {
  const packed = false
  const loose = true

  const versionChosen = { isKnown: true, isPending: false }
  /** Versions still in flight, or landed but not yet selected from. */
  const versionComing = { isKnown: false, isPending: true }
  /** The list settled with nothing to select - no version is ever coming. */
  const versionNone = { isKnown: false, isPending: false }

  it('lets a packed .glb start immediately', () => {
    // Nothing is fetched for a self-contained file, so there is nothing to wait
    // for and the gate must never hold it back - not even before its version is
    // known.
    expect(isAwaitingGltfResources(packed, undefined, versionChosen)).toBe(
      false
    )
    expect(
      isAwaitingGltfResources(packed, { isSuccess: false }, versionComing)
    ).toBe(false)
  })

  it('lets a loose .gltf start once its resource map has arrived', () => {
    expect(
      isAwaitingGltfResources(loose, { isSuccess: true }, versionChosen)
    ).toBe(false)
  })

  it('holds a loose .gltf whose auxiliary query has not started yet', () => {
    // The exact regression: `enabled` is derived from the model query's data in
    // the same render, so on the tick that data first lands this query has not
    // started - and a query that has not started reports `isLoading: false`.
    // A negative flag reads that as "go"; a positive one does not.
    expect(isAwaitingGltfResources(loose, undefined, versionChosen)).toBe(true)
    expect(
      isAwaitingGltfResources(
        loose,
        { isSuccess: false, isError: false },
        versionChosen
      )
    ).toBe(true)
  })

  it('holds a loose .gltf whose version is not selected yet', () => {
    // The half the first fix missed. The versions list is its own round trip, so
    // the model is on screen - files already naming a `.gltf` - for many renders
    // before anything can be asked about auxiliaries. The auxiliary query cannot
    // even be enabled yet, so consulting only its state opens the gate for that
    // whole window and the loader starts against an empty map.
    expect(isAwaitingGltfResources(loose, undefined, versionComing)).toBe(true)
    expect(
      isAwaitingGltfResources(loose, { isSuccess: true }, versionComing)
    ).toBe(true)
  })

  it('stops holding a loose .gltf that has no version to wait for', () => {
    // Nothing more is coming, and an empty viewport that waits forever is worse
    // than the degraded render.
    expect(isAwaitingGltfResources(loose, undefined, versionNone)).toBe(false)
  })

  it('stops holding a loose .gltf whose resource map failed to load', () => {
    // The map is never coming. A visible failure beats a viewport that waits
    // forever.
    expect(
      isAwaitingGltfResources(
        loose,
        { isSuccess: false, isError: true },
        versionChosen
      )
    ).toBe(false)
  })
})
