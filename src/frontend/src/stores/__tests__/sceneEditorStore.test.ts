import type { SceneDocument, SceneNode } from '@/features/scenes/types'
import {
  SCENE_HISTORY_LIMIT,
  useSceneEditorStore,
} from '@/stores/sceneEditorStore'

/**
 * The undo stack the old stage editor never had.
 *
 * Regressions these catch: an `edit` that mutates the document in place (undo
 * would then restore an object that had already changed under it), a redo
 * branch that survives a new edit (redo would apply a future that never
 * followed from the present), a `markSaved` that clears history along with the
 * dirty flag (a user who saves would lose the ability to undo what they just
 * saved), and a `markSaved` that clears the dirty flag for edits the save never
 * carried (those changes would be marked saved while existing only in the
 * browser).
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
    // `close()` forgets only the ACTIVE scene's session, which is the product
    // behaviour and not a reset. The store is a module singleton, so the session
    // map is cleared outright here - otherwise one test's scenes outlive it and a
    // count assertion measures the wrong thing.
    useSceneEditorStore.getState().close()
    useSceneEditorStore.setState({ drafts: {} })
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
    const sent = useSceneEditorStore.getState().document!

    useSceneEditorStore.getState().markSaved(2, sent)

    expect(useSceneEditorStore.getState().isDirty).toBe(false)
    expect(useSceneEditorStore.getState().baseRevision).toBe(2)
    expect(useSceneEditorStore.getState().canUndo()).toBe(true)
  })

  it('stays dirty when the draft moved on while the save was in flight', () => {
    // The save sent a snapshot. An edit made before the response arrived was
    // never part of it, so clearing the dirty flag would report changes as
    // saved that nothing had sent - and the next save would never send them.
    useSceneEditorStore.getState().open(1, makeDocument(), 1)
    useSceneEditorStore.getState().addNode(makeNode('lamp'))
    const sent = useSceneEditorStore.getState().document!

    useSceneEditorStore.getState().addNode(makeNode('bench'))
    useSceneEditorStore.getState().markSaved(2, sent)

    expect(useSceneEditorStore.getState().isDirty).toBe(true)
    // Based on what the server now holds, so the next save carries the bench.
    expect(useSceneEditorStore.getState().baseRevision).toBe(2)
  })

  it('remembers which scene is open independently of the loaded draft', () => {
    // The dock renders only the active tab, so the Scenes tab unmounts on every
    // switch. Held in component state, the open scene - and the unsaved draft
    // the editor then discarded on unmount - was lost each time.
    useSceneEditorStore.getState().openScene(7)
    expect(useSceneEditorStore.getState().openSceneId).toBe(7)
    expect(useSceneEditorStore.getState().document).toBeNull()

    useSceneEditorStore.getState().open(7, makeDocument(), 1)
    useSceneEditorStore.getState().addNode(makeNode('lamp'))

    // Re-opening the scene already open must not throw the draft away.
    useSceneEditorStore.getState().openScene(7)
    expect(useSceneEditorStore.getState().isDirty).toBe(true)
    expect(useSceneEditorStore.getState().document?.nodes).toHaveLength(1)

    // Opening a different scene does.
    useSceneEditorStore.getState().openScene(8)
    expect(useSceneEditorStore.getState().openSceneId).toBe(8)
    expect(useSceneEditorStore.getState().document).toBeNull()
    expect(useSceneEditorStore.getState().isDirty).toBe(false)
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

  it('releases nodes resting on a removed node instead of stranding the anchor', () => {
    // The server rejects a document whose anchor names a node that is not there,
    // so leaving it behind would fail the whole save with an error about a node
    // the user has already deleted.
    const vase: SceneNode = {
      ...makeNode('vase'),
      anchor: { onNodeId: 'table', offset: { x: 0, y: 0, z: 0 } },
    }
    useSceneEditorStore
      .getState()
      .open(1, makeDocument([makeNode('table'), vase]), 1)

    useSceneEditorStore.getState().removeNode('table')

    const nodes = useSceneEditorStore.getState().document?.nodes ?? []
    expect(nodes).toHaveLength(1)
    expect(nodes[0].id).toBe('vase')
    expect(nodes[0].anchor).toBeNull()
  })

  it('takes a slot with the node it decides', () => {
    // The same trap the dangling anchor above fixes: a slot naming a node that is
    // not there fails the whole save, for a node the user has already deleted.
    const lamp: SceneNode = { ...makeNode('lamp-1'), slotId: 'streetlight' }
    useSceneEditorStore.getState().open(
      1,
      {
        ...makeDocument([lamp]),
        slots: [
          {
            id: 'streetlight',
            candidates: [
              {
                id: 'A',
                asset: { assetType: 'Model', assetId: 1, versionId: 1 },
              },
            ],
          },
        ],
      },
      1
    )

    useSceneEditorStore.getState().removeNode('lamp-1')

    expect(useSceneEditorStore.getState().document?.slots).toBeUndefined()
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

  it('keeps one unsaved draft per scene when switching between scenes', () => {
    // The regression this guards: with one tab per scene, looking at another
    // scene must not throw away the first one's unsaved edits. Before drafts were
    // keyed by scene, `openScene` reset every field and the work was only ever in
    // the browser - unrecoverable.
    useSceneEditorStore.getState().open(1, makeDocument(), 1)
    useSceneEditorStore.getState().addNode(makeNode('a'))

    useSceneEditorStore.getState().open(2, makeDocument(), 7)
    useSceneEditorStore.getState().addNode(makeNode('b'))

    expect(
      useSceneEditorStore.getState().document?.nodes.map(n => n.id)
    ).toEqual(['b'])

    // Back to scene 1: its own draft, with its own node and its own revision.
    useSceneEditorStore.getState().openScene(1)
    expect(
      useSceneEditorStore.getState().document?.nodes.map(n => n.id)
    ).toEqual(['a'])
    expect(useSceneEditorStore.getState().isDirty).toBe(true)
    expect(useSceneEditorStore.getState().baseRevision).toBe(1)

    // Undo history belongs to the scene it was made in, not to whichever tab is
    // currently mounted.
    expect(useSceneEditorStore.getState().canUndo()).toBe(true)
  })

  it('starts a scene with no stored draft from a clean state', () => {
    useSceneEditorStore.getState().open(1, makeDocument(), 1)
    useSceneEditorStore.getState().addNode(makeNode('a'))

    useSceneEditorStore.getState().openScene(99)

    expect(useSceneEditorStore.getState().openSceneId).toBe(99)
    expect(useSceneEditorStore.getState().document).toBeNull()
    expect(useSceneEditorStore.getState().isDirty).toBe(false)
  })

  it('close forgets the draft, so reopening does not resurrect abandoned edits', () => {
    useSceneEditorStore.getState().open(1, makeDocument(), 1)
    useSceneEditorStore.getState().addNode(makeNode('a'))

    // Back is the explicit "forget this" gesture.
    useSceneEditorStore.getState().close()
    useSceneEditorStore.getState().openScene(1)

    expect(useSceneEditorStore.getState().document).toBeNull()
    expect(useSceneEditorStore.getState().isDirty).toBe(false)
  })

  it('keeps the editor-only state per scene, not per component', () => {
    // Error banners, the candidate preview, the blockout override and the node
    // failures were all component useState, which the dock unmounts on every tab
    // switch. Coming back to a scene used to clear the error you were reading and
    // drop the view you had chosen - the editor looked like it had forgotten.
    useSceneEditorStore.getState().open(1, makeDocument(), 1)
    useSceneEditorStore.getState().setSaveError('The scene could not be saved.')
    useSceneEditorStore.getState().setBlockoutOverride(true)
    useSceneEditorStore.getState().recordNodeFailure('lamp', 'texture 404')

    useSceneEditorStore.getState().open(2, makeDocument(), 1)

    // Scene 2 is a different scene: none of scene 1's state leaks into it.
    expect(useSceneEditorStore.getState().saveError).toBeNull()
    expect(useSceneEditorStore.getState().blockoutOverride).toBeNull()
    expect(useSceneEditorStore.getState().failedNodes.size).toBe(0)

    useSceneEditorStore.getState().openScene(1)
    expect(useSceneEditorStore.getState().saveError).toBe(
      'The scene could not be saved.'
    )
    expect(useSceneEditorStore.getState().blockoutOverride).toBe(true)
    expect(useSceneEditorStore.getState().failedNodes.get('lamp')).toBe(
      'texture 404'
    )
  })

  it('does not replace the node-failure map when the message is unchanged', () => {
    // The viewport re-reports a failed resource on every frame. Producing a new
    // Map each time re-renders the hierarchy for no reason at all.
    useSceneEditorStore.getState().open(1, makeDocument(), 1)
    useSceneEditorStore.getState().recordNodeFailure('lamp', 'texture 404')
    const first = useSceneEditorStore.getState().failedNodes

    useSceneEditorStore.getState().recordNodeFailure('lamp', 'texture 404')

    expect(useSceneEditorStore.getState().failedNodes).toBe(first)

    useSceneEditorStore.getState().recordNodeFailure('lamp', 'texture 500')
    expect(useSceneEditorStore.getState().failedNodes).not.toBe(first)
    expect(useSceneEditorStore.getState().failedNodes.get('lamp')).toBe(
      'texture 500'
    )
  })

  it('releases a session so repeated open/close does not grow the map', () => {
    // A session map that only ever grows is a leak that outlives the tabs it was
    // opened for, and keeps whole scene documents in memory after the user is
    // done with them.
    for (let round = 0; round < 5; round++) {
      useSceneEditorStore.getState().openScene(100 + round)
      useSceneEditorStore
        .getState()
        .open(100 + round, makeDocument([makeNode('n')]), 1)
      useSceneEditorStore.getState().discardDraft(100 + round)
    }

    expect(useSceneEditorStore.getState().sessionCount()).toBe(0)
  })

  it('clears one node failure without touching the others', () => {
    useSceneEditorStore.getState().open(1, makeDocument(), 1)
    useSceneEditorStore.getState().recordNodeFailure('lamp', 'texture 404')
    useSceneEditorStore.getState().recordNodeFailure('chair', 'mesh 500')

    useSceneEditorStore.getState().clearNodeFailure('lamp')

    const failed = useSceneEditorStore.getState().failedNodes
    expect(failed.has('lamp')).toBe(false)
    expect(failed.get('chair')).toBe('mesh 500')
  })

  it('discardDraft drops one scene without disturbing the other', () => {
    useSceneEditorStore.getState().open(1, makeDocument(), 1)
    useSceneEditorStore.getState().addNode(makeNode('a'))
    useSceneEditorStore.getState().open(2, makeDocument(), 2)
    useSceneEditorStore.getState().addNode(makeNode('b'))

    // Closing the tab for scene 2 while scene 1's draft is on screen.
    useSceneEditorStore.getState().discardDraft(2)

    useSceneEditorStore.getState().openScene(1)
    expect(
      useSceneEditorStore.getState().document?.nodes.map(n => n.id)
    ).toEqual(['a'])

    useSceneEditorStore.getState().openScene(2)
    expect(useSceneEditorStore.getState().document).toBeNull()
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
