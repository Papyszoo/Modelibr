import { act, renderHook } from '@testing-library/react'

import type { SceneDocument, SceneNode } from '../../types'
import {
  buildSceneResourceQueue,
  nextSceneResourceKey,
  reconcileSceneResourceAdmission,
  useSceneResourceAdmission,
} from '../useSceneResourceAdmission'

function modelNode(id: string, assetId: number, versionId: number): SceneNode {
  return {
    id,
    name: id,
    asset: { assetType: 'Model', assetId, versionId },
    primitive: null,
    transform: {
      position: { x: 0, y: 0, z: 0 },
      rotationEuler: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    },
    visible: true,
  }
}

function documentWith(nodes: SceneNode[]): SceneDocument {
  return {
    schemaVersion: 1,
    units: 'meters',
    nodes,
    lights: [],
    environment: null,
  }
}

describe('scene resource admission', () => {
  let queuedFrames: FrameRequestCallback[]

  beforeEach(() => {
    queuedFrames = []
    jest.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
      queuedFrames.push(callback)
      return queuedFrames.length
    })
    jest.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {})
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('leaves hidden nodes out of the queue entirely', () => {
    // Regression: a hidden node renders nothing, so it never reports a settle - but it
    // was still queued. Its resource was promoted and then waited on forever, and
    // everything behind it stayed un-admitted. Worse when a hidden node SHARED an asset
    // with a visible one: that key could never complete at all, because completing
    // requires every placement of it to have reported in.
    const hidden = { ...modelNode('lamp-off', 9, 2), visible: false }
    const queue = buildSceneResourceQueue(
      documentWith([modelNode('sofa', 42, 3), hidden])
    )

    expect(queue.keys).toEqual(['Model:42:3'])
    expect(queue.keyByNodeId.has('lamp-off')).toBe(false)
    expect(nextSceneResourceKey(queue, new Set(['Model:42:3']))).toBeNull()
  })

  it('does not let a hidden placement block the asset a visible one shares with it', () => {
    const visible = modelNode('sofa-a', 42, 3)
    const hidden = { ...modelNode('sofa-b', 42, 3), visible: false }
    const queue = buildSceneResourceQueue(documentWith([visible, hidden]))

    // Only the visible placement has to settle for the resource to complete.
    expect(queue.nodeIdsByKey.get('Model:42:3')).toEqual(['sofa-a'])
  })

  it('deduplicates repeated placements into one deterministic queue entry', () => {
    // Regression: mounting one loader per node let 20 copies of one asset compete with
    // every other model even though useLoader shares their URL. The queue is per resource,
    // while retaining the node list needed to account for clone/material work.
    const queue = buildSceneResourceQueue(
      documentWith([
        modelNode('sofa-a', 42, 3),
        modelNode('sofa-b', 42, 3),
        modelNode('lamp', 9, 2),
      ])
    )

    expect(queue.keys).toEqual(['Model:42:3', 'Model:9:2'])
    expect(queue.nodeIdsByKey.get('Model:42:3')).toEqual(['sofa-a', 'sofa-b'])

    const completed = new Set(['Model:42:3'])
    expect(nextSceneResourceKey(queue, completed)).toBe('Model:9:2')
    completed.add('Model:9:2')
    expect(nextSceneResourceKey(queue, completed)).toBeNull()
  })

  it('admits one resource and yields a frame after all of its nodes settle', () => {
    // Regression: promise-based downloads were asynchronous, but resolving together
    // released every parse/clone/material promotion in one burst. The next unique source
    // must remain bounds-only until the active source's placements settle and a frame runs.
    const document = documentWith([
      modelNode('sofa-a', 42, 3),
      modelNode('sofa-b', 42, 3),
      modelNode('lamp', 9, 2),
    ])
    const { result } = renderHook(() => useSceneResourceAdmission(document))

    expect(result.current.isAdmitted(document.nodes[0].asset)).toBe(true)
    expect(result.current.isAdmitted(document.nodes[2].asset)).toBe(false)

    act(() => result.current.onNodeSettled('sofa-a', true))
    expect(result.current.isAdmitted(document.nodes[2].asset)).toBe(false)
    expect(queuedFrames).toHaveLength(0)

    act(() => result.current.onNodeSettled('sofa-b', true))
    expect(result.current.completedResourceCount).toBe(1)
    expect(result.current.failedResourceCount).toBe(0)
    expect(result.current.isAdmitted(document.nodes[0].asset)).toBe(true)
    expect(result.current.isAdmitted(document.nodes[2].asset)).toBe(false)
    expect(queuedFrames).toHaveLength(1)

    act(() => queuedFrames.shift()?.(16))
    expect(result.current.isAdmitted(document.nodes[2].asset)).toBe(true)
  })

  it('cancels a queued promotion when the draft resource set changes', () => {
    // Regression: previewing another slot candidate while a promotion was queued could
    // start geometry from the previous draft after it had already disappeared. Mutating
    // the document resets admission to the new draft's first resource.
    const firstDocument = documentWith([
      modelNode('sofa', 42, 3),
      modelNode('lamp', 9, 2),
    ])
    const { result, rerender } = renderHook(
      ({ document }) => useSceneResourceAdmission(document),
      { initialProps: { document: firstDocument } }
    )

    act(() => result.current.onNodeSettled('sofa', true))
    expect(queuedFrames).toHaveLength(1)

    const replacementDocument = documentWith([modelNode('chair', 77, 1)])
    rerender({ document: replacementDocument })

    expect(result.current.isAdmitted(replacementDocument.nodes[0].asset)).toBe(
      true
    )
    expect(result.current.isAdmitted(firstDocument.nodes[1].asset)).toBe(false)
  })

  it('keeps the active resource when a selected placement extends the queue', () => {
    // Regression: placing a second node selected it and changed the queue signature. The
    // scheduler rebuilt around that selection while the first request was still held,
    // admitting two distinct model files at once despite reporting only one active load.
    const firstDocument = documentWith([modelNode('sofa', 42, 3)])
    const { result, rerender } = renderHook(
      ({ document, selectedNodeId }) =>
        useSceneResourceAdmission(document, true, false, selectedNodeId),
      {
        initialProps: {
          document: firstDocument,
          selectedNodeId: 'sofa' as string | null,
        },
      }
    )

    const extendedDocument = documentWith([
      ...firstDocument.nodes,
      modelNode('lamp', 9, 2),
    ])
    rerender({ document: extendedDocument, selectedNodeId: 'lamp' })

    expect(result.current.activeResourceKey).toBe('Model:42:3')
    expect(result.current.isAdmitted(extendedDocument.nodes[0].asset)).toBe(
      true
    )
    expect(result.current.isAdmitted(extendedDocument.nodes[1].asset)).toBe(
      false
    )

    act(() => result.current.onNodeSettled('sofa', true))
    act(() => queuedFrames.shift()?.(16))

    expect(result.current.activeResourceKey).toBe('Model:9:2')
    expect(result.current.isAdmitted(extendedDocument.nodes[1].asset)).toBe(
      true
    )
  })

  it('drops an active resource that disappears from a replacement draft', () => {
    // Regression: preserving in-flight work across ordinary placements must not keep a
    // removed candidate admitted after the draft switches to a different resource.
    const firstQueue = buildSceneResourceQueue(
      documentWith([modelNode('sofa', 42, 3)])
    )
    const replacementQueue = buildSceneResourceQueue(
      documentWith([modelNode('chair', 77, 1)])
    )

    const reconciled = reconcileSceneResourceAdmission(
      {
        signature: firstQueue.signature,
        completedKeys: new Set(),
        failedKeys: new Set(),
        activeKey: 'Model:42:3',
      },
      replacementQueue,
      'Model:77:1'
    )

    expect(reconciled.activeKey).toBe('Model:77:1')
  })

  it('preserves admission when only a node transform changes', () => {
    // Regression: dragging a node creates a new draft object on every pointer update. The
    // queue effect previously depended on that object, repeatedly returning the viewport
    // to its first resource even though the referenced resources had not changed.
    const firstDocument = documentWith([
      modelNode('sofa', 42, 3),
      modelNode('lamp', 9, 2),
    ])
    const { result, rerender } = renderHook(
      ({ document }) => useSceneResourceAdmission(document),
      { initialProps: { document: firstDocument } }
    )

    act(() => result.current.onNodeSettled('sofa', true))
    act(() => queuedFrames.shift()?.(16))
    expect(result.current.isAdmitted(firstDocument.nodes[1].asset)).toBe(true)

    const movedDocument = {
      ...firstDocument,
      nodes: firstDocument.nodes.map(node =>
        node.id === 'sofa'
          ? {
              ...node,
              transform: {
                ...node.transform,
                position: { ...node.transform.position, x: 3 },
              },
            }
          : node
      ),
    }
    rerender({ document: movedDocument })

    expect(result.current.completedResourceCount).toBe(1)
    expect(result.current.isAdmitted(movedDocument.nodes[1].asset)).toBe(true)
  })

  it('promotes a selected queued resource before the remaining document order', () => {
    // Regression: clicking a bounds-only node while a room refined did not make that node
    // useful any sooner. Selection changes the next promotion without interrupting the
    // resource already parsing or resetting completed work.
    const document = documentWith([
      modelNode('sofa', 42, 3),
      modelNode('lamp', 9, 2),
      modelNode('chair', 77, 1),
    ])
    const { result, rerender } = renderHook(
      ({ selectedNodeId }) =>
        useSceneResourceAdmission(document, true, false, selectedNodeId),
      { initialProps: { selectedNodeId: null as string | null } }
    )

    rerender({ selectedNodeId: 'chair' })
    act(() => result.current.onNodeSettled('sofa', true))
    act(() => queuedFrames.shift()?.(16))

    expect(result.current.isAdmitted(document.nodes[1].asset)).toBe(false)
    expect(result.current.isAdmitted(document.nodes[2].asset)).toBe(true)
  })

  it('promotes the camera ranking before document order', () => {
    // The scene's first node is rarely the one the user is looking at. Once the viewport
    // has ranked what is on screen, the queue follows that order rather than the order the
    // agent happened to write the nodes in.
    const document = documentWith([
      modelNode('sofa', 42, 3),
      modelNode('lamp', 9, 2),
      modelNode('chair', 77, 1),
    ])
    const { result, rerender } = renderHook(
      ({ rankedKeys }) =>
        useSceneResourceAdmission(document, true, false, null, rankedKeys),
      { initialProps: { rankedKeys: [] as string[] } }
    )

    // No camera exists until the Canvas has mounted, so the first promotion is document
    // order. The ranking arrives a commit later and governs everything after it.
    expect(result.current.activeResourceKey).toBe('Model:42:3')

    rerender({ rankedKeys: ['Model:77:1', 'Model:9:2', 'Model:42:3'] })
    act(() => result.current.onNodeSettled('sofa', true))
    act(() => queuedFrames.shift()?.(16))

    expect(result.current.activeResourceKey).toBe('Model:77:1')
  })

  it('keeps a resource the ranking has not seen in the queue', () => {
    // A node placed while the camera was moving is not in the last ranking. It must still
    // load once the ranked resources are done, rather than being dropped silently.
    const queue = buildSceneResourceQueue(
      documentWith([modelNode('sofa', 42, 3), modelNode('lamp', 9, 2)])
    )

    expect(
      nextSceneResourceKey(queue, new Set(['Model:9:2']), null, ['Model:9:2'])
    ).toBe('Model:42:3')
    expect(nextSceneResourceKey(queue, new Set(), null, ['Model:404:1'])).toBe(
      'Model:42:3'
    )
  })

  it('lets selection outrank the camera', () => {
    // Two rules could disagree about what loads next. Clicking a node is an explicit ask
    // and wins over anything the camera infers.
    const queue = buildSceneResourceQueue(
      documentWith([modelNode('sofa', 42, 3), modelNode('lamp', 9, 2)])
    )

    expect(
      nextSceneResourceKey(queue, new Set(), 'Model:9:2', ['Model:42:3'])
    ).toBe('Model:9:2')
  })

  it('counts a resource once when any repeated placement fails', () => {
    // Regression: a failure released the serial queue but was indistinguishable from a
    // successful load, so the progress indicator could disappear while a failed marker
    // remained in the viewport. Failures are reported per resource, not per placement.
    const document = documentWith([
      modelNode('sofa-a', 42, 3),
      modelNode('sofa-b', 42, 3),
      modelNode('lamp', 9, 2),
    ])
    const { result } = renderHook(() => useSceneResourceAdmission(document))

    act(() => result.current.onNodeSettled('sofa-a', false))
    act(() => result.current.onNodeSettled('sofa-b', true))

    expect(result.current.completedResourceCount).toBe(1)
    expect(result.current.failedResourceCount).toBe(1)
    expect(queuedFrames).toHaveLength(1)

    act(() => queuedFrames.shift()?.(16))
    act(() => result.current.onNodeSettled('lamp', true))

    expect(result.current.completedResourceCount).toBe(2)
    expect(result.current.failedResourceCount).toBe(1)
  })
})
