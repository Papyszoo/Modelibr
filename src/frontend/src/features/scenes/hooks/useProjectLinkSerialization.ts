import { useEffect } from 'react'

import { useSceneLinkHoldStore } from '@/stores'

export interface ProjectLinkSerialization {
  /** Why editing is held, or null when it is not. */
  editsBlocked: string | null
  /**
   * True when the hold is waiting to find out what a write did, rather than
   * waiting for a known revision to arrive. Worth saying out loud - it is the
   * one case where the user is looking at a scene whose state nobody can yet
   * vouch for.
   */
  isReconciling: boolean
}

export const LINK_PENDING_MESSAGE =
  'This scene is being linked to a project. Its revision is moving, so editing is held for a moment - nothing is lost.'

export const LINK_RECONCILING_MESSAGE =
  'The project link did not come back with an answer, so this scene is being re-read from the server. Editing is held until it is known what was saved - nothing is lost.'

/**
 * How long to wait before asking for the scene again after a fetch failed while
 * a hold is open.
 *
 * A hold that waits for authoritative data needs that data to actually arrive.
 * React Query gives up after its own retries, and nothing else would come along
 * to try again until the user switched windows - so the same drop that made the
 * link ambiguous would also leave the editor held indefinitely. This keeps
 * asking, at a pace that is a retry rather than a spin.
 */
export const LINK_RECONCILE_RETRY_MS = 2000

/**
 * Serialises scene editing against the project-link write.
 *
 * <p>
 * Linking is one of the few things the scene editor sends straight to the
 * server, and it moves the scene's revision. The editor's draft is reseeded from
 * a new revision only while it is <b>clean</b> - reseeding a dirty draft would
 * throw away the user's unsaved edits every time React Query refetched in the
 * background. Both halves of that are right on their own and wrong together: an
 * edit made DURING the link leaves the draft dirty at the old revision, the
 * reseed is skipped, and the next save is refused as a conflict over a revision
 * the user never saw and has no way to reconcile.
 * </p>
 *
 * <p>
 * So editing is held for the window, and the window is not the mutation. The
 * mutation settles when the server answers; the refetch it invalidates lands
 * afterwards, and the draft is reseeded after that. Holding only while the
 * mutation is pending reopens the gap in the middle, which is the same bug one
 * tick later.
 * </p>
 *
 * <h4>What this hook is not</h4>
 *
 * <p>
 * It does not own the hold and it does not decide when one starts - the hold
 * lives in <c>sceneLinkHoldStore</c>, keyed by scene, and the link mutation
 * opens and settles it. Three things were wrong while this hook held the state
 * itself in `useState`:
 * </p>
 *
 * <ul>
 * <li><b>The editor unmounts.</b> The dock renders only the active tab, so
 * glancing at another tab unmounts the editor - and took the hold with it. The
 * remount found a component that believed nothing was in flight, over a draft
 * seeded on a revision the server had already replaced.</li>
 * <li><b>A transport failure is not a refusal.</b> The hold was released on any
 * error. A network drop or a timeout means the write's outcome is UNKNOWN, and
 * releasing on one hands the editor back over a scene that may have moved
 * underneath it.</li>
 * <li><b>The server's own revision was thrown away.</b> Release waited for "a
 * refetch to have happened", which a stale or unrelated fetch could satisfy. The
 * mutation reports the revision it produced, and that number is what the draft
 * has to reach.</li>
 * </ul>
 *
 * <p>
 * What is left here is the release decision, which is deliberately made of
 * comparisons against authoritative data and nothing else. No timers, no
 * lifecycle events: a hold ends when the scene query has loaded data that
 * settles the question and the editor's draft is sitting on it. That is also why
 * a persistent hold cannot strand anybody - reopening the scene re-evaluates it
 * against fresh data and it ends immediately if the situation is resolved.
 * </p>
 */
export function useProjectLinkSerialization({
  sceneId,
  loadedRevision,
  baseRevision,
  isFetching,
  isError = false,
  dataUpdatedAt = 0,
  errorUpdatedAt = 0,
  refetch,
}: {
  /** Which scene's hold this is. */
  sceneId: number
  /** The revision the scene query currently reports, or undefined before it loads. */
  loadedRevision: number | undefined
  /** The revision the editor's draft is seeded on, or null before it opens. */
  baseRevision: number | null
  /**
   * Whether the scene query is fetching. A hold never ends mid-flight: the data
   * on screen during a refetch is the data from before it.
   */
  isFetching: boolean
  /**
   * Whether the scene query is currently in error. A failed refetch answers
   * nothing, so the hold stays - this is the case where releasing would resume
   * editing against whatever happened to be in the cache.
   */
  isError?: boolean
  /** When the scene query's data was last successfully fetched. */
  dataUpdatedAt?: number
  /** When the scene query last failed. A new value means a new failure to retry. */
  errorUpdatedAt?: number
  /** Asks for the scene again. Used only to recover a hold from a failed fetch. */
  refetch?: () => void
}): ProjectLinkSerialization {
  const hold = useSceneLinkHoldStore(state => state.holds[sceneId] ?? null)
  const release = useSceneLinkHoldStore(state => state.release)

  // A hold waits for authoritative data, so a fetch that failed has to be tried
  // again or the hold never ends. Keyed on errorUpdatedAt so each fresh failure
  // arms a fresh attempt rather than one timer covering all of them.
  useEffect(() => {
    if (hold === null || hold.phase === 'pending') {
      return
    }
    if (!isError || refetch === undefined) {
      return
    }

    const timer = setTimeout(() => refetch(), LINK_RECONCILE_RETRY_MS)
    return () => clearTimeout(timer)
  }, [hold, isError, errorUpdatedAt, refetch])

  useEffect(() => {
    if (hold === null || hold.phase === 'pending') {
      return
    }

    // Never on data that is being replaced, and never on data that failed to
    // arrive. Both would be reading the cache and calling it the server.
    if (isFetching || isError) {
      return
    }

    // Authoritative data has to exist at all, and the draft has to be seeded on
    // it. `undefined === null` would otherwise read as "they agree".
    if (loadedRevision === undefined || baseRevision === null) {
      return
    }
    if (loadedRevision !== baseRevision) {
      return
    }

    // Data fetched AFTER the write. What was in the cache when the write settled
    // is a consistent, authoritative-looking picture of a scene that no longer
    // exists - and when the link does not move the revision (re-picking the
    // project a scene already has) it is indistinguishable from the answer by
    // every other measure. This is the clause that tells them apart, and it is
    // the same clause for a known outcome and an unknown one.
    if (hold.seenAt !== null && dataUpdatedAt <= hold.seenAt) {
      return
    }

    // Plus, when the server got as far as naming one, the revision it produced.
    // `>=` rather than `===` because something else may have written the scene
    // since, and a later revision has necessarily seen this one.
    if (
      hold.phase === 'awaiting-revision' &&
      hold.targetRevision !== null &&
      loadedRevision < hold.targetRevision
    ) {
      return
    }

    release(sceneId)
  }, [
    hold,
    isFetching,
    isError,
    loadedRevision,
    baseRevision,
    dataUpdatedAt,
    release,
    sceneId,
  ])

  return {
    editsBlocked:
      hold === null
        ? null
        : hold.phase === 'reconciling'
          ? LINK_RECONCILING_MESSAGE
          : LINK_PENDING_MESSAGE,
    isReconciling: hold?.phase === 'reconciling',
  }
}
