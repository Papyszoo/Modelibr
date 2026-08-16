import {
  SCENE_HISTORY_LIMIT,
  useSceneEditorStore,
} from '@/stores/sceneEditorStore'

import type { SceneDocument, SceneNode } from '@/features/scenes/types'

/**
 * The undo stack the old stage editor never had.
 *
 * Regressions these catch: an `edit` that mutates the document in place (undo
 * would then restore an object that had already changed under it), a redo
 * branch that survives a new edit (redo would apply a future that never
 * followed from the present), and a `markSaved` that clears history along with
 * the dirty flag (a user who saves would lose the ability to undo what they
 * just saved).
 */

function makeDocument(nodes: SceneNode[] = []): SceneDocument {
  return { schemaVersion: 1, nodes, lights: [] }
}

function makeNode(id: string): SceneNode {
  return {
    id,
    transform: {
      position: { x: 0, y: 0, z: 0 },
      rotationEuler: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    },
    asset: { assetType: 'Model', assetId: 1, versionId: 1 },
    visible: true,
  }
}

describe('sceneEditorStore', () => {
  beforeEach(() => {
    useSceneEditorStore.getState().close()
  })

  it('opens a scene with clean history', () => {
    useSceneEditorStore.getState().open(7, makeDocument(), 3)

    const state = useSceneEditorStore.getState()
    expect(state.sceneId).toBe(7)
    expect(state.baseRevision).toBe(3)
    expect(state.isDirty).toBe(false)
    expect(state.canUndo()).toBe(false)
  })

  it('does not mutate the previous document when editing', () => {
    const original = makeDocument()
    useSceneEditorStore.getState().open(1, original, 1)

    useSceneEditorStore.getState().addNode(makeNode('lamp'))

    // The document handed to open() must be untouched: undo restores the
    // object on the stack, so an in-place edit would make undo a no-op.
    expect(original.nodes).toHaveLength(0)
    expect(useSceneEditorStore.getState().document?.nodes).toHaveLength(1)
  })

  it('undoes and redoes an edit', () => {
    useSceneEditorStore.getState().open(1, makeDocument(), 1)
    useSceneEditorStore.getState().addNode(makeNode('lamp'))

    useSceneEditorStore.getState().undo()
    expect(useSceneEditorStore.getState().document?.nodes).toHaveLength(0)
    expect(useSceneEditorStore.getState().canRedo()).toBe(true)

    useSceneEditorStore.getState().redo()
    expect(useSceneEditorStore.getState().document?.nodes).toHaveLength(1)
  })

  it('drops the redo branch once a new edit is made', () => {
    useSceneEditorStore.getState().open(1, makeDocument(), 1)
    useSceneEditorStore.getState().addNode(makeNode('lamp'))
    useSceneEditorStore.getState().undo()

    useSceneEditorStore.getState().addNode(makeNode('bench'))

    expect(useSceneEditorStore.getState().canRedo()).toBe(false)
    expect(
      useSceneEditorStore.getState().document?.nodes.map(node => node.id)
    ).toEqual(['bench'])
  })

  it('keeps history across a save so a saved edit can still be undone', () => {
    useSceneEditorStore.getState().open(1, makeDocument(), 1)
    useSceneEditorStore.getState().addNode(makeNode('lamp'))

    useSceneEditorStore.getState().markSaved(2)

    expect(useSceneEditorStore.getState().isDirty).toBe(false)
    expect(useSceneEditorStore.getState().baseRevision).toBe(2)
    expect(useSceneEditorStore.getState().canUndo()).toBe(true)
  })

  it('bounds the history at the limit, keeping the most recent steps', () => {
    useSceneEditorStore.getState().open(1, makeDocument(), 1)

    for (let i = 0; i < SCENE_HISTORY_LIMIT + 10; i++) {
      useSceneEditorStore.getState().addNode(makeNode(`node-${i}`))
    }

    expect(useSceneEditorStore.getState().past).toHaveLength(
      SCENE_HISTORY_LIMIT
    )

    // The oldest entries are the ones dropped, so undoing the full stack lands
    // on a document that still holds the earliest nodes.
    for (let i = 0; i < SCENE_HISTORY_LIMIT; i++) {
      useSceneEditorStore.getState().undo()
    }

    expect(useSceneEditorStore.getState().document?.nodes).toHaveLength(10)
  })

  it('clears the selection when the selected node is removed', () => {
    useSceneEditorStore.getState().open(1, makeDocument([makeNode('lamp')]), 1)
    useSceneEditorStore.getState().selectNode('lamp')

    useSceneEditorStore.getState().removeNode('lamp')

    expect(useSceneEditorStore.getState().selectedNodeId).toBeNull()
  })

  it('upserts a light by id instead of stacking a second one', () => {
    useSceneEditorStore.getState().open(1, makeDocument(), 1)
    const light = {
      id: 'key',
      type: 'directional' as const,
      position: { x: 0, y: 5, z: 0 },
      intensity: 1,
      color: '#ffffff',
    }

    useSceneEditorStore.getState().setLight(light)
    useSceneEditorStore.getState().setLight({ ...light, intensity: 2 })

    const lights = useSceneEditorStore.getState().document?.lights ?? []
    expect(lights).toHaveLength(1)
    expect(lights[0].intensity).toBe(2)
  })

  it('ignores an edit that returns the same document', () => {
    useSceneEditorStore.getState().open(1, makeDocument(), 1)

    useSceneEditorStore.getState().edit(document => document)

    // No history entry, and not dirty: a no-op edit that pushed onto the stack
    // would make "Undo" appear to do nothing the first time it is pressed.
    expect(useSceneEditorStore.getState().canUndo()).toBe(false)
    expect(useSceneEditorStore.getState().isDirty).toBe(false)
  })
})
