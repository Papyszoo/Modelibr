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
 */

/** How many steps back the editor can go. Beyond this the oldest entries are dropped. */
export const SCENE_HISTORY_LIMIT = 100

/**
 * One scene's working state. Kept per scene so that switching between two open
 * scene tabs cannot discard an unsaved draft: the flat fields below are a
 * projection of whichever draft the ACTIVE tab is showing, and `drafts` is what
 * they are restored from. Without this, opening a second scene threw away the
 * first scene's unsaved work - the exact loss the `openSceneId` field was added
 * to prevent.
 */
interface SceneDraft {
  sceneId: number | null
  baseRevision: number | null
  document: SceneDocument | null
  past: SceneDocument[]
  future: SceneDocument[]
  isDirty: boolean
  selectedNodeId: string | null
}

const EMPTY_DRAFT: SceneDraft = {
  sceneId: null,
  baseRevision: null,
  document: null,
  past: [],
  future: [],
  isDirty: false,
  selectedNodeId: null,
}

/**
 * Merges a change to the flat fields into the draft of whichever scene is
 * active, so the two can never drift. Every mutator goes through this.
 */
function patchDraft(
  state: SceneEditorState,
  patch: Partial<SceneDraft>
): Partial<SceneEditorState> {
  const current: SceneDraft = {
    sceneId: state.sceneId,
    baseRevision: state.baseRevision,
    document: state.document,
    past: state.past,
    future: state.future,
    isDirty: state.isDirty,
    selectedNodeId: state.selectedNodeId,
  }
  const merged: SceneDraft = { ...current, ...patch }
  return {
    ...patch,
    ...(merged.sceneId !== null
      ? { drafts: { ...state.drafts, [merged.sceneId]: merged } }
      : {}),
  }
}

interface SceneEditorState {
  /**
   * Which scene the Scenes tab has open, independent of whether its draft has
   * loaded yet.
   *
   * Lives here rather than in the tab component because the dock renders only
   * the ACTIVE tab - switching to another tab unmounts this one. Held in
   * `useState`, the open scene was forgotten on every tab switch, and the
   * editor's unmount cleanup then threw away the unsaved draft with it: a user
   * who glanced at another tab came back to the scene list with their edits
   * gone.
   */
  openSceneId: number | null
  /**
   * Per-scene drafts, keyed by scene id. The flat fields below are a projection
   * of the active scene's entry, so a second scene tab cannot discard the first
   * one's unsaved work.
   */
  drafts: Record<number, SceneDraft>
  /** The scene whose draft is loaded, or null when nothing has been seeded. */
  sceneId: number | null
  /** The revision this draft was based on - what a save sends as its expected revision. */
  baseRevision: number | null
  document: SceneDocument | null
  past: SceneDocument[]
  future: SceneDocument[]
  /** True when the draft differs from what was last loaded or saved. */
  isDirty: boolean
  selectedNodeId: string | null

  /** Opens a scene in the editor, restoring any draft it already has. */
  openScene: (sceneId: number) => void
  /** Seeds the draft for the open scene once its document has been fetched. */
  open: (sceneId: number, document: SceneDocument, revision: number) => void
  close: () => void
  /**
   * Forgets a scene's draft without touching whichever scene is on screen - used
   * when a scene tab is closed. Closing a tab is as explicit as pressing Back.
   */
  discardDraft: (sceneId: number) => void
  /**
   * Records that `savedDocument` was stored as `revision`.
   *
   * The saved document is passed in, not assumed to be the current one: a save
   * sends a snapshot, and edits made while that request was in flight were
   * never part of it. Clearing the dirty flag unconditionally marked those
   * edits saved when nothing had sent them - the Save button went to "Saved"
   * and the changes existed only in the browser.
   */
  markSaved: (revision: number, savedDocument: SceneDocument) => void

  /** Applies an edit and pushes the previous document onto the undo stack. */
  edit: (mutate: (document: SceneDocument) => SceneDocument) => void
  undo: () => void
  redo: () => void
  canUndo: () => boolean
  canRedo: () => boolean

  selectNode: (nodeId: string | null) => void

  addNode: (node: SceneNode) => void
  updateNode: (nodeId: string, patch: Partial<SceneNode>) => void
  setNodeTransform: (nodeId: string, transform: SceneTransform) => void
  removeNode: (nodeId: string) => void
  setLight: (light: SceneLight) => void
  removeLight: (lightId: string) => void
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
    set(state => ({
      openSceneId: sceneId,
      ...patchDraft(state, {
        sceneId,
        document,
        baseRevision: revision,
        past: [],
        future: [],
        isDirty: false,
        selectedNodeId: null,
      }),
    })),

  close: () =>
    set(state => {
      const drafts = { ...state.drafts }
      // The Back button is the one gesture that means "forget this draft", so it
      // also drops the stored copy - otherwise reopening the scene would restore
      // edits the user explicitly walked away from.
      if (state.sceneId !== null) {
        delete drafts[state.sceneId]
      }
      return { openSceneId: null, ...EMPTY_DRAFT, drafts }
    }),

  discardDraft: sceneId =>
    set(state => {
      if (!(sceneId in state.drafts)) return state
      const drafts = { ...state.drafts }
      delete drafts[sceneId]
      return { drafts }
    }),

  markSaved: (revision, savedDocument) =>
    set(state =>
      patchDraft(state, {
        // The server now holds `revision`, so that is what the next save must
        // base itself on either way.
        baseRevision: revision,
        // Still dirty when the draft moved on while the request was in flight -
        // those edits were never sent, and the next save is what sends them.
        isDirty: state.document !== savedDocument,
      })
    ),

  edit: mutate => {
    const { document, past } = get()
    if (!document) {
      return
    }

    const next = mutate(document)
    if (next === document) {
      return
    }

    set(state =>
      patchDraft(state, {
        document: next,
        // Trimmed from the front: the limit exists to bound memory, and the
        // steps a user is most likely to want back are the recent ones.
        past: [...past, document].slice(-SCENE_HISTORY_LIMIT),
        // Any new edit invalidates the redo branch, exactly like every other
        // editor - redoing onto a document that has since changed would apply a
        // future that never followed from this present.
        future: [],
        isDirty: true,
      })
    )
  },

  undo: () => {
    const { past, future, document } = get()
    const previous = past[past.length - 1]
    if (!previous || !document) {
      return
    }

    set(state =>
      patchDraft(state, {
        document: previous,
        past: past.slice(0, -1),
        future: [document, ...future],
        isDirty: true,
      })
    )
  },

  redo: () => {
    const { past, future, document } = get()
    const next = future[0]
    if (!next || !document) {
      return
    }

    set(state =>
      patchDraft(state, {
        document: next,
        past: [...past, document],
        future: future.slice(1),
        isDirty: true,
      })
    )
  },

  canUndo: () => get().past.length > 0,
  canRedo: () => get().future.length > 0,

  selectNode: nodeId =>
    set(state => patchDraft(state, { selectedNodeId: nodeId })),

  addNode: node =>
    get().edit(document => ({ ...document, nodes: [...document.nodes, node] })),

  updateNode: (nodeId, patch) =>
    get().edit(document => ({
      ...document,
      nodes: document.nodes.map(node =>
        node.id === nodeId ? { ...node, ...patch } : node
      ),
    })),

  setNodeTransform: (nodeId, transform) =>
    get().edit(document => ({
      ...document,
      nodes: document.nodes.map(node =>
        node.id === nodeId ? { ...node, transform } : node
      ),
    })),

  removeNode: nodeId => {
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
    })

    if (get().selectedNodeId === nodeId) {
      set(state => patchDraft(state, { selectedNodeId: null }))
    }
  },

  setLight: light =>
    get().edit(document => {
      const index = document.lights.findIndex(l => l.id === light.id)
      const lights =
        index >= 0
          ? document.lights.map(l => (l.id === light.id ? light : l))
          : [...document.lights, light]

      return { ...document, lights }
    }),

  removeLight: lightId =>
    get().edit(document => ({
      ...document,
      lights: document.lights.filter(light => light.id !== lightId),
    })),
}))
