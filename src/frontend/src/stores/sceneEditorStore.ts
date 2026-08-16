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

interface SceneEditorState {
  /** The scene being edited, or null when the editor is closed. */
  sceneId: number | null
  /** The revision this draft was based on - what a save sends as its expected revision. */
  baseRevision: number | null
  document: SceneDocument | null
  past: SceneDocument[]
  future: SceneDocument[]
  /** True when the draft differs from what was last loaded or saved. */
  isDirty: boolean
  selectedNodeId: string | null

  open: (sceneId: number, document: SceneDocument, revision: number) => void
  close: () => void
  /** Marks the current draft as saved at `revision`, clearing the dirty flag but keeping history. */
  markSaved: (revision: number) => void

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
  sceneId: null,
  baseRevision: null,
  document: null,
  past: [],
  future: [],
  isDirty: false,
  selectedNodeId: null,

  open: (sceneId, document, revision) =>
    set({
      sceneId,
      document,
      baseRevision: revision,
      past: [],
      future: [],
      isDirty: false,
      selectedNodeId: null,
    }),

  close: () =>
    set({
      sceneId: null,
      document: null,
      baseRevision: null,
      past: [],
      future: [],
      isDirty: false,
      selectedNodeId: null,
    }),

  markSaved: revision => set({ baseRevision: revision, isDirty: false }),

  edit: mutate => {
    const { document, past } = get()
    if (!document) {
      return
    }

    const next = mutate(document)
    if (next === document) {
      return
    }

    set({
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
  },

  undo: () => {
    const { past, future, document } = get()
    const previous = past[past.length - 1]
    if (!previous || !document) {
      return
    }

    set({
      document: previous,
      past: past.slice(0, -1),
      future: [document, ...future],
      isDirty: true,
    })
  },

  redo: () => {
    const { past, future, document } = get()
    const next = future[0]
    if (!next || !document) {
      return
    }

    set({
      document: next,
      past: [...past, document],
      future: future.slice(1),
      isDirty: true,
    })
  },

  canUndo: () => get().past.length > 0,
  canRedo: () => get().future.length > 0,

  selectNode: nodeId => set({ selectedNodeId: nodeId }),

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
    get().edit(document => ({
      ...document,
      nodes: document.nodes.filter(node => node.id !== nodeId),
    }))

    if (get().selectedNodeId === nodeId) {
      set({ selectedNodeId: null })
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
