import { create } from 'zustand'

/**
 * Which direct scene write a hold belongs to.
 *
 * Only used to word the message. The rule is the same for both: the write moves
 * the scene's revision, and the editor's draft must not move underneath it.
 */
export type SceneWriteKind = 'link' | 'slot'

/**
 * What a scene's write hold is still waiting for.
 *
 * - `pending` - the write is in flight. Nothing is known.
 * - `awaiting-revision` - the server answered and told us which revision it
 *   produced. The hold ends when authoritative scene data at or past that
 *   revision has loaded AND the editor's draft is seeded on it.
 * - `reconciling` - the write's outcome is UNKNOWN (a transport failure), so the
 *   only way out is to go and look. The hold ends when a fresh, successful scene
 *   fetch has landed and the draft is seeded on whatever it says.
 */
export type SceneLinkHoldPhase = 'pending' | 'awaiting-revision' | 'reconciling'

export interface SceneLinkHold {
  phase: SceneLinkHoldPhase
  /** Which write opened it - see {@link SceneWriteKind}. */
  kind: SceneWriteKind
  /** The revision the server reported, when it got as far as reporting one. */
  targetRevision: number | null
  /**
   * The scene query's `dataUpdatedAt` at the moment the write's outcome was
   * recorded. Only a LATER value is data fetched after the write, and only such
   * data can speak for it - a cache entry from before the write is consistent,
   * authoritative-looking, and about a scene that no longer exists.
   *
   * Compared against in both settled phases rather than a "did a refetch happen"
   * flag: a flag has to be observed by a mounted component, and this survives the
   * editor being closed and reopened.
   */
  seenAt: number | null
}

interface SceneLinkHoldState {
  /** Live holds, by scene id. A scene with no entry is not held. */
  holds: Record<number, SceneLinkHold>

  /**
   * Opens a hold for a write that is about to be sent, and answers whether it
   * may be sent at all.
   *
   * <p>
   * Returns false - and changes nothing - when this scene already has an
   * unresolved hold. That refusal is the point: a second write started while the
   * first one's outcome is unknown would replace the record of the unknown thing
   * with a record of the new one, and the reconciliation the first hold was
   * waiting for would never happen. It is also what stops a "Retry" button from
   * resending a write whose first attempt may already have committed.
   * </p>
   */
  tryBegin: (sceneId: number, kind: SceneWriteKind) => boolean
  /**
   * The server answered and named the revision it produced. `seenAt` is the
   * scene query's current `dataUpdatedAt`, so the release condition can insist
   * on data fetched after this point.
   */
  applied: (sceneId: number, revision: number, seenAt: number) => void
  /**
   * The server's answer never arrived, or arrived in a form that cannot say
   * whether the write landed - so there is no revision to wait for, only a
   * re-read to wait on.
   */
  ambiguous: (sceneId: number, seenAt: number) => void
  /** The server refused it. Nothing was written, so there is nothing to wait for. */
  release: (sceneId: number) => void
}

/**
 * The scene serialization hold, per scene.
 *
 * <p>
 * A handful of things the scene editor offers go straight to the server rather
 * than into the draft - linking the scene to a project, choosing a slot's
 * candidate, rejecting candidates, accepting the recommendations - and every one
 * of them MOVES THE SCENE'S REVISION. The editor's draft is reseeded from a new
 * revision only while it is clean, so an edit made during one of those writes
 * leaves the draft dirty at the old revision, the reseed is skipped, and the
 * next save is refused as a conflict over a revision the user never saw.
 * Editing is therefore held for the window - and the window is not the mutation:
 * it runs until authoritative scene data has arrived and the draft is sitting on
 * it.
 * </p>
 *
 * <p>
 * <b>Why every direct write and not only the link.</b> This started as the
 * project link's hold, because that is where the conflict was first seen. The
 * slot writes have exactly the same shape and were covered only by
 * `isPending` - which goes false when the RESPONSE arrives, a refetch and a
 * reseed before the draft is actually on the new revision. In that gap the draft
 * could be dirtied at revision N while the server was already at N+1, which is
 * the unsaveable state the whole mechanism exists to prevent, and a second slot
 * write could start carrying the stale number.
 * </p>
 *
 * <p>
 * <b>Why a store and not component state.</b> The first version of this lived in
 * a hook's `useState`, and unmounting the editor threw the hold away. The scene
 * editor unmounts constantly - the dock renders only the active tab, so glancing
 * at another tab is an unmount - and coming back mid-write found an editor that
 * believed nothing was happening, over a draft seeded on a revision the server
 * had already replaced. The hold belongs to the SCENE, not to whichever component
 * happens to be mounted, and it has to outlive the mutation that started it.
 * </p>
 *
 * <p>
 * <b>Why it cannot get stuck.</b> Nothing here releases on a timer or on a
 * component lifecycle event; every release condition is a comparison against
 * authoritative server data (see `useProjectLinkSerialization`). A hold whose
 * scene is closed and reopened is re-evaluated against freshly loaded data and
 * ends the moment that data agrees - so "persistent" costs the user nothing once
 * the situation is actually resolved.
 * </p>
 *
 * <p>
 * UI state, so Zustand: it is not a server resource, it is what this browser is
 * currently refusing to do and why.
 * </p>
 */
export const useSceneLinkHoldStore = create<SceneLinkHoldState>((set, get) => ({
  holds: {},

  tryBegin: (sceneId, kind) => {
    if (get().holds[sceneId] !== undefined) {
      return false
    }

    set(state => ({
      holds: {
        ...state.holds,
        [sceneId]: {
          phase: 'pending',
          kind,
          targetRevision: null,
          seenAt: null,
        },
      },
    }))
    return true
  },

  applied: (sceneId, revision, seenAt) =>
    set(state => {
      const current = state.holds[sceneId]
      if (current === undefined) {
        return state
      }

      return {
        holds: {
          ...state.holds,
          [sceneId]: {
            ...current,
            phase: 'awaiting-revision',
            targetRevision: revision,
            seenAt,
          },
        },
      }
    }),

  ambiguous: (sceneId, seenAt) =>
    set(state => {
      const current = state.holds[sceneId]
      if (current === undefined) {
        return state
      }

      return {
        holds: {
          ...state.holds,
          [sceneId]: {
            ...current,
            phase: 'reconciling',
            // Deliberately kept if a revision was somehow already known: a
            // reconciliation that can also check a number is strictly better off
            // for having it.
            targetRevision: current.targetRevision,
            seenAt,
          },
        },
      }
    }),

  release: sceneId =>
    set(state => {
      if (!(sceneId in state.holds)) {
        return state
      }
      const holds = { ...state.holds }
      delete holds[sceneId]
      return { holds }
    }),
}))

/** Reads the hold for one scene, or null. For use outside React. */
export function getSceneLinkHold(sceneId: number): SceneLinkHold | null {
  return useSceneLinkHoldStore.getState().holds[sceneId] ?? null
}

/**
 * True when this scene has an unresolved write hold, so nothing may be sent for
 * it. For callers outside the editor - scene creation's project link, notably -
 * that need to ask before offering a retry.
 */
export function isSceneWriteHeld(sceneId: number): boolean {
  return getSceneLinkHold(sceneId) !== null
}
