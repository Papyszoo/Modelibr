/**
 * Type declarations for the shared material-channel merge rule.
 * Implementation in `./materialChannels.js` is plain ESM; this shim lets the
 * TypeScript frontend import it without `// @ts-expect-error`.
 */
import type * as THREE from 'three'

/**
 * Fill any channel the Modelibr material leaves unset from the loaded model's
 * original material, and set vertex colours from the geometry's `color`
 * attribute (glTF `COLOR_0`). Mutates and returns `next`. Generic over the
 * material type so the viewer's `MeshPhysicalMaterial` and the demo worker's
 * `MeshStandardMaterial` both keep their concrete type.
 */
export function mergeMaterialChannels<T extends THREE.Material>(
  original: THREE.Material | THREE.Material[] | null | undefined,
  next: T,
  geometry?: THREE.BufferGeometry | null
): T
