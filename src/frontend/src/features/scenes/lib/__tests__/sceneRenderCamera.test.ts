import type { Aabb, SceneNodeView, SceneView } from '../../types'
import {
  frameSceneCamera,
  sceneBounds,
  sceneViewpointFromName,
} from '../sceneRenderCamera'

function node(footprint: Aabb | null, visible = true): SceneNodeView {
  return {
    nodeId: `n${Math.random()}`,
    name: null,
    slotId: null,
    asset: null,
    primitive: null,
    transform: {
      position: { x: 0, y: 0, z: 0 },
      rotationEuler: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    },
    material: null,
    visible,
    footprint,
    sourceDimensions: null,
    originConvention: null,
    gridSize: null,
    groundOffset: null,
    originInBounds: null,
    groundSnap: false,
    faceToward: null,
    frontAxis: null,
    anchor: null,
  } as SceneNodeView
}

function view(nodes: SceneNodeView[]): SceneView {
  return { nodes } as SceneView
}

function box(
  minX: number,
  minY: number,
  minZ: number,
  maxX: number,
  maxY: number,
  maxZ: number
): Aabb {
  return {
    min: { x: minX, y: minY, z: minZ },
    max: { x: maxX, y: maxY, z: maxZ },
  }
}

describe('sceneViewpointFromName', () => {
  it('accepts the named viewpoints, case-insensitively', () => {
    expect(sceneViewpointFromName('front')).toBe('front')
    expect(sceneViewpointFromName('TOP')).toBe('top')
  })

  it('falls back to the three-quarter view for anything else', () => {
    // An agent passing a viewpoint the server does not know should still get a
    // usable picture back rather than an error.
    expect(sceneViewpointFromName(null)).toBe('iso')
    expect(sceneViewpointFromName('')).toBe('iso')
    expect(sceneViewpointFromName('behind-the-sofa')).toBe('iso')
  })
})

describe('sceneBounds', () => {
  it('unions every visible node footprint', () => {
    const bounds = sceneBounds(
      view([node(box(-1, 0, -1, 1, 2, 1)), node(box(3, 0, 3, 5, 1, 4))])
    )

    expect(bounds).toEqual(box(-1, 0, -1, 5, 2, 4))
  })

  it('ignores hidden nodes and nodes that were never measured', () => {
    // A hidden node draws nothing, and a never-extracted one has no footprint -
    // framing on either would push the camera back to include empty space.
    const bounds = sceneBounds(
      view([
        node(box(0, 0, 0, 1, 1, 1)),
        node(box(-50, 0, -50, -49, 1, -49), false),
        node(null),
      ])
    )

    expect(bounds).toEqual(box(0, 0, 0, 1, 1, 1))
  })

  it('is null when nothing has a measurable extent', () => {
    expect(sceneBounds(view([]))).toBeNull()
    expect(sceneBounds(view([node(null)]))).toBeNull()
    expect(sceneBounds(null)).toBeNull()
  })
})

describe('frameSceneCamera', () => {
  it('aims at the centre of the scene, not the world origin', () => {
    // The regression this guards: a scene built off to one side framed on 0,0,0
    // renders mostly empty floor with the furniture at the edge.
    const camera = frameSceneCamera(
      view([node(box(10, 0, 10, 12, 2, 12))]),
      'iso'
    )

    expect(camera.target).toEqual([11, 1, 11])
  })

  it('backs off far enough to fit the scene in frame', () => {
    const small = frameSceneCamera(view([node(box(0, 0, 0, 1, 1, 1))]), 'front')
    const large = frameSceneCamera(
      view([node(box(0, 0, 0, 20, 20, 20))]),
      'front'
    )

    const distanceOf = (c: { position: number[]; target?: number[] }) =>
      Math.hypot(
        c.position[0] - (c.target?.[0] ?? 0),
        c.position[1] - (c.target?.[1] ?? 0),
        c.position[2] - (c.target?.[2] ?? 0)
      )

    expect(distanceOf(large)).toBeGreaterThan(distanceOf(small))
  })

  it('still produces a usable camera for a scene with no extent', () => {
    // An empty or never-extracted scene must render something rather than
    // putting the camera at the origin looking at itself.
    const camera = frameSceneCamera(view([]), 'iso')

    expect(camera.target).toEqual([0, 0, 0])
    expect(Math.hypot(...camera.position)).toBeGreaterThan(1)
  })

  it('puts each viewpoint on the axis its name claims', () => {
    const scene = view([node(box(-1, 0, -1, 1, 2, 1))])

    const front = frameSceneCamera(scene, 'front')
    expect(Math.abs(front.position[2])).toBeGreaterThan(
      Math.abs(front.position[0])
    )

    const side = frameSceneCamera(scene, 'side')
    expect(Math.abs(side.position[0])).toBeGreaterThan(
      Math.abs(side.position[2])
    )

    const top = frameSceneCamera(scene, 'top')
    expect(top.position[1]).toBeGreaterThan(Math.abs(top.position[0]))
  })

  it('keeps the top view off the exact Y axis', () => {
    // A camera straight above its target has an ambiguous up vector and three.js
    // resolves it by flipping, which makes the render non-deterministic.
    const top = frameSceneCamera(view([node(box(-1, 0, -1, 1, 2, 1))]), 'top')

    expect(
      Math.abs(top.position[0]) + Math.abs(top.position[2])
    ).toBeGreaterThan(0)
  })
})
