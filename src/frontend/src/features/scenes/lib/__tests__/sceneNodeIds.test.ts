import type { SceneDocument, SceneNode } from '../../types'
import {
  type DraftNodeBounds,
  nextLightId,
  nextNodeId,
  nextPlacementX,
} from '../sceneNodeIds'

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

  it('places a new node past the right edge of the one already there', () => {
    // Regression: the step was count × new width only, so a narrow box added
    // beside a wide model landed inside it and the server reported an overlap
    // the user did not create. The right edge comes from the server's own
    // footprint, the same box the overlap check uses.
    const document = documentWith(['a'])
    const facts = new Map([
      [
        'a',
        {
          footprint: {
            min: { x: -2, y: 0, z: -2 },
            max: { x: 2, y: 1, z: 2 },
          },
        },
      ],
    ]) as never

    expect(nextPlacementX(document, 1, facts)).toBe(2.5)
  })

  it('accounts for a measured origin so a corner-origin asset still clears the neighbour', () => {
    // A model whose origin sits at its own right edge (fraction 1) has to be
    // placed by that fraction or its body still overlaps the node before it:
    // placing at 2 would put the box at -0..2, over the existing 2.
    const document = documentWith(['a'])
    const facts = new Map([
      [
        'a',
        {
          footprint: {
            min: { x: -2, y: 0, z: -2 },
            max: { x: 2, y: 1, z: 2 },
          },
        },
      ],
    ]) as never

    expect(nextPlacementX(document, 2, facts, 1)).toBe(4)
  })

  it('places a box past a model that only exists in the draft, from its measured width', () => {
    // Regression: a model placed in this session lives only in the draft, so
    // the server has no footprint for it. Placement fell back to the node
    // count and dropped the 1 m box at x=1, overlapping the 2 m model at x=0
    // (its -1..1 box spans 0.5..1.5). The measured dimensions the editor
    // fetched when it placed the model give the same right edge the server
    // would derive on save.
    const document = documentWith(['model-1-1'])
    const draftBounds: ReadonlyMap<string, DraftNodeBounds> = new Map([
      [
        'model-1-1',
        {
          sourceDimensions: { x: 2, y: 2, z: 2 },
          originConvention: null,
          originInBounds: null,
        },
      ],
    ])

    expect(nextPlacementX(document, 1, undefined, null, draftBounds)).toBe(1.5)
  })

  it('places past a blockout box that only exists in the draft', () => {
    // The same draft problem from the other side: a primitive's size is in the
    // document itself, so no fetch is needed to measure it. A 10 m box at x=0
    // occupies -5..5; the box that follows goes half its own width past 5.
    const box: SceneNode = {
      ...makeNode('box-1'),
      asset: null,
      primitive: { shape: 'box', size: { x: 10, y: 1, z: 1 } },
    }
    const document: SceneDocument = {
      schemaVersion: 1,
      nodes: [box],
      lights: [],
    }

    expect(nextPlacementX(document, 1)).toBe(5.5)
  })
})
