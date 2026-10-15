import type * as THREE from 'three'

function collectMaterials(root: THREE.Object3D): Set<THREE.Material> {
  const materials = new Set<THREE.Material>()
  root.traverse(child => {
    const mesh = child as THREE.Mesh
    if (!mesh.isMesh) return
    for (const material of Array.isArray(mesh.material)
      ? mesh.material
      : [mesh.material]) {
      if (material) {
        materials.add(material)
      }
    }
  })
  return materials
}

/**
 * Disposes the materials a clone introduced, and only those.
 *
 * `Object3D.clone` shares materials with the source object, and a build that
 * replaces nothing (a wildcard binding whose textures have not arrived, or
 * `preserveMaterials`) leaves the clone wearing the source's own materials.
 * Disposing indiscriminately would blank the original - and every other
 * placement of the same asset, plus any open viewer. Geometries are not touched
 * for the same reason: they are shared with the source.
 */
export function disposeClonedMaterials(
  clone: THREE.Object3D,
  source: THREE.Object3D
): void {
  const shared = collectMaterials(source)
  for (const material of collectMaterials(clone)) {
    if (!shared.has(material)) {
      material.dispose()
    }
  }
}
