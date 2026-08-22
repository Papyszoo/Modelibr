import * as THREE from 'three'

import type { SceneAssetSource } from '../../hooks/useSceneAssetSources'
import type { SceneDocument, SceneNode, SceneNodeView, Vec3 } from '../../types'
import {
  buildSceneResourceCandidates,
  rankSceneResources,
  type SceneResourceCandidate,
} from '../sceneResourcePriority'

function node(
  id: string,
  assetId: number,
  position: Vec3,
  overrides: Partial<SceneNode> = {}
): SceneNode {
  return {
    id,
    name: id,
    asset: { assetType: 'Model', assetId, versionId: 1 },
    primitive: null,
    transform: {
      position,
      rotationEuler: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    },
    visible: true,
    ...overrides,
  }
}

function documentWith(nodes: SceneNode[]): SceneDocument {
  return {
    schemaVersion: 1,
    nodes,
    lights: [],
    environment: null,
  }
}

function facts(
  nodeId: string,
  sourceDimensions: Vec3 | null,
  originInBounds: Vec3 | null = null
): [string, SceneNodeView] {
  return [
    nodeId,
    {
      nodeId,
      sourceDimensions,
      originConvention: null,
      originInBounds,
    } as SceneNodeView,
  ]
}

function source(totalSizeBytes: number | null): SceneAssetSource {
  return {
    kind: 'mesh',
    url: '',
    extension: 'glb',
    resources: {},
    isLoading: false,
    totalSizeBytes,
    triangleCount: null,
    materialCount: null,
    hasPreview: false,
  }
}

/** Looking down -Z from the origin, which is where three.js points a fresh camera. */
function cameraAt(position: [number, number, number]): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 500)
  camera.position.set(...position)
  camera.updateMatrixWorld()
  camera.updateProjectionMatrix()
  return camera
}

function candidate(
  key: string,
  order: number,
  center: [number, number, number],
  radius: number | null,
  costBytes: number | null = null
): SceneResourceCandidate {
  return {
    key,
    order,
    placements: [{ center: new THREE.Vector3(...center), radius }],
    costBytes,
  }
}

describe('scene resource candidates', () => {
  it('places a candidate at its measured bounds centre, not at its origin', () => {
    // A base-at-origin sofa sits entirely above its node position. Ranking it by the node
    // transform would judge how visible the floor under it is, not how visible the sofa is.
    const document = documentWith([
      node('sofa', 42, { x: 0, y: 0, z: 0 }),
      node('lamp', 9, { x: 4, y: 0, z: 0 }),
    ])
    const candidates = buildSceneResourceCandidates(
      document,
      new Map([
        facts('sofa', { x: 2, y: 1, z: 1 }, { x: 0.5, y: 0, z: 0.5 }),
        facts('lamp', null),
      ]),
      new Map()
    )

    expect(candidates).toHaveLength(2)
    expect(candidates[0].placements[0].center.y).toBeCloseTo(0.5)
    expect(candidates[0].placements[0].radius).toBeCloseTo(
      Math.sqrt(2 * 2 + 1 + 1) / 2
    )
    // Never measured, so it carries no size rather than a size of zero.
    expect(candidates[1].placements[0].radius).toBeNull()
  })

  it('collects every placement of one resource under a single candidate', () => {
    const document = documentWith([
      node('chair-a', 7, { x: 0, y: 0, z: 0 }),
      node('chair-b', 7, { x: 30, y: 0, z: 0 }),
    ])
    const candidates = buildSceneResourceCandidates(
      document,
      new Map([
        facts('chair-a', { x: 1, y: 1, z: 1 }),
        facts('chair-b', { x: 1, y: 1, z: 1 }),
      ]),
      new Map([['Model:7:1', source(1024)]])
    )

    expect(candidates).toHaveLength(1)
    expect(candidates[0].placements).toHaveLength(2)
    expect(candidates[0].costBytes).toBe(1024)
  })

  it('ignores hidden nodes and nodes that reference no asset', () => {
    const document = documentWith([
      node('hidden', 42, { x: 0, y: 0, z: 0 }, { visible: false }),
      node('primitive', 9, { x: 0, y: 0, z: 0 }, { asset: null }),
    ])

    expect(
      buildSceneResourceCandidates(document, new Map(), new Map())
    ).toEqual([])
  })
})

describe('scene resource ranking', () => {
  const camera = cameraAt([0, 0, 10])

  it('loads what the camera can see before what it cannot', () => {
    // The whole point of the policy: refining the wall behind the user while the sofa in
    // front of them is still a grey box is the behaviour this replaces.
    const ranked = rankSceneResources(
      [
        candidate('behind', 0, [0, 0, 40], 1),
        candidate('ahead', 1, [0, 0, 0], 1),
      ],
      camera
    )

    expect(ranked).toEqual(['ahead', 'behind'])
  })

  it('prefers the larger thing on screen over the merely nearer one', () => {
    // Apparent size, not distance: a wall filling the view matters more than a coaster
    // slightly closer to the camera.
    const ranked = rankSceneResources(
      [
        candidate('coaster', 0, [0, 0, 6], 0.05),
        candidate('wall', 1, [0, 0, 0], 4),
      ],
      camera
    )

    expect(ranked).toEqual(['wall', 'coaster'])
  })

  it('falls back to distance for an asset whose bounds were never measured', () => {
    const ranked = rankSceneResources(
      [
        candidate('far-unmeasured', 0, [0, 0, -20], null),
        candidate('near-unmeasured', 1, [0, 0, 5], null),
        candidate('measured', 2, [0, 0, 0], 1),
      ],
      camera
    )

    // A measured candidate is comparable by apparent size and outranks both unmeasured
    // ones; those two are then ordered by how close they are.
    expect(ranked).toEqual(['measured', 'near-unmeasured', 'far-unmeasured'])
  })

  it('breaks a tie on cost, treating an unknown cost as the expensive one', () => {
    const ranked = rankSceneResources(
      [
        candidate('unknown', 0, [0, 0, 0], 1, null),
        candidate('heavy', 1, [0, 0, 0], 1, 90_000_000),
        candidate('light', 2, [0, 0, 0], 1, 120_000),
      ],
      camera
    )

    expect(ranked).toEqual(['light', 'heavy', 'unknown'])
  })

  it('ranks a resource by its most visible placement', () => {
    // One street lamp on screen is enough reason to load the lamp, even if the other
    // nineteen copies are behind the camera.
    const streetLamps: SceneResourceCandidate = {
      key: 'lamps',
      order: 1,
      placements: [
        { center: new THREE.Vector3(0, 0, 60), radius: 1 },
        { center: new THREE.Vector3(0, 0, 0), radius: 1 },
      ],
      costBytes: null,
    }

    expect(
      rankSceneResources(
        [candidate('offscreen', 0, [0, 0, 60], 1), streetLamps],
        camera
      )
    ).toEqual(['lamps', 'offscreen'])
  })

  it('is stable for two resources the camera cannot tell apart', () => {
    const ranked = rankSceneResources(
      [
        candidate('second', 1, [0, 0, 0], 1, 500),
        candidate('first', 0, [0, 0, 0], 1, 500),
      ],
      camera
    )

    expect(ranked).toEqual(['first', 'second'])
  })
})
