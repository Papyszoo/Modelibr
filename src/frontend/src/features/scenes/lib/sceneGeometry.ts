import type { SceneTransform, Vec3 } from '../types'

function vectorsEqual(a: Vec3, b: Vec3): boolean {
  return a.x === b.x && a.y === b.y && a.z === b.z
}

/**
 * Whether two transforms are the same.
 *
 * Used to decide whether the server's derived numbers for a node - its
 * footprint and how far it sits off the ground - still describe the draft. The
 * editor deliberately does not recompute them: the server owns that geometry
 * (rotation included), and a second implementation here would be a second
 * answer to the same question, which is exactly the drift the generated
 * contract exists to avoid.
 */
export function transformsEqual(
  a: SceneTransform | null | undefined,
  b: SceneTransform | null | undefined
): boolean {
  if (!a || !b) {
    return false
  }

  return (
    vectorsEqual(a.position, b.position) &&
    vectorsEqual(a.rotationEuler, b.rotationEuler) &&
    vectorsEqual(a.scale, b.scale)
  )
}
