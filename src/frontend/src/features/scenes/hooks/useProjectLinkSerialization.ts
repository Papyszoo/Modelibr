import { useCallback, useEffect, useRef, useState } from 'react'

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
 */
export interface ProjectLinkSerialization {
  /** Why editing is held, or null when it is not. */
  editsBlocked: string | null
  /** Pass to the control that owns the link mutation. */
  onPendingChange: (pending: boolean) => void
}

export const LINK_PENDING_MESSAGE =
  'This scene is being linked to a project. Its revision is moving, so editing is held for a moment - nothing is lost.'

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
  const [linkPending, setLinkPending] = useState(false)

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

  const onPendingChange = useCallback((pending: boolean) => {
    setLinkPending(pending)
    if (pending) {
      // Latched here rather than derived: the hold has to outlive the mutation,
      // which settles before the refetch it queued has even started.
      setAwaiting(
        current =>
          current ?? { startedAt: baseRevisionRef.current, sawFetch: false }
      )
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
    onPendingChange,
  }
}
