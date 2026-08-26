import * as THREE from 'three'

import type { SceneAssetSource } from '../hooks/useSceneAssetSources'
import type { SceneDocument, SceneNodeView, Vec3 } from '../types'
import { boundsOffset } from './sceneGeometry'
import { sceneResourceKey } from './sceneResourceKey'

/** One placement of a resource, reduced to the sphere the camera can judge it by. */
export interface SceneResourcePlacement {
  center: THREE.Vector3
  /** Half the scaled bounds diagonal; null when the asset was never measured. */
  radius: number | null
}

export interface SceneResourceCandidate {
  key: string
  /** Document position of the first placement - the deterministic last resort. */
  order: number
  placements: SceneResourcePlacement[]
  /** Original plus auxiliaries; null means the cost is unknown, never free. */
  costBytes: number | null
}

/**
 * How visible one resource is from the current camera.
 *
 * `screenSize` is the angular radius (bounds radius over distance), which is what
 * "large on screen" means for a perspective camera and is comparable between a small
 * object nearby and a large one far away. It is null for an unmeasured asset, because
 * a resource with no bounds must not be ranked as if it were tiny.
 */
interface CandidateView {
  key: string
  order: number
  visible: boolean
  screenSize: number | null
  distance: number
  costBytes: number | null
}

const MINIMUM_TEST_RADIUS = 1e-4

function boundsRadius(bounds: Vec3, scale: Vec3): number {
  const x = bounds.x * Math.abs(scale.x)
  const y = bounds.y * Math.abs(scale.y)
  const z = bounds.z * Math.abs(scale.z)
  return Math.sqrt(x * x + y * y + z * z) / 2
}

/**
 * Turns the draft plus the server's derived facts into rankable spheres.
 *
 * Deliberately built from measured bounds rather than from loaded geometry: priority has
 * to be decided *before* anything is admitted to a loader, which is the whole point of
 * bounds-first display. A node the server has never measured keeps a null radius and is
 * ranked by distance alone rather than by an invented size.
 */
export function buildSceneResourceCandidates(
  document: SceneDocument,
  nodeFacts: Map<string, SceneNodeView>,
  sources: Map<string, SceneAssetSource>
): SceneResourceCandidate[] {
  const candidates = new Map<string, SceneResourceCandidate>()

  for (const node of document.nodes) {
    if (!node.asset || !node.visible) {
      continue
    }

    const key = sceneResourceKey(node.asset)
    const { position, rotationEuler, scale } = node.transform
    const facts = nodeFacts.get(node.id)
    const bounds = facts?.sourceDimensions ?? null
    const center = new THREE.Vector3(position.x, position.y, position.z)

    if (bounds) {
      const offset = boundsOffset(
        bounds,
        facts?.originConvention ?? null,
        facts?.originInBounds ?? null
      )
      center.add(
        new THREE.Vector3(offset[0], offset[1], offset[2])
          .multiply(new THREE.Vector3(scale.x, scale.y, scale.z))
          .applyEuler(
            new THREE.Euler(
              THREE.MathUtils.degToRad(rotationEuler.x),
              THREE.MathUtils.degToRad(rotationEuler.y),
              THREE.MathUtils.degToRad(rotationEuler.z)
            )
          )
      )
    }

    const placement: SceneResourcePlacement = {
      center,
      radius: bounds ? boundsRadius(bounds, scale) : null,
    }

    const existing = candidates.get(key)
    if (existing) {
      existing.placements.push(placement)
      continue
    }

    candidates.set(key, {
      key,
      order: candidates.size,
      placements: [placement],
      costBytes: sources.get(key)?.totalSizeBytes ?? null,
    })
  }

  return [...candidates.values()]
}

function viewCandidate(
  candidate: SceneResourceCandidate,
  camera: THREE.Camera,
  frustum: THREE.Frustum
): CandidateView {
  const cameraPosition = new THREE.Vector3().setFromMatrixPosition(
    camera.matrixWorld
  )
  const sphere = new THREE.Sphere()
  let visible = false
  let screenSize: number | null = null
  let distance = Number.POSITIVE_INFINITY

  for (const placement of candidate.placements) {
    const radius = placement.radius
    sphere.set(placement.center, Math.max(radius ?? 0, MINIMUM_TEST_RADIUS))
    visible = visible || frustum.intersectsSphere(sphere)

    // Surface distance, so a large object the camera stands inside does not rank
    // behind a pebble at the same centre distance.
    const placementDistance = Math.max(
      cameraPosition.distanceTo(placement.center) - (radius ?? 0),
      0
    )
    distance = Math.min(distance, placementDistance)

    if (radius !== null) {
      const size = radius / Math.max(placementDistance, MINIMUM_TEST_RADIUS)
      screenSize = screenSize === null ? size : Math.max(screenSize, size)
    }
  }

  return {
    key: candidate.key,
    order: candidate.order,
    visible,
    screenSize,
    distance,
    costBytes: candidate.costBytes,
  }
}

/**
 * The order unique scene resources should be handed to the loader.
 *
 * Tiers, most significant first: on screen before off screen, larger apparent size before
 * smaller, nearer before further, cheaper before more expensive, then document order so
 * the result is stable for two resources the camera cannot tell apart.
 *
 * Selection is **not** a tier here. The admission queue promotes the selected node's
 * resource itself, because selection has to win even over a resource the camera ranks
 * first, and keeping it in one place stops the two rules from disagreeing.
 *
 * An unknown cost sorts as more expensive than any known one - the same conservative
 * reading the admission budget takes - and an unmeasured asset carries no apparent size
 * rather than a size of zero.
 */
export function rankSceneResources(
  candidates: SceneResourceCandidate[],
  camera: THREE.Camera
): string[] {
  const frustum = new THREE.Frustum().setFromProjectionMatrix(
    new THREE.Matrix4().multiplyMatrices(
      camera.projectionMatrix,
      camera.matrixWorldInverse
    )
  )

  return candidates
    .map(candidate => viewCandidate(candidate, camera, frustum))
    .sort(compareCandidateViews)
    .map(view => view.key)
}

function compareCandidateViews(a: CandidateView, b: CandidateView): number {
  if (a.visible !== b.visible) {
    return a.visible ? -1 : 1
  }

  if (a.screenSize !== b.screenSize) {
    if (a.screenSize === null) return 1
    if (b.screenSize === null) return -1
    return b.screenSize - a.screenSize
  }

  if (a.distance !== b.distance) {
    return a.distance - b.distance
  }

  if (a.costBytes !== b.costBytes) {
    if (a.costBytes === null) return 1
    if (b.costBytes === null) return -1
    return a.costBytes - b.costBytes
  }

  return a.order - b.order
}
