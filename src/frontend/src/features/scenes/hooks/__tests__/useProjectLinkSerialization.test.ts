import { act, renderHook } from '@testing-library/react'

import {
  LINK_PENDING_MESSAGE,
  useProjectLinkSerialization,
} from '../useProjectLinkSerialization'

/**
 * The stale-revision conflict this closes: linking moves the scene's revision,
 * the editor reseeds its draft from a new revision only while the draft is
 * clean, and an edit made during the link therefore leaves the draft dirty at
 * the OLD revision - so the next save is refused over a revision the user never
 * saw and cannot reconcile.
 */
describe('project-link serialization', () => {
  function setup(
    loadedRevision: number | undefined,
    baseRevision: number | null
  ) {
    return renderHook(
      ({
        loaded,
        base,
        fetching = false,
      }: {
        loaded: number | undefined
        base: number | null
        fetching?: boolean
      }) =>
        useProjectLinkSerialization({
          loadedRevision: loaded,
          baseRevision: base,
          isFetching: fetching,
        }),
      { initialProps: { loaded: loadedRevision, base: baseRevision } }
    )
  }

  it('allows editing when no link is in flight', () => {
    const { result } = setup(4, 4)

    expect(result.current.editsBlocked).toBeNull()
  })

  it('holds editing while the link write is in flight', () => {
    const { result } = setup(4, 4)

    act(() => result.current.onPendingChange(true))

    expect(result.current.editsBlocked).toBe(LINK_PENDING_MESSAGE)
  })

  it('keeps holding after the write settles, until the refetch has landed', () => {
    // The gap the first attempt at this left open. The mutation settles when the
    // server answers; the refetch it invalidates lands afterwards, and the draft
    // is reseeded after that. Releasing on isPending alone is the same bug one
    // tick later.
    const { result, rerender } = setup(4, 4)

    act(() => result.current.onPendingChange(true))
    // The invalidation is fire-and-forget, so the mutation settles first and the
    // refetch starts after it.
    act(() => result.current.onPendingChange(false))
    rerender({ loaded: 4, base: 4, fetching: true })

    expect(result.current.editsBlocked).toBe(LINK_PENDING_MESSAGE)

    // The query has the new revision but the draft has not been reseeded yet.
    rerender({ loaded: 5, base: 4, fetching: false })
    expect(result.current.editsBlocked).toBe(LINK_PENDING_MESSAGE)
  })

  it('resumes editing once the draft is seeded on the revision the link produced', () => {
    const { result, rerender } = setup(4, 4)

    act(() => result.current.onPendingChange(true))
    act(() => result.current.onPendingChange(false))
    rerender({ loaded: 4, base: 4, fetching: true })
    rerender({ loaded: 5, base: 4, fetching: false })
    expect(result.current.editsBlocked).toBe(LINK_PENDING_MESSAGE)

    // Reseeded: draft and query agree again.
    rerender({ loaded: 5, base: 5, fetching: false })

    expect(result.current.editsBlocked).toBeNull()
  })

  it('does not resume on a revision that only looks settled because nothing loaded', () => {
    // undefined === null would otherwise read as "they agree".
    const { result, rerender } = setup(undefined, null)

    act(() => result.current.onPendingChange(true))
    act(() => result.current.onPendingChange(false))
    rerender({ loaded: undefined, base: null, fetching: false })

    expect(result.current.editsBlocked).toBe(LINK_PENDING_MESSAGE)
  })

  it('re-holds when a second link starts after the first settled', () => {
    const { result, rerender } = setup(4, 4)

    act(() => result.current.onPendingChange(true))
    act(() => result.current.onPendingChange(false))
    rerender({ loaded: 5, base: 5, fetching: false })
    expect(result.current.editsBlocked).toBeNull()

    act(() => result.current.onPendingChange(true))
    expect(result.current.editsBlocked).toBe(LINK_PENDING_MESSAGE)
  })

  it('holds while the refetch the link queued is still in flight', () => {
    const { result, rerender } = setup(4, 4)

    act(() => result.current.onPendingChange(true))
    act(() => result.current.onPendingChange(false))
    rerender({ loaded: 4, base: 4, fetching: true })

    // Revisions agree, but only because the new one has not arrived yet.
    expect(result.current.editsBlocked).toBe(LINK_PENDING_MESSAGE)
  })

  it('keeps one stable onPendingChange identity across renders', () => {
    // It is a dependency of the guarded edit actions in the editor; a new
    // identity each render would rebuild every handler keyed on them.
    const { result, rerender } = setup(4, 4)
    const first = result.current.onPendingChange

    rerender({ loaded: 5, base: 5, fetching: false })

    expect(result.current.onPendingChange).toBe(first)
  })
})
