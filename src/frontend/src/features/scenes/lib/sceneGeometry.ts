import type { SceneTransform, Vec3 } from '../types'

/**
 * Where an asset's bounding box sits relative to the node's origin, in the
 * node's own space.
 *
 * The measured fraction wins over the three-way convention label for the same
 * reason it does on the server (`SceneSpatial.OriginOffset`): the label is null
 * for every origin that is not one of three exact conventions - 46% of the
 * library - and reading a null label as "centered" is what drew boxes half a
 * height below their asset.
 *
 * Shared rather than copied because two things in the viewport draw this box -
 * the selection outline and blockout mode - and a scene where the outline and
 * the volume disagree tells the user something false about both.
 */
export function boundsOffset(
  bounds: Vec3,
  originConvention: string | null,
  originInBounds: Vec3 | null
): [number, number, number] {
  if (originInBounds) {
    return [
      (0.5 - originInBounds.x) * bounds.x,
      (0.5 - originInBounds.y) * bounds.y,
      (0.5 - originInBounds.z) * bounds.z,
    ]
  }

  if (originConvention === 'bottom-center') {
    return [0, bounds.y / 2, 0]
  }

  if (originConvention === 'corner') {
    return [bounds.x / 2, bounds.y / 2, bounds.z / 2]
  }

  return [0, 0, 0]
}

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
