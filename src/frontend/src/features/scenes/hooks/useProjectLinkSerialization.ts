import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * The link mutation's state, as React Query reports it. Passed through verbatim
 * rather than reduced to a boolean - "not pending" is two different situations,
 * and telling them apart is the whole of what this hook needs.
 */
export type ProjectLinkStatus = 'idle' | 'pending' | 'success' | 'error'

export interface ProjectLinkSerialization {
  /** Why editing is held, or null when it is not. */
  editsBlocked: string | null
  /** Pass to the control that owns the link mutation. */
  onLinkStatusChange: (status: ProjectLinkStatus) => void
}

export const LINK_PENDING_MESSAGE =
  'This scene is being linked to a project. Its revision is moving, so editing is held for a moment - nothing is lost.'

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
 * afterwards, and the draft is reseeded after that. Holding only while
 * `isPending` reopens the gap in the middle, which is the same bug one tick
 * later - so the hold runs until the draft is actually sitting on the revision
 * the query now reports.
 * </p>
 *
 * <p>
 * Which is correct only for a link that <b>succeeded</b>. A rejected link
 * invalidates nothing, so the revision never moves and no refetch ever lands -
 * and a hold waiting for the reseed of a write that did not happen waits
 * forever, with the editor read-only until the tab is closed. The outcome is
 * therefore reported, not inferred from `isPending` going false: a failure
 * releases the hold immediately, because a write the server refused moved
 * nothing and there is nothing to wait for.
 * </p>
 */
export function useProjectLinkSerialization({
  loadedRevision,
  baseRevision,
  isFetching,
}: {
  /** The revision the scene query currently reports, or undefined before it loads. */
  loadedRevision: number | undefined
  /** The revision the editor's draft is seeded on, or null before it opens. */
  baseRevision: number | null
  /**
   * Whether the scene query is refetching. The link mutation invalidates without
   * awaiting, so it settles BEFORE the new revision arrives - this is what tells
   * the difference between "the refetch has landed" and "it has not started".
   */
  isFetching: boolean
}): ProjectLinkSerialization {
  const [linkStatus, setLinkStatus] = useState<ProjectLinkStatus>('idle')
  const linkPending = linkStatus === 'pending'

  /**
   * What the hold is still waiting for, or null when nothing is.
   *
   * `startedAt` is the revision the draft was on when the link began - the hold
   * is over once the draft has moved off it. `sawFetch` is the escape hatch for
   * a link that legitimately does not move the revision (re-picking the project
   * a scene already has): once a refetch has been seen to start and finish, the
   * new state has arrived whether or not the number changed.
   */
  const [awaiting, setAwaiting] = useState<{
    startedAt: number | null
    sawFetch: boolean
  } | null>(null)

  // Read through a ref so this callback keeps one identity for the life of the
  // editor: it is a dependency of every guarded edit action, and a new identity
  // per revision would rebuild all of them.
  const baseRevisionRef = useRef(baseRevision)
  baseRevisionRef.current = baseRevision

  const onLinkStatusChange = useCallback((status: ProjectLinkStatus) => {
    setLinkStatus(status)

    if (status === 'pending') {
      // Latched here rather than derived: the hold has to outlive the mutation,
      // which settles before the refetch it queued has even started.
      setAwaiting(
        current =>
          current ?? { startedAt: baseRevisionRef.current, sawFetch: false }
      )
      return
    }

    if (status === 'error') {
      // The one outcome that is KNOWN not to have moved anything. Nothing was
      // invalidated, so no refetch is coming and no revision will change -
      // waiting for the reseed would be waiting for an event that cannot
      // happen, and the editor would stay read-only for the rest of the
      // session. The user gets the error and their editor back.
      setAwaiting(null)
    }
  }, [])

  useEffect(() => {
    if (awaiting === null) {
      return
    }

    if (isFetching) {
      if (!awaiting.sawFetch) {
        setAwaiting({ ...awaiting, sawFetch: true })
      }
      return
    }

    if (linkPending) {
      return
    }

    // Settled, not refetching, and the draft is on the revision the query
    // reports. The last clause is what stops the hold releasing in the gap
    // between the mutation settling and its refetch starting - a window in which
    // nothing has changed yet and everything still agrees.
    const reseeded =
      loadedRevision !== undefined && loadedRevision === baseRevision
    const moved = loadedRevision !== awaiting.startedAt

    if (reseeded && (moved || awaiting.sawFetch)) {
      setAwaiting(null)
    }
  }, [linkPending, isFetching, awaiting, loadedRevision, baseRevision])

  return {
    editsBlocked:
      linkPending || awaiting !== null ? LINK_PENDING_MESSAGE : null,
    onLinkStatusChange,
  }
}
