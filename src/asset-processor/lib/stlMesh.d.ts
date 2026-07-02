/**
 * Type declarations for the shared STL mesh builder. Implementation in
 * `./stlMesh.js` is plain ESM; this shim lets TS-aware callers (the frontend)
 * import it without `// @ts-expect-error`.
 */
import type * as THREE from 'three'

export interface BuildStlModelOptions {
  /**
   * Base color (hex) for STL geometry without vertex colors. Defaults to the
   * app's neutral surface.
   */
  neutralColor?: number
}

export function buildStlModel(
  // Only this subset is used, so callers may inject either the full `three`
  // namespace or just these constructors (e.g. tree-shaken named imports).
  three: Pick<typeof THREE, 'MeshStandardMaterial' | 'Mesh' | 'Group'>,
  geometry: THREE.BufferGeometry,
  options?: BuildStlModelOptions
): THREE.Group
