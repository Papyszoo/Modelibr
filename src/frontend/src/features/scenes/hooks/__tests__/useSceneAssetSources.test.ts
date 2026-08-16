import { isAwaitingResources } from '../useSceneAssetSources'

/**
 * The gate that decides when a loose `.gltf` may start loading.
 *
 * The regression it catches shipped once and cost a day: several loose-glTF
 * nodes in one scene rendered as red boxes while the same assets opened fine in
 * the model viewer. `useLoader` caches by URL and caches failures, so a load
 * started one render tick before its resource map arrived stayed broken for the
 * life of the page.
 *
 * Asserted as a pure function because the failing state is a single render tick
 * inside `useQueries`, and a test that has to reproduce that tick would be
 * testing React Query's scheduling rather than this rule.
 */
describe('isAwaitingResources', () => {
  const packed = false
  const loose = true

  it('lets a packed .glb start immediately', () => {
    // A .glb carries its buffers inside, so there is nothing to wait for.
    expect(isAwaitingResources(packed, undefined)).toBe(false)
    expect(isAwaitingResources(packed, { isSuccess: false })).toBe(false)
  })

  it('holds a loose .gltf until its resource map has actually arrived', () => {
    expect(isAwaitingResources(loose, { isSuccess: true })).toBe(false)
  })

  it('holds a loose .gltf whose auxiliary query has not started yet', () => {
    // The exact regression: a query that has not started reports neither
    // success nor loading, and the old gate read that as "go". Both the
    // undefined query and the not-yet-started one must keep the loader back.
    expect(isAwaitingResources(loose, undefined)).toBe(true)
    expect(
      isAwaitingResources(loose, { isSuccess: false, isError: false })
    ).toBe(true)
  })

  it('stops holding a loose .gltf whose resource map failed to load', () => {
    // The map is never coming. A visible failure beats a pending marker that
    // spins forever.
    expect(
      isAwaitingResources(loose, { isSuccess: false, isError: true })
    ).toBe(false)
  })
})
