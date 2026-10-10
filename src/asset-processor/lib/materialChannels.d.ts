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

/**
 * Clone `next` and fill its missing channels from `original`. Use when `next` is
 * shared across meshes (e.g. the default '' texture-set binding): merging into
 * the shared instance would let the first mesh's map win for the rest. Textures
 * stay shared by reference. Returns the per-mesh clone.
 */
export function mergeMaterialChannelsPerMesh<T extends THREE.Material>(
  original: THREE.Material | THREE.Material[] | null | undefined,
  next: T,
  geometry?: THREE.BufferGeometry | null
): T
