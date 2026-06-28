import * as THREE from 'three'

import {
  addSharedDisplacementNormal as addSharedImpl,
  applyDispNormalDisplacement as applyDispNormalImpl,
} from '../../../../asset-processor/lib/displacementNormal.js'

/**
 * Frontend wrapper over the shared cross-runtime displacement-normal helpers
 * (`asset-processor/lib/displacementNormal.js`) — the same source the worker
 * thumbnail uses, so hard-edged displaced meshes shade identically in both.
 *
 * The shared module injects THREE; this wrapper passes the bundler's instance so
 * every existing call site keeps the original no-THREE signature. See the shared
 * module for the full rationale (averaging the displacement direction across
 * coincident-position vertex duplicates instead of welding, to keep per-face UV
 * islands intact and avoid the one-triangle texture-smear band along edges).
 */

/**
 * Compute averaged-by-position normals and store them on the geometry as
 * `aDispNormal`. Returns the same geometry. Idempotent; a no-op without
 * position/normal attributes.
 */
export function addSharedDisplacementNormal(
  geometry: THREE.BufferGeometry,
  tolerance = 1e-4
): THREE.BufferGeometry {
  return addSharedImpl(THREE, geometry, tolerance)
}

/**
 * Swap the displacement direction from `objectNormal` to the `aDispNormal`
 * attribute via an `onBeforeCompile` hook. Idempotent on the same material.
 */
export const applyDispNormalDisplacement: (material: THREE.Material) => void =
  applyDispNormalImpl
