import type { SceneCameraSpec } from '../components/SceneCanvas'
import type { Aabb, SceneView } from '../types'

/**
 * Named viewpoints an agent can ask for. Names rather than coordinates, because
 * an agent that cannot see has no way to pick a good camera position, and
 * "show me the front" is what it actually wants to say.
 */
export type SceneViewpoint = 'iso' | 'front' | 'side' | 'top'

const VIEWPOINTS: readonly SceneViewpoint[] = ['iso', 'front', 'side', 'top']

/** Parses a viewpoint name, falling back to the three-quarter view. */
export function sceneViewpointFromName(name: string | null): SceneViewpoint {
  const candidate = (name ?? '').toLowerCase() as SceneViewpoint
  return VIEWPOINTS.includes(candidate) ? candidate : 'iso'
}

/**
 * Direction the camera sits in, per viewpoint, as a unit-ish offset that gets
 * scaled by how big the scene is. `top` is not exactly straight down: a camera
 * on the Y axis looking at the origin has an ambiguous up vector, and three.js
 * resolves it by flipping - so the view is nudged off-axis to keep it stable.
 */
const DIRECTIONS: Record<SceneViewpoint, [number, number, number]> = {
  iso: [1, 0.75, 1],
  front: [0, 0.25, 1.6],
  side: [1.6, 0.25, 0],
  top: [0.001, 1.6, 0.001],
}

const DEFAULT_FOV = 50

/**
 * A camera that frames the whole scene.
 *
 * Framed from the server's own per-node `footprint` - the world AABB it already
 * computes for `get_scene` - rather than from anything measured in the browser.
 * That way the picture an agent gets back is framed by the same numbers it
 * reasons about, and a scene whose geometry the server thinks is somewhere else
 * produces a visibly wrong render instead of a plausible one.
 *
 * A scene with no measurable extent still gets a usable camera: the fallback
 * distance frames roughly a 10 m room, which is what an empty or never-extracted
 * scene is most likely to become.
 */
export function frameSceneCamera(
  view: SceneView | null | undefined,
  viewpoint: SceneViewpoint
): SceneCameraSpec {
  const bounds = sceneBounds(view)
  const direction = DIRECTIONS[viewpoint]

  if (!bounds) {
    return {
      position: scaled(direction, 9),
      target: [0, 0, 0],
      fov: DEFAULT_FOV,
    }
  }

  const center: [number, number, number] = [
    (bounds.min.x + bounds.max.x) / 2,
    (bounds.min.y + bounds.max.y) / 2,
    (bounds.min.z + bounds.max.z) / 2,
  ]

  const extent = Math.max(
    bounds.max.x - bounds.min.x,
    bounds.max.y - bounds.min.y,
    bounds.max.z - bounds.min.z,
    0.5
  )

  // Half the extent over tan(half-fov) is the distance at which the scene just
  // fills the frame; the margin keeps it off the edges.
  const halfFov = (DEFAULT_FOV * Math.PI) / 180 / 2
  const distance = (extent / 2 / Math.tan(halfFov)) * 1.6

  const offset = scaled(direction, distance)
  return {
    position: [
      center[0] + offset[0],
      center[1] + offset[1],
      center[2] + offset[2],
    ],
    target: center,
    fov: DEFAULT_FOV,
  }
}

/** Union of every visible node's world footprint; null when none has one. */
export function sceneBounds(view: SceneView | null | undefined): Aabb | null {
  let bounds: Aabb | null = null

  for (const node of view?.nodes ?? []) {
    if (!node.visible || !node.footprint) {
      continue
    }

    if (!bounds) {
      bounds = {
        min: { ...node.footprint.min },
        max: { ...node.footprint.max },
      }
      continue
    }

    bounds.min.x = Math.min(bounds.min.x, node.footprint.min.x)
    bounds.min.y = Math.min(bounds.min.y, node.footprint.min.y)
    bounds.min.z = Math.min(bounds.min.z, node.footprint.min.z)
    bounds.max.x = Math.max(bounds.max.x, node.footprint.max.x)
    bounds.max.y = Math.max(bounds.max.y, node.footprint.max.y)
    bounds.max.z = Math.max(bounds.max.z, node.footprint.max.z)
  }

  return bounds
}

function scaled(
  direction: [number, number, number],
  length: number
): [number, number, number] {
  const magnitude = Math.hypot(direction[0], direction[1], direction[2]) || 1
  const unit = length / magnitude
  return [direction[0] * unit, direction[1] * unit, direction[2] * unit]
}
