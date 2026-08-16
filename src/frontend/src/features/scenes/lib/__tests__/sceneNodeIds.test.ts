import type { SceneDocument, SceneNode } from '../../types'
import { nextLightId, nextNodeId, nextPlacementX } from '../sceneNodeIds'

/**
 * Id generation and the placement default for hand-built scenes.
 *
 * Regressions these catch: an id counter that restarts from the node count
 * (deleting node 1 of 2 then adding one would collide with node 2, and the
 * server rejects the whole document as a duplicate id), and a placement step
 * that returns 0 for every node - which would bury each newly placed asset
 * inside the previous one and report an overlap the user never created.
 */

function makeNode(id: string): SceneNode {
  return {
    id,
    transform: {
      position: { x: 0, y: 0, z: 0 },
      rotationEuler: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    },
    asset: { assetType: 'Model', assetId: 42, versionId: 1 },
    visible: true,
  }
}

function documentWith(ids: string[]): SceneDocument {
  return { schemaVersion: 1, nodes: ids.map(makeNode), lights: [] }
}

describe('nextNodeId', () => {
  it('starts at 1 for an empty scene', () => {
    expect(nextNodeId(documentWith([]), 'model-42')).toBe('model-42-1')
  })

  it('skips ids already taken', () => {
    expect(nextNodeId(documentWith(['model-42-1']), 'model-42')).toBe(
      'model-42-2'
    )
  })

  it('finds a free id in a gap rather than colliding with a later one', () => {
    // The counter must not be derived from the node count: after deleting
    // model-42-1, a count-based id would be "model-42-2" - which exists.
    expect(nextNodeId(documentWith(['model-42-2']), 'model-42')).toBe(
      'model-42-1'
    )
  })

  it('ignores nodes with a different prefix', () => {
    expect(nextNodeId(documentWith(['box-1', 'model-9-1']), 'model-42')).toBe(
      'model-42-1'
    )
  })
})

describe('nextLightId', () => {
  it('counts lights, not nodes', () => {
    const document: SceneDocument = {
      schemaVersion: 1,
      nodes: [makeNode('model-1-1')],
      lights: [
        {
          id: 'light-1',
          type: 'point',
          position: { x: 0, y: 0, z: 0 },
          intensity: 1,
          color: '#ffffff',
        },
      ],
    }

    expect(nextLightId(document, 'light')).toBe('light-2')
  })
})

describe('nextPlacementX', () => {
  it('lays nodes out in a row stepped by the asset width', () => {
    expect(nextPlacementX(documentWith([]), 4)).toBe(0)
    expect(nextPlacementX(documentWith(['a']), 4)).toBe(4)
    expect(nextPlacementX(documentWith(['a', 'b']), 4)).toBe(8)
  })

  it('never steps by less than a metre, so small assets still separate', () => {
    // A 5 cm asset stepped by its own width would stack visually even though
    // the numbers differ.
    expect(nextPlacementX(documentWith(['a']), 0.05)).toBe(1)
  })

  it('falls back to a metre when the asset has no derived width', () => {
    expect(nextPlacementX(documentWith(['a', 'b']), null)).toBe(2)
  })
})
