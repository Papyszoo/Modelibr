import { act, renderHook } from '@testing-library/react'

import { useSceneLinkHoldStore } from '@/stores'

import {
  LINK_PENDING_MESSAGE,
  LINK_RECONCILE_RETRY_MS,
  LINK_RECONCILING_MESSAGE,
  useProjectLinkSerialization,
} from '../useProjectLinkSerialization'

/**
 * The stale-revision conflict this closes: linking moves the scene's revision,
 * the editor reseeds its draft from a new revision only while the draft is
 * clean, and an edit made during the link therefore leaves the draft dirty at
 * the OLD revision - so the next save is refused over a revision the user never
 * saw and cannot reconcile.
 *
 * The hold that prevents it lives in a store keyed by scene, opened and settled
 * by the link mutation, because three things went wrong while it was this hook's
 * own `useState`: an unmount threw it away, a dropped connection was treated as
 * a refusal, and the revision the server reported was ignored in favour of "some
 * refetch landed".
 */
describe('project-link serialization', () => {
  const SCENE = 2

  beforeEach(() => {
    useSceneLinkHoldStore.setState({ holds: {} })
  })

  interface Props {
    loaded: number | undefined
    base: number | null
    fetching?: boolean
    errored?: boolean
    updatedAt?: number
    errorAt?: number
    refetch?: () => void
  }

  function setup(
    loadedRevision: number | undefined,
    baseRevision: number | null,
    extra: Partial<Props> = {}
  ) {
    return renderHook(
      ({
        loaded,
        base,
        fetching = false,
        errored = false,
        updatedAt = 0,
        errorAt = 0,
        refetch,
      }: Props) =>
        useProjectLinkSerialization({
          sceneId: SCENE,
          loadedRevision: loaded,
          baseRevision: base,
          isFetching: fetching,
          isError: errored,
          dataUpdatedAt: updatedAt,
          errorUpdatedAt: errorAt,
          refetch,
        }),
      {
        initialProps: {
          loaded: loadedRevision,
          base: baseRevision,
          fetching: false,
          errored: false,
          updatedAt: 0,
          errorAt: 0,
          ...extra,
        } as Props,
      }
    )
  }

  const hold = () => useSceneLinkHoldStore.getState()

  it('allows editing when no link is in flight', () => {
    const { result } = setup(4, 4)

    expect(result.current.editsBlocked).toBeNull()
  })

  it('holds editing while the link write is in flight', () => {
    const { result } = setup(4, 4)

    act(() => hold().begin(SCENE))

    expect(result.current.editsBlocked).toBe(LINK_PENDING_MESSAGE)
  })

  it('keeps holding after the write settles, until the refetch has landed', () => {
    // The gap the first attempt left open. The mutation settles when the server
    // answers; the refetch it invalidates lands afterwards, and the draft is
    // reseeded after that. Releasing on "not pending" is the same bug one tick
    // later.
    const { result, rerender } = setup(4, 4)

    act(() => hold().begin(SCENE))
    act(() => hold().applied(SCENE, 5, 100))
    rerender({ loaded: 4, base: 4, fetching: true, updatedAt: 100 })

    expect(result.current.editsBlocked).toBe(LINK_PENDING_MESSAGE)

    // The query has the new revision but the draft has not been reseeded yet.
    rerender({ loaded: 5, base: 4, fetching: false, updatedAt: 101 })
    expect(result.current.editsBlocked).toBe(LINK_PENDING_MESSAGE)
  })

  it('resumes editing once the draft is seeded on the revision the server reported', () => {
    const { result, rerender } = setup(4, 4)

    act(() => hold().begin(SCENE))
    act(() => hold().applied(SCENE, 5, 100))
    rerender({ loaded: 5, base: 5, fetching: false, updatedAt: 101 })

    expect(result.current.editsBlocked).toBeNull()
    expect(hold().holds[SCENE]).toBeUndefined()
  })

  it('does not resume on a revision that only looks settled because nothing loaded', () => {
    // undefined === null would otherwise read as "they agree".
    const { result, rerender } = setup(undefined, null)

    act(() => hold().begin(SCENE))
    act(() => hold().applied(SCENE, 5, 100))
    rerender({ loaded: undefined, base: null, fetching: false, updatedAt: 101 })

    expect(result.current.editsBlocked).toBe(LINK_PENDING_MESSAGE)
  })

  it('does not resume on data older than the revision the write produced', () => {
    // A refetch that raced the write and answered from before it. Agreeing
    // revisions are not enough when the number they agree on is the OLD one -
    // which is exactly what "wait for a refetch" could not tell apart.
    const { result, rerender } = setup(4, 4)

    act(() => hold().begin(SCENE))
    act(() => hold().applied(SCENE, 5, 100))
    rerender({ loaded: 4, base: 4, fetching: false, updatedAt: 101 })

    expect(result.current.editsBlocked).toBe(LINK_PENDING_MESSAGE)
  })

  it('resumes on a revision past the one the write produced', () => {
    // Something else wrote the scene after the link. A later revision has
    // necessarily seen this one, so insisting on equality would hold forever.
    const { result, rerender } = setup(4, 4)

    act(() => hold().begin(SCENE))
    act(() => hold().applied(SCENE, 5, 100))
    rerender({ loaded: 7, base: 7, fetching: false, updatedAt: 101 })

    expect(result.current.editsBlocked).toBeNull()
  })

  it('releases a success that did not move the revision', () => {
    // Re-picking the project a scene already has. The server accepts it and
    // reports the revision unchanged, so the number is still the answer - it is
    // the server's number, not a guess about whether one arrived.
    const { result, rerender } = setup(4, 4)

    act(() => hold().begin(SCENE))
    act(() => hold().applied(SCENE, 4, 100))

    // Still held on the cache entry from BEFORE the write: same revision, same
    // document, and a stale answer to the question that was asked.
    rerender({ loaded: 4, base: 4, fetching: false, updatedAt: 100 })
    expect(result.current.editsBlocked).toBe(LINK_PENDING_MESSAGE)

    // The re-read lands. Nothing about the revision changed, and it is still the
    // event the hold was waiting for.
    rerender({ loaded: 4, base: 4, fetching: false, updatedAt: 101 })
    expect(result.current.editsBlocked).toBeNull()
  })

  it('holds while the refetch the link queued is still in flight', () => {
    const { result, rerender } = setup(4, 4)

    act(() => hold().begin(SCENE))
    act(() => hold().applied(SCENE, 4, 100))
    rerender({ loaded: 4, base: 4, fetching: true, updatedAt: 101 })

    // Revisions agree, but the data on screen is the data from before the fetch.
    expect(result.current.editsBlocked).toBe(LINK_PENDING_MESSAGE)
  })

  // ---- a refetch that FAILS -------------------------------------------------

  it('keeps holding when the scene refetch fails', () => {
    // The case that used to resume editing against whatever was left in the
    // cache. A failed fetch answers nothing, and the cached revision is from
    // before the write.
    const { result, rerender } = setup(4, 4)

    act(() => hold().begin(SCENE))
    act(() => hold().applied(SCENE, 5, 100))
    rerender({ loaded: 4, base: 4, fetching: false, errored: true, errorAt: 1 })

    expect(result.current.editsBlocked).toBe(LINK_PENDING_MESSAGE)
  })

  it('asks for the scene again after a failed fetch, so the hold can end', () => {
    // A hold that waits for data has to make the data come. React Query gives up
    // after its own retries, and nothing else would try again - the same drop
    // that made the link fail would leave the editor held indefinitely.
    jest.useFakeTimers()
    const refetch = jest.fn()
    try {
      const { rerender } = setup(4, 4, { refetch })

      act(() => hold().begin(SCENE))
      act(() => hold().applied(SCENE, 5, 100))
      rerender({
        loaded: 4,
        base: 4,
        errored: true,
        errorAt: 1,
        refetch,
      })

      expect(refetch).not.toHaveBeenCalled()
      act(() => {
        jest.advanceTimersByTime(LINK_RECONCILE_RETRY_MS)
      })
      expect(refetch).toHaveBeenCalledTimes(1)
    } finally {
      jest.useRealTimers()
    }
  })

  it('releases once a retried fetch finally succeeds', () => {
    const { result, rerender } = setup(4, 4)

    act(() => hold().begin(SCENE))
    act(() => hold().applied(SCENE, 5, 100))
    rerender({ loaded: 4, base: 4, errored: true, errorAt: 1 })
    expect(result.current.editsBlocked).toBe(LINK_PENDING_MESSAGE)

    rerender({ loaded: 5, base: 5, errored: false, updatedAt: 101 })
    expect(result.current.editsBlocked).toBeNull()
  })

  // ---- an AMBIGUOUS failure -------------------------------------------------
  //
  // A transport failure says nothing about whether the write landed. Releasing
  // on it hands the editor back over a scene that may have moved underneath it,
  // and the next save is the conflict this whole mechanism exists to prevent.

  it('holds and reconciles when the write outcome is unknown', () => {
    const { result } = setup(4, 4)

    act(() => hold().begin(SCENE))
    act(() => hold().ambiguous(SCENE, 100))

    expect(result.current.editsBlocked).toBe(LINK_RECONCILING_MESSAGE)
    expect(result.current.isReconciling).toBe(true)
  })

  it('does not accept data fetched before the ambiguous write as an answer', () => {
    // The cache still holds a perfectly consistent scene - from before the write
    // that may or may not have happened. Agreeing revisions prove nothing here.
    const { result, rerender } = setup(4, 4, { updatedAt: 100 })

    act(() => hold().begin(SCENE))
    act(() => hold().ambiguous(SCENE, 100))
    rerender({ loaded: 4, base: 4, updatedAt: 100 })

    expect(result.current.editsBlocked).toBe(LINK_RECONCILING_MESSAGE)
  })

  it('resumes once a fetch made AFTER the ambiguous write has landed', () => {
    const { result, rerender } = setup(4, 4, { updatedAt: 100 })

    act(() => hold().begin(SCENE))
    act(() => hold().ambiguous(SCENE, 100))

    // The re-read arrives. Whatever it says - the write landed and the revision
    // moved, or it did not and nothing changed - it is authoritative, and the
    // draft is seeded on it.
    rerender({ loaded: 5, base: 5, updatedAt: 101 })

    expect(result.current.editsBlocked).toBeNull()
  })

  it('keeps reconciling when the re-read itself fails', () => {
    const { result, rerender } = setup(4, 4, { updatedAt: 100 })

    act(() => hold().begin(SCENE))
    act(() => hold().ambiguous(SCENE, 100))
    rerender({ loaded: 4, base: 4, updatedAt: 100, errored: true, errorAt: 5 })

    expect(result.current.editsBlocked).toBe(LINK_RECONCILING_MESSAGE)
  })

  // ---- a refusal ------------------------------------------------------------

  it('is not holding once a refused link released the hold', () => {
    // A write the server refused moved nothing and queues no refetch, so waiting
    // for one is waiting forever - the editor was read-only until the tab was
    // closed. The mutation releases the hold on a definite refusal; this is the
    // hook agreeing.
    const { result } = setup(4, 4)

    act(() => hold().begin(SCENE))
    expect(result.current.editsBlocked).toBe(LINK_PENDING_MESSAGE)

    act(() => hold().release(SCENE))

    expect(result.current.editsBlocked).toBeNull()
  })

  it('does not re-hold on the renders that follow a release', () => {
    const { result, rerender } = setup(4, 4)

    act(() => hold().begin(SCENE))
    act(() => hold().release(SCENE))

    rerender({ loaded: 4, base: 4, fetching: false })
    rerender({ loaded: 4, base: 4, fetching: true })
    rerender({ loaded: 4, base: 4, fetching: false })

    expect(result.current.editsBlocked).toBeNull()
  })

  // ---- unmount / remount ----------------------------------------------------

  it('is STILL held after a remount while the write is unresolved', () => {
    // The scene editor unmounts whenever the user glances at another tab - the
    // dock renders only the active one. A hold in component state died there,
    // and the remount believed nothing was in flight over a draft seeded on a
    // revision the server had already replaced. This is the assertion that was
    // previously inverted.
    const first = setup(4, 4, { updatedAt: 100 })
    act(() => hold().begin(SCENE))
    act(() => hold().applied(SCENE, 5, 100))
    expect(first.result.current.editsBlocked).toBe(LINK_PENDING_MESSAGE)
    first.unmount()

    const second = setup(4, 4, { updatedAt: 100 })

    expect(second.result.current.editsBlocked).toBe(LINK_PENDING_MESSAGE)
  })

  it('ends a hold on remount as soon as the reopened scene agrees', () => {
    // And it cannot strand anybody: nothing here waits on a timer or a lifecycle
    // event, so a remount that loads data satisfying the release condition
    // releases immediately.
    const first = setup(4, 4, { updatedAt: 100 })
    act(() => hold().begin(SCENE))
    act(() => hold().applied(SCENE, 5, 100))
    first.unmount()

    const second = setup(5, 5, { updatedAt: 101 })

    expect(second.result.current.editsBlocked).toBeNull()
  })

  it('keeps holds for different scenes apart', () => {
    // The hold is the SCENE's, so linking one scene must not freeze another.
    const { result } = setup(4, 4)

    act(() => hold().begin(99))

    expect(result.current.editsBlocked).toBeNull()
  })
})
