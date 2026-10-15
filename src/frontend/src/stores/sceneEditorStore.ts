import { create } from 'zustand'

import type {
  SceneDocument,
  SceneLight,
  SceneNode,
  SceneTransform,
} from '@/features/scenes/types'

/**
 * The scene editor's working document, with undo/redo.
 *
 * UI state, so Zustand rather than React Query: the document being edited is a
 * draft that diverges from the server copy until it is saved. The feature this
 * replaces held its scene in thirteen `useState` calls, which is why it had no
 * undo - an agent making twenty placements needs one, and so does a user who
 * dragged the wrong node.
 *
 * History is whole documents rather than inverse operations. A scene document
 * is small (it holds references, not geometry), and storing snapshots means
 * undo cannot drift from the edits it is meant to reverse - the failure mode of
 * an operation-based stack, where one missing inverse corrupts everything after
 * it.
 *
 * Every mutator is scene-scoped. The flat fields below are a projection of one
 * scene, kept for backwards compatibility and the tab that most recently became
 * active, but the flat projection is NOT how an editor reads its own scene: two
 * scene tabs rendered side by side (split view) each subscribe to
 * `drafts[sceneId]` and pass their id to every write, so neither can paint or
 * edit the other's draft.
 */

/** How many steps back the editor can go. Beyond this the oldest entries are dropped. */
export const SCENE_HISTORY_LIMIT = 100

/**
 * The candidate a viewport is previewing instead of what the slot's node wears.
 * View state, never a write: looking at four options must not move the scene's
 * revision four times.
 */
export interface SceneSlotPreview {
  slotId: string
  candidateId: string
  ref: string
}

/**
 * One scene's working state. Kept per scene so that two open scene tabs cannot
 * discard or paint over each other: the flat fields on the store are a
 * projection of the ACTIVE tab, and `drafts` is what every tab is restored from
 * and rendered from.
 *
 * The editor-only state is in here too, and that is the point of it. Error
 * banners, the candidate preview, the blockout override and the per-node
 * resource failures were all component `useState`, which the dock unmounts on
 * every tab switch: leaving to look at another scene and coming back used to
 * clear the error you were reading and drop the view you had chosen.
 */
interface SceneDraft {
  sceneId: number | null
  baseRevision: number | null
  document: SceneDocument | null
  past: SceneDocument[]
  future: SceneDocument[]
  isDirty: boolean
  selectedNodeId: string | null
  /**
   * The light the inspector is editing, or null. Node and light selection are
   * exclusive: the inspector has one body, and showing a light's fields while a
   * node sits selected would claim the edits land on the wrong thing.
   */
  selectedLightId: string | null
  saveError: string | null
  placeError: string | null
  slotError: string | null
  preview: SceneSlotPreview | null
  isPlacing: boolean
  failedNodes: Map<string, string>
  blockoutOverride: boolean | null
}

const EMPTY_DRAFT: SceneDraft = {
  sceneId: null,
  baseRevision: null,
  document: null,
  past: [],
  future: [],
  isDirty: false,
  selectedNodeId: null,
  selectedLightId: null,
  saveError: null,
  placeError: null,
  slotError: null,
  preview: null,
  isPlacing: false,
  failedNodes: new Map(),
  blockoutOverride: null,
}

interface SceneEditorState {
  /**
   * Which scene the Scenes tab most recently opened, independent of whether its
   * draft has loaded yet. The flat fields below mirror that scene.
   */
  openSceneId: number | null
  /**
   * Per-scene drafts, keyed by scene id. The flat fields below are a projection
   * of the active scene's entry; every editor reads its OWN entry instead.
   */
  drafts: Record<number, SceneDraft>
  /** The scene whose draft the flat fields mirror, or null when none is seeded. */
  sceneId: number | null
  /** The revision this draft was based on - what a save sends as its expected revision. */
  baseRevision: number | null
  document: SceneDocument | null
  past: SceneDocument[]
  future: SceneDocument[]
  /** True when the draft differs from what was last loaded or saved. */
  isDirty: boolean
  selectedNodeId: string | null
  /** See `SceneDraft.selectedLightId`. */
  selectedLightId: string | null
  /** The last save failure for this scene, kept so a tab switch does not hide it. */
  saveError: string | null
  /** The last placement failure, same reason. */
  placeError: string | null
  /** The last slot-resolution failure, same reason. */
  slotError: string | null
  /** The candidate the viewport is previewing instead of the slot's own node. */
  preview: SceneSlotPreview | null
  /** True while a placement gesture is in flight. */
  isPlacing: boolean
  /** Per-node resource failures, by node id. */
  failedNodes: Map<string, string>
  /**
   * The user's blockout/dressed choice, or null to follow the scene's stage.
   * Per scene: the same override means opposite things in two scenes.
   */
  blockoutOverride: boolean | null

  /**
   * Points the flat projection at a scene's stored draft. The editor does not
   * need this to render anymore; it stays for callers/tests that read the flat
   * fields and for the active-tab notion.
   */
  openScene: (sceneId: number) => void
  /** Seeds the draft for one scene once its document has been fetched. */
  open: (sceneId: number, document: SceneDocument, revision: number) => void
  /** Forgets one scene's session (default: the active one). */
  close: (sceneId?: number) => void
  /**
   * Forgets a scene's state without touching whichever scene is on screen.
   *
   * Called when the last tab for that scene closes, and only then: a session map
   * that only ever grows is a memory leak that outlives the tabs it was opened
   * for, and a draft for a scene with no tab is a draft nobody can save.
   */
  discardDraft: (sceneId: number) => void
  setSaveError: (message: string | null, sceneId?: number) => void
  setPlaceError: (message: string | null, sceneId?: number) => void
  setSlotError: (message: string | null, sceneId?: number) => void
  setPreview: (preview: SceneSlotPreview | null, sceneId?: number) => void
  setIsPlacing: (isPlacing: boolean, sceneId?: number) => void
  setBlockoutOverride: (override: boolean | null, sceneId?: number) => void
  /**
   * Records a resource failure for one node.
   *
   * The message is compared first so an unchanged failure does not produce a new
   * Map, and therefore a new render, on every frame the viewport reports it.
   */
  recordNodeFailure: (nodeId: string, message: string, sceneId?: number) => void
  /** Clears one node's failure - the resource loaded, or the user retried. */
  clearNodeFailure: (nodeId: string, sceneId?: number) => void
  /** How many sessions are being held. The release test asserts this does not grow. */
  sessionCount: () => number
  /**
   * Records that `savedDocument` was stored as `revision`.
   *
   * The saved document is passed in, not assumed to be the current one: a save
   * sends a snapshot, and edits made while that request was in flight were
   * never part of it. Clearing the dirty flag unconditionally marked those
   * edits saved when nothing had sent them - the Save button went to "Saved"
   * and the changes existed only in the browser.
   */
  markSaved: (
    revision: number,
    savedDocument: SceneDocument,
    sceneId?: number
  ) => void

  /** Applies an edit and pushes the previous document onto the undo stack. */
  edit: (
    mutate: (document: SceneDocument) => SceneDocument,
    sceneId?: number
  ) => void
  undo: (sceneId?: number) => void
  redo: (sceneId?: number) => void
  canUndo: (sceneId?: number) => boolean
  canRedo: (sceneId?: number) => boolean

  selectNode: (nodeId: string | null, sceneId?: number) => void
  /** Selects the light the inspector edits. Selecting one clears the node selection. */
  selectLight: (lightId: string | null, sceneId?: number) => void

  addNode: (node: SceneNode, sceneId?: number) => void
  updateNode: (
    nodeId: string,
    patch: Partial<SceneNode>,
    sceneId?: number
  ) => void
  setNodeTransform: (
    nodeId: string,
    transform: SceneTransform,
    sceneId?: number
  ) => void
  removeNode: (nodeId: string, sceneId?: number) => void
  setLight: (light: SceneLight, sceneId?: number) => void
  removeLight: (lightId: string, sceneId?: number) => void
}

/** The flat fields, as a draft. The active scene's projection. */
function flatDraft(state: SceneEditorState): SceneDraft {
  return {
    sceneId: state.sceneId,
    baseRevision: state.baseRevision,
    document: state.document,
    past: state.past,
    future: state.future,
    isDirty: state.isDirty,
    selectedNodeId: state.selectedNodeId,
    selectedLightId: state.selectedLightId,
    saveError: state.saveError,
    placeError: state.placeError,
    slotError: state.slotError,
    preview: state.preview,
    isPlacing: state.isPlacing,
    failedNodes: state.failedNodes,
    blockoutOverride: state.blockoutOverride,
  }
}

/** One scene's draft: its stored entry, the flat projection, or nothing. */
function draftFor(state: SceneEditorState, sceneId: number | null): SceneDraft {
  if (sceneId === null) return EMPTY_DRAFT
  return (
    state.drafts[sceneId] ??
    (state.sceneId === sceneId ? flatDraft(state) : EMPTY_DRAFT)
  )
}

/**
 * Merges a change into one scene's draft. The flat fields are updated only when
 * the target IS the active projection, so writing a background tab cannot move
 * what the active tab shows.
 */
function patchDraft(
  state: SceneEditorState,
  patch: Partial<SceneDraft>,
  sceneId?: number
): Partial<SceneEditorState> {
  const target = sceneId ?? state.sceneId
  if (target === null) {
    return { ...patch }
  }
  const merged: SceneDraft = { ...draftFor(state, target), ...patch }
  const drafts = { ...state.drafts, [target]: merged }
  return state.sceneId === target ? { ...patch, drafts } : { drafts }
}

export const useSceneEditorStore = create<SceneEditorState>((set, get) => ({
  openSceneId: null,
  drafts: {},
  sceneId: null,
  baseRevision: null,
  document: null,
  past: [],
  future: [],
  isDirty: false,
  selectedNodeId: null,
  selectedLightId: null,
  saveError: null,
  placeError: null,
  slotError: null,
  preview: null,
  isPlacing: false,
  failedNodes: new Map(),
  blockoutOverride: null,

  openScene: sceneId =>
    set(state => {
      if (state.sceneId === sceneId) {
        return { openSceneId: sceneId }
      }

      // Restore this scene's own draft when it has one. The previous behaviour
      // reset every field, which is correct only while a single scene can be
      // open - with one tab per scene it silently threw away unsaved edits
      // whenever the user looked at another scene.
      const draft = state.drafts[sceneId]
      return draft
        ? { openSceneId: sceneId, ...draft }
        : { openSceneId: sceneId, ...EMPTY_DRAFT }
    }),

  open: (sceneId, document, revision) =>
    set(state => {
      const draft: SceneDraft = {
        sceneId,
        document,
        baseRevision: revision,
        past: [],
        future: [],
        isDirty: false,
        selectedNodeId: null,
        selectedLightId: null,
        // A seed is the start of a scene's session, not a continuation of
        // whatever the last one was showing. Without this, scene 1's save error
        // and node failures were still on screen after opening scene 2 - the
        // editor reported a failure for a scene the user was not looking at.
        saveError: null,
        placeError: null,
        slotError: null,
        preview: null,
        isPlacing: false,
        failedNodes: new Map(),
        blockoutOverride: null,
      }
      return {
        openSceneId: sceneId,
        ...draft,
        drafts: { ...state.drafts, [sceneId]: draft },
      }
    }),

  close: sceneId =>
    set(state => {
      const target = sceneId ?? state.sceneId
      const drafts = { ...state.drafts }
      // The Back button is the one gesture that means "forget this draft", so it
      // also drops the stored copy - otherwise reopening the scene would restore
      // edits the user explicitly walked away from.
      if (target !== null) {
        delete drafts[target]
      }
      return state.sceneId === target
        ? { openSceneId: null, ...EMPTY_DRAFT, drafts }
        : { drafts }
    }),

  discardDraft: sceneId =>
    set(state => {
      if (!(sceneId in state.drafts)) return state
      const drafts = { ...state.drafts }
      delete drafts[sceneId]
      // When the discarded scene IS the flat projection, reset it too. Leaving
      // it pointed at the deleted draft meant `openScene` early-returned for the
      // same id and the editor showed the edits the user just abandoned - a
      // reopen that resurrected a discarded draft.
      return state.sceneId === sceneId ? { ...EMPTY_DRAFT, drafts } : { drafts }
    }),

  // The editor-only state. Each one is a setter rather than a setState-shaped
  // updater so the call sites cannot write fields the projection does not carry.
  setSaveError: (message, sceneId) =>
    set(state => patchDraft(state, { saveError: message }, sceneId)),

  setPlaceError: (message, sceneId) =>
    set(state => patchDraft(state, { placeError: message }, sceneId)),

  setSlotError: (message, sceneId) =>
    set(state => patchDraft(state, { slotError: message }, sceneId)),

  setPreview: (preview, sceneId) =>
    set(state => patchDraft(state, { preview }, sceneId)),

  setIsPlacing: (isPlacing, sceneId) =>
    set(state => patchDraft(state, { isPlacing }, sceneId)),

  setBlockoutOverride: (override, sceneId) =>
    set(state => patchDraft(state, { blockoutOverride: override }, sceneId)),

  recordNodeFailure: (nodeId, message, sceneId) =>
    set(state => {
      const target = sceneId ?? state.sceneId
      if (draftFor(state, target).failedNodes.get(nodeId) === message) {
        return state
      }
      const failedNodes = new Map(draftFor(state, target).failedNodes)
      failedNodes.set(nodeId, message)
      return patchDraft(state, { failedNodes }, target)
    }),

  clearNodeFailure: (nodeId, sceneId) =>
    set(state => {
      const target = sceneId ?? state.sceneId
      if (!draftFor(state, target).failedNodes.has(nodeId)) {
        return state
      }
      const failedNodes = new Map(draftFor(state, target).failedNodes)
      failedNodes.delete(nodeId)
      return patchDraft(state, { failedNodes }, target)
    }),

  sessionCount: () => Object.keys(get().drafts).length,

  markSaved: (revision, savedDocument, sceneId) =>
    set(state => {
      const target = sceneId ?? state.sceneId
      return patchDraft(
        state,
        {
          // The server now holds `revision`, so that is what the next save must
          // base itself on either way.
          baseRevision: revision,
          // Still dirty when the draft moved on while the request was in flight -
          // those edits were never sent, and the next save is what sends them.
          isDirty: draftFor(state, target).document !== savedDocument,
        },
        target
      )
    }),

  edit: (mutate, sceneId) => {
    const state = get()
    const target = sceneId ?? state.sceneId
    const draft = draftFor(state, target)
    if (target === null || !draft.document) {
      return
    }

    const next = mutate(draft.document)
    if (next === draft.document) {
      return
    }

    set(current =>
      patchDraft(
        current,
        {
          document: next,
          // Trimmed from the front: the limit exists to bound memory, and the
          // steps a user is most likely to want back are the recent ones.
          past: [...draft.past, draft.document].slice(-SCENE_HISTORY_LIMIT),
          // Any new edit invalidates the redo branch, exactly like every other
          // editor - redoing onto a document that has since changed would apply a
          // future that never followed from this present.
          future: [],
          isDirty: true,
        },
        target
      )
    )
  },

  undo: sceneId => {
    const state = get()
    const target = sceneId ?? state.sceneId
    const { past, future, document } = draftFor(state, target)
    const previous = past[past.length - 1]
    if (target === null || !previous || !document) {
      return
    }

    set(current =>
      patchDraft(
        current,
        {
          document: previous,
          past: past.slice(0, -1),
          future: [document, ...future],
          isDirty: true,
        },
        target
      )
    )
  },

  redo: sceneId => {
    const state = get()
    const target = sceneId ?? state.sceneId
    const { past, future, document } = draftFor(state, target)
    const next = future[0]
    if (target === null || !next || !document) {
      return
    }

    set(current =>
      patchDraft(
        current,
        {
          document: next,
          past: [...past, document],
          future: future.slice(1),
          isDirty: true,
        },
        target
      )
    )
  },

  canUndo: sceneId => draftFor(get(), sceneId ?? get().sceneId).past.length > 0,
  canRedo: sceneId =>
    draftFor(get(), sceneId ?? get().sceneId).future.length > 0,

  selectNode: (nodeId, sceneId) =>
    set(state => patchDraft(state, { selectedNodeId: nodeId }, sceneId)),

  selectLight: (lightId, sceneId) =>
    set(state => patchDraft(state, { selectedLightId: lightId }, sceneId)),

  addNode: (node, sceneId) =>
    get().edit(
      document => ({ ...document, nodes: [...document.nodes, node] }),
      sceneId
    ),

  updateNode: (nodeId, patch, sceneId) =>
    get().edit(
      document => ({
        ...document,
        nodes: document.nodes.map(node =>
          node.id === nodeId ? { ...node, ...patch } : node
        ),
      }),
      sceneId
    ),

  setNodeTransform: (nodeId, transform, sceneId) =>
    get().edit(
      document => ({
        ...document,
        nodes: document.nodes.map(node =>
          node.id === nodeId ? { ...node, transform } : node
        ),
      }),
      sceneId
    ),

  removeNode: (nodeId, sceneId) => {
    const target = sceneId ?? get().sceneId
    get().edit(document => {
      const removed = document.nodes.find(node => node.id === nodeId)
      // A slot goes with the node it decides. Left behind it would name a node
      // that is not there, and the server would reject the whole save - for a
      // node the user has already deleted, which is the same trap the dangling
      // anchor below is fixing.
      const slots = removed?.slotId
        ? document.slots?.filter(slot => slot.id !== removed.slotId)
        : document.slots

      return {
        ...document,
        nodes: document.nodes
          .filter(node => node.id !== nodeId)
          // Nodes resting on the deleted one are released rather than deleted
          // with it, and stay exactly where they are. Leaving the anchor
          // pointing at a node that is gone would have the server reject the
          // whole save with an error about a node the user has already deleted.
          .map(node =>
            node.anchor?.onNodeId === nodeId ? { ...node, anchor: null } : node
          ),
        slots: slots?.length ? slots : undefined,
      }
    }, target)

    if (draftFor(get(), target).selectedNodeId === nodeId) {
      set(state => patchDraft(state, { selectedNodeId: null }, target))
    }
  },

  setLight: (light, sceneId) =>
    get().edit(document => {
      const index = document.lights.findIndex(l => l.id === light.id)
      const lights =
        index >= 0
          ? document.lights.map(l => (l.id === light.id ? light : l))
          : [...document.lights, light]

      return { ...document, lights }
    }, sceneId),

  removeLight: (lightId, sceneId) => {
    const target = sceneId ?? get().sceneId
    get().edit(
      document => ({
        ...document,
        lights: document.lights.filter(light => light.id !== lightId),
      }),
      sceneId
    )

    if (draftFor(get(), target).selectedLightId === lightId) {
      set(state => patchDraft(state, { selectedLightId: null }, target))
    }
  },
}))
