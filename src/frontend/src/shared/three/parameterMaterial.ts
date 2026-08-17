import * as THREE from 'three'

import type { MaterialDto } from '@/features/materials/api/materialApi'

/**
 * Parameter materials to apply to one placement, keyed by the model's material
 * slot name. The empty-string key is the default binding: it dresses every slot
 * no other key names, which is the same layering the scene document uses.
 */
export type SlotMaterials = Record<string, MaterialDto>

/**
 * Builds a three.js material from stored PBR factors.
 *
 * The factors are linear, which is what three.js wants for a colour set through
 * `setRGB` - converting to sRGB here would wash every material out by the same
 * amount the API already converted for.
 */
export function buildParameterMaterial(
  material: MaterialDto
): THREE.MeshPhysicalMaterial {
  const p = material.parameters
  const built = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color().setRGB(
      p.baseColorR,
      p.baseColorG,
      p.baseColorB,
      THREE.LinearSRGBColorSpace
    ),
    roughness: p.roughness,
    metalness: p.metallic,
    emissive: new THREE.Color().setRGB(
      p.emissiveR,
      p.emissiveG,
      p.emissiveB,
      THREE.LinearSRGBColorSpace
    ),
    ior: p.ior,
    side: p.doubleSided ? THREE.DoubleSide : THREE.FrontSide,
  })

  built.name = material.name

  // Opacity only reads as transparency in Blend mode. Setting it regardless
  // would make an opaque material with alpha < 1 silently see-through, which is
  // the difference between glTF's alphaMode and "an opacity slider".
  if (p.alphaMode === 'Blend') {
    built.transparent = true
    built.opacity = p.baseColorA
  } else if (p.alphaMode === 'Mask') {
    built.alphaTest = p.alphaCutoff
  }

  return built
}

function meshMaterialNames(mesh: THREE.Mesh): string[] {
  const materials = Array.isArray(mesh.material)
    ? mesh.material
    : [mesh.material]
  return materials.map(material => material?.name ?? '').filter(Boolean)
}

/**
 * Applies parameter materials to a cloned object, slot by slot.
 *
 * Runs after the texture-set pass so the two layer predictably when a node uses
 * both: a tiling material on the frame, a colour on the cushions. Returns the
 * materials it created so the caller can dispose them - a clone shares its
 * materials with the source object, and disposing indiscriminately would blank
 * every other placement of the same asset.
 */
export function applyParameterMaterials(
  root: THREE.Object3D,
  slotMaterials: SlotMaterials
): THREE.MeshPhysicalMaterial[] {
  const slots = Object.keys(slotMaterials)
  if (slots.length === 0) {
    return []
  }

  const built = new Map<string, THREE.MeshPhysicalMaterial>()
  for (const slot of slots) {
    built.set(slot, buildParameterMaterial(slotMaterials[slot]))
  }

  const fallback = built.get('')

  root.traverse(child => {
    const mesh = child as THREE.Mesh
    if (!mesh.isMesh) return

    // A named slot wins over the default binding, whichever order they were
    // declared in - "the cushions" is more specific than "the sofa".
    const named = meshMaterialNames(mesh).find(name => built.has(name))
    const material = named ? built.get(named) : fallback

    if (material) {
      mesh.material = material
    }
  })

  return [...built.values()]
}
