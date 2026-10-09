import type * as THREE from 'three'
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'

/**
 * Clone a loaded model scene graph with three's SkeletonUtils.
 *
 * `Object3D.clone()` shares one `Skeleton` between every copy, so a rigged
 * model placed twice (two scene instances, or the same asset in two panels)
 * moves both from whichever skeleton an AnimationMixer happens to drive. This
 * clones the graph and rebinds each `SkinnedMesh` to its own copy of the bones.
 * Geometries and materials are still shared with the source, so the existing
 * disposal rules (dispose the materials the clone introduced, never the shared
 * geometry/loaded textures) continue to hold.
 */
export function cloneSkinnedModel(object: THREE.Object3D): THREE.Object3D {
  return cloneSkinned(object)
}
