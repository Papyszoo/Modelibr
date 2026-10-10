import * as THREE from 'three'

import type { MaterialDto } from '@/features/materials/api/materialApi'

import { applyMaterialEffects, parseMaterialEffects } from './materialEffects'
import { mergeMaterialChannels } from './mergeMaterialChannels'
import { getMeshMaterialNames } from './textureSetMaterial'

/**
 * Parameter materials to apply to one placement, keyed by the model's material
 * slot name. The empty-string key is the default binding: it dresses every slot
 * no other key names, which is the same layering the scene document uses.
 */
export type SlotMaterials = Record<string, MaterialDto>

/**
 * What building a parameter material actually reads: its name, its factors and
 * its effects. Narrower than `MaterialDto` so a live draft (the material editor's
 * preview) can build one without inventing an id or timestamps.
 */
export type ParameterMaterialSource = Pick<
  MaterialDto,
  'name' | 'parameters' | 'effects'
>

/**
 * Builds a three.js material from stored PBR factors.
 *
 * The factors are linear, which is what three.js wants for a colour set through
 * `setRGB` - converting to sRGB here would wash every material out by the same
 * amount the API already converted for.
 */
export function buildParameterMaterial(
  material: ParameterMaterialSource
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

  // Runtime effects are injected into this same material (never a replacement),
  // composed with any onBeforeCompile already on it. An absent or invalid
  // document is a no-op.
  const effects = parseMaterialEffects(material.effects)
  if (effects) applyMaterialEffects(built, effects)

  return built
}

/**
 * Applies parameter materials to a cloned object, slot by slot.
 *
 * Runs after the texture-set pass so the two layer predictably when a node uses
 * both: a tiling material on the frame, a colour on the cushions. Returns the
 * materials it created so the caller can dispose them - a clone shares its
 * materials with the source object, and disposing indiscriminately would blank
 * every other placement of the same asset.
 *
 * One material is built PER MESH, never once per slot and shared. The merge
 * below carries each mesh's own maps and COLOR_0 onto the parameter material,
 * and a shared instance would be mutated by the first mesh to reach it: every
 * later mesh in the same slot would then wear the first one's texture, with
 * `if (next[channel]) continue` silently keeping it. The default '' binding is
 * where that is most visible - differently textured meshes all wearing the
 * first mesh's map.
 */
export function applyParameterMaterials(
  root: THREE.Object3D,
  slotMaterials: SlotMaterials
): THREE.MeshPhysicalMaterial[] {
  const slots = Object.keys(slotMaterials)
  if (slots.length === 0) {
    return []
  }

  const fallbackSlot = '' in slotMaterials ? '' : null
  const created: THREE.MeshPhysicalMaterial[] = []

  root.traverse(child => {
    const mesh = child as THREE.Mesh
    if (!mesh.isMesh) return

    // A named slot wins over the default binding, whichever order they were
    // declared in - "the cushions" is more specific than "the sofa".
    const named = getMeshMaterialNames(mesh).find(name => name in slotMaterials)
    const slot = named ?? fallbackSlot
    if (slot === null) return

    const material = buildParameterMaterial(slotMaterials[slot])
    created.push(material)

    // Carries the model's own maps and COLOR_0 onto the parameter material:
    // it only overrides the factors it stores, never the texture channels.
    const original = mesh.material
    mesh.material = material
    mergeMaterialChannels(original, material, mesh.geometry)

    // normalScale and aoMapIntensity are stored, validated and editable but the
    // merge above copies the SOURCE's scalars onto any channel it fills, which
    // would silently drop the material's own. Re-applied after the merge so the
    // sliders and validation describe what actually renders. Harmless when the
    // mesh has no normal/AO map: three only reads them with one.
    const parameters = slotMaterials[slot].parameters
    material.normalScale.set(parameters.normalScale, parameters.normalScale)
    material.aoMapIntensity = parameters.occlusionStrength
  })

  return created
}
