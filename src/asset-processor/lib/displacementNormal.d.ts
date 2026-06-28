/**
 * Type declarations for the shared displacement-normal helpers. Implementation
 * in `./displacementNormal.js` is plain ESM; this shim lets the TypeScript
 * frontend (via the `sharedDisplacementNormal.ts` wrapper) import it without
 * `// @ts-expect-error`.
 */
import type * as THREE from 'three'

export function addSharedDisplacementNormal(
  // Only BufferAttribute is constructed, so callers may inject the full `three`
  // namespace or a subset.
  three: Pick<typeof THREE, 'BufferAttribute'>,
  geometry: THREE.BufferGeometry,
  tolerance?: number
): THREE.BufferGeometry

export function applyDispNormalDisplacement(material: THREE.Material): void

/**
 * WebGPU/TSL equivalent of {@link applyDispNormalDisplacement}: expresses the
 * `aDispNormal`-directed displacement as a `positionNode` on a Node material
 * (WebGPURenderer ignores the `onBeforeCompile` GLSL hook). `TSL` is `three/tsl`.
 */
export function applyDispNormalDisplacementNode(args: {
  THREE?: unknown
  TSL: unknown
  material: THREE.Material
  displacementMap: THREE.Texture
  displacementScale?: number
  displacementBias?: number
}): void
