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
  /** What one render of the hook is given: the two revisions, and whether the
   *  scene query is refetching. Named, and passed as the INITIAL props, so
   *  `rerender` accepts `fetching` - inferring the props from an initial object
   *  that omitted it made every rerender that set it a type error. */
  interface Props {
    loaded: number | undefined
    base: number | null
    fetching?: boolean
  }

  function setup(
    loadedRevision: number | undefined,
    baseRevision: number | null
  ) {
    return renderHook(
      ({ loaded, base, fetching = false }: Props) =>
        useProjectLinkSerialization({
          loadedRevision: loaded,
          baseRevision: base,
          isFetching: fetching,
        }),
      {
        initialProps: {
          loaded: loadedRevision,
          base: baseRevision,
          fetching: false,
        } as Props,
      }
    )
  }

  it('allows editing when no link is in flight', () => {
    const { result } = setup(4, 4)

    expect(result.current.editsBlocked).toBeNull()
  })

  it('holds editing while the link write is in flight', () => {
    const { result } = setup(4, 4)

    act(() => result.current.onLinkStatusChange('pending'))

    expect(result.current.editsBlocked).toBe(LINK_PENDING_MESSAGE)
  })

  it('keeps holding after the write settles, until the refetch has landed', () => {
    // The gap the first attempt at this left open. The mutation settles when the
    // server answers; the refetch it invalidates lands afterwards, and the draft
    // is reseeded after that. Releasing on isPending alone is the same bug one
    // tick later.
    const { result, rerender } = setup(4, 4)

    act(() => result.current.onLinkStatusChange('pending'))
    // The invalidation is fire-and-forget, so the mutation settles first and the
    // refetch starts after it.
    act(() => result.current.onLinkStatusChange('success'))
    rerender({ loaded: 4, base: 4, fetching: true })

    expect(result.current.editsBlocked).toBe(LINK_PENDING_MESSAGE)

    // The query has the new revision but the draft has not been reseeded yet.
    rerender({ loaded: 5, base: 4, fetching: false })
    expect(result.current.editsBlocked).toBe(LINK_PENDING_MESSAGE)
  })

  it('resumes editing once the draft is seeded on the revision the link produced', () => {
    const { result, rerender } = setup(4, 4)

    act(() => result.current.onLinkStatusChange('pending'))
    act(() => result.current.onLinkStatusChange('success'))
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

    act(() => result.current.onLinkStatusChange('pending'))
    act(() => result.current.onLinkStatusChange('success'))
    rerender({ loaded: undefined, base: null, fetching: false })

    expect(result.current.editsBlocked).toBe(LINK_PENDING_MESSAGE)
  })

  it('re-holds when a second link starts after the first settled', () => {
    const { result, rerender } = setup(4, 4)

    act(() => result.current.onLinkStatusChange('pending'))
    act(() => result.current.onLinkStatusChange('success'))
    rerender({ loaded: 5, base: 5, fetching: false })
    expect(result.current.editsBlocked).toBeNull()

    act(() => result.current.onLinkStatusChange('pending'))
    expect(result.current.editsBlocked).toBe(LINK_PENDING_MESSAGE)
  })

  it('holds while the refetch the link queued is still in flight', () => {
    const { result, rerender } = setup(4, 4)

    act(() => result.current.onLinkStatusChange('pending'))
    act(() => result.current.onLinkStatusChange('success'))
    rerender({ loaded: 4, base: 4, fetching: true })

    // Revisions agree, but only because the new one has not arrived yet.
    expect(result.current.editsBlocked).toBe(LINK_PENDING_MESSAGE)
  })

  // ---- a link that FAILED ---------------------------------------------------
  //
  // The hold waits for a refetch to land. A rejected link invalidates nothing,
  // so no refetch is ever queued and no revision ever moves - and the wait was
  // therefore permanent, leaving the editor read-only until the tab was closed.

  it('releases the hold immediately when the link fails', () => {
    const { result } = setup(4, 4)

    act(() => result.current.onLinkStatusChange('pending'))
    expect(result.current.editsBlocked).toBe(LINK_PENDING_MESSAGE)

    act(() => result.current.onLinkStatusChange('error'))

    // No refetch, no revision movement, and no reason to keep holding.
    expect(result.current.editsBlocked).toBeNull()
  })

  it('releases a failure that arrives long after the write started', () => {
    // A slow rejection - a timeout, a server taking its time to say no. Nothing
    // about the delay changes what a refusal means.
    const { result, rerender } = setup(4, 4)

    act(() => result.current.onLinkStatusChange('pending'))
    rerender({ loaded: 4, base: 4, fetching: false })
    rerender({ loaded: 4, base: 4, fetching: false })
    expect(result.current.editsBlocked).toBe(LINK_PENDING_MESSAGE)

    act(() => result.current.onLinkStatusChange('error'))

    expect(result.current.editsBlocked).toBeNull()
  })

  it('does not re-hold on the renders that follow a failure', () => {
    // The latch is cleared, not merely masked: a later render with unchanged
    // revisions must not find something still waiting.
    const { result, rerender } = setup(4, 4)

    act(() => result.current.onLinkStatusChange('pending'))
    act(() => result.current.onLinkStatusChange('error'))

    rerender({ loaded: 4, base: 4, fetching: false })
    rerender({ loaded: 4, base: 4, fetching: true })
    rerender({ loaded: 4, base: 4, fetching: false })

    expect(result.current.editsBlocked).toBeNull()
  })

  it("holds again for a retry, and releases it on the retry's own outcome", () => {
    const { result, rerender } = setup(4, 4)

    act(() => result.current.onLinkStatusChange('pending'))
    act(() => result.current.onLinkStatusChange('error'))
    expect(result.current.editsBlocked).toBeNull()

    // The user picks again. This one works.
    act(() => result.current.onLinkStatusChange('pending'))
    expect(result.current.editsBlocked).toBe(LINK_PENDING_MESSAGE)

    act(() => result.current.onLinkStatusChange('success'))
    rerender({ loaded: 4, base: 4, fetching: true })
    rerender({ loaded: 5, base: 4, fetching: false })
    // Still held: the draft has not been reseeded on the new revision yet.
    expect(result.current.editsBlocked).toBe(LINK_PENDING_MESSAGE)

    rerender({ loaded: 5, base: 5, fetching: false })
    expect(result.current.editsBlocked).toBeNull()
  })

  it('releases a success that did not move the revision, once its refetch lands', () => {
    // Re-picking the project a scene already has. The server accepts it and the
    // revision stays put, so "the number changed" cannot be the release
    // condition - a completed refetch is.
    const { result, rerender } = setup(4, 4)

    act(() => result.current.onLinkStatusChange('pending'))
    act(() => result.current.onLinkStatusChange('success'))
    rerender({ loaded: 4, base: 4, fetching: true })
    expect(result.current.editsBlocked).toBe(LINK_PENDING_MESSAGE)

    rerender({ loaded: 4, base: 4, fetching: false })

    expect(result.current.editsBlocked).toBeNull()
  })

  it('starts unheld after a remount, whatever the previous instance was waiting for', () => {
    // Closing and reopening the editor is the user's way out of anything stuck.
    // It has to actually be one.
    const first = setup(4, 4)
    act(() => first.result.current.onLinkStatusChange('pending'))
    expect(first.result.current.editsBlocked).toBe(LINK_PENDING_MESSAGE)
    first.unmount()

    const second = setup(4, 4)

    expect(second.result.current.editsBlocked).toBeNull()
  })

  it('keeps one stable onLinkStatusChange identity across renders', () => {
    // It is a dependency of the guarded edit actions in the editor; a new
    // identity each render would rebuild every handler keyed on them.
    const { result, rerender } = setup(4, 4)
    const first = result.current.onLinkStatusChange

    rerender({ loaded: 5, base: 5, fetching: false })

    expect(result.current.onLinkStatusChange).toBe(first)
  })
})
