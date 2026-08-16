import { useMemo } from 'react'
import * as THREE from 'three'

import {
  type TextureConfig,
  useChannelExtractedTextures,
} from '@/features/model-viewer/hooks/useChannelExtractedTextures'
import { getFileUrl } from '@/features/models/api/modelApi'
import { TextureChannel, type TextureSetDto, TextureType } from '@/types'

import {
  MATERIAL_SLOT_BY_TEXTURE_TYPE,
  textureTypeNeedsInvert,
} from '../../../../asset-processor/lib/textureChannels.js'
import {
  ensureAoMapUv2,
  resolveTextureMaterialConfig,
} from '../../../../asset-processor/lib/textureMaterial.js'
import {
  addSharedDisplacementNormal,
  applyDispNormalDisplacement,
} from './sharedDisplacementNormal'

/** Map of material names to their texture sets. Key "" means apply to all meshes. */
export type MaterialTextureSets = Record<string, TextureSetDto>

/** Separator for the namespaced "materialName::slot" loaded-texture keys. */
export const KEY_SEP = '::'

/** Get the material names from a mesh (handles arrays). */
function getMeshMaterialNames(mesh: THREE.Mesh): string[] {
  const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
  return mats.map(m => m?.name ?? '').filter(Boolean)
}

/**
 * Build a MeshPhysicalMaterial from loaded textures for a given material key
 * prefix. Exported for the material-pipeline regression tests.
 */
export function buildMaterialFromTextures(
  loadedTextures: Record<string, THREE.Texture | null>,
  materialPrefix: string
): THREE.MeshPhysicalMaterial {
  const get = (slot: string) =>
    loadedTextures[`${materialPrefix}${KEY_SEP}${slot}`] ?? null

  // Shared gating rule (asset-processor/lib/textureMaterial.js - the same rule
  // the worker thumbnail uses). Gating metalness/roughness on their OWN maps,
  // not on the base-color map, is what stops a textured-but-not-metal surface
  // from rendering as a black mirror in the viewer.
  const cfg = resolveTextureMaterialConfig({
    baseColorMap: get('map'),
    metalnessMap: get('metalnessMap'),
    roughnessMap: get('roughnessMap'),
    specularColorMap: get('specularColorMap'),
  })

  const material = new THREE.MeshPhysicalMaterial({
    color: cfg.hasBaseColorMap ? 0xffffff : new THREE.Color(0.7, 0.7, 0.9),
    metalness: cfg.metalness,
    roughness: cfg.roughness,
    envMapIntensity: cfg.envMapIntensity,
    specularIntensity: cfg.specularIntensity,
  })

  if (get('map')) material.map = get('map')
  if (get('normalMap')) material.normalMap = get('normalMap')
  if (get('roughnessMap')) material.roughnessMap = get('roughnessMap')
  if (get('metalnessMap')) material.metalnessMap = get('metalnessMap')
  if (get('specularColorMap')) {
    material.specularColorMap = get('specularColorMap')
  }
  if (get('aoMap')) material.aoMap = get('aoMap')
  if (get('emissiveMap')) {
    material.emissiveMap = get('emissiveMap')
    material.emissive = new THREE.Color(0xffffff)
  }
  if (get('bumpMap')) material.bumpMap = get('bumpMap')
  if (get('alphaMap')) {
    material.alphaMap = get('alphaMap')
    material.transparent = true
  }
  if (get('displacementMap')) {
    material.displacementMap = get('displacementMap')
    // Bias by -scale/2 so heightmap mid-grey means "no displacement".
    material.displacementScale = 0.02
    material.displacementBias = -0.01
    // Sample displacement direction from an averaged-by-position normal
    // attribute rather than the face-aligned objectNormal - so hard-edged
    // meshes (game-asset cubes etc.) stay watertight under displacement
    // while keeping their original per-face UVs intact for color sampling.
    applyDispNormalDisplacement(material)
  }

  return material
}

/**
 * Apply per-material textures to a cloned model.
 * If a material name matches a key in materialTextureSets, that mesh gets textured.
 * A key of "" is a wildcard that applies to meshes with no specific mapping.
 * Exported for the material-pipeline regression tests.
 */
export function applyMaterialTextures(
  clonedModel: THREE.Group | THREE.Object3D,
  materialTextureSets: MaterialTextureSets,
  loadedTextures: Record<string, THREE.Texture | null>,
  texturesReady: boolean
) {
  const materialNames = Object.keys(materialTextureSets)
  const hasWildcard = materialNames.includes('')

  // Pre-build materials for each material name that has textures
  const builtMaterials: Record<string, THREE.MeshPhysicalMaterial> = {}
  if (texturesReady) {
    for (const matName of materialNames) {
      builtMaterials[matName] = buildMaterialFromTextures(
        loadedTextures,
        matName
      )
    }
  }

  // Shared fallback material for unmatched meshes (avoids per-mesh allocation)
  const fallbackMaterial = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(0.7, 0.7, 0.9),
    metalness: 0.3,
    roughness: 0.4,
    envMapIntensity: 1.0,
    specularIntensity: 0,
  })

  clonedModel.traverse(child => {
    if (!child.isMesh) return
    const mesh = child as THREE.Mesh
    mesh.castShadow = true
    mesh.receiveShadow = true

    const meshMatNames = getMeshMaterialNames(mesh)

    // Find matching material: check mesh material names against our map
    let matched = false
    let appliedMaterial: THREE.MeshPhysicalMaterial | null = null
    for (const meshMatName of meshMatNames) {
      if (meshMatName in builtMaterials) {
        appliedMaterial = builtMaterials[meshMatName]
        mesh.material = appliedMaterial
        matched = true
        break
      }
    }

    // Fallback: use wildcard "" material (applies to all unmatched meshes)
    if (!matched && hasWildcard && texturesReady) {
      appliedMaterial = builtMaterials['']
      mesh.material = appliedMaterial
    }

    // Strip embedded materials from unmatched meshes to match worker behavior
    if (!matched && !hasWildcard) {
      mesh.material = fallbackMaterial
    }

    // AO maps sample the second UV set. Without uv2 the AO term collapses to
    // ~0 and kills ALL indirect light (ambient + environment IBL) while direct
    // lights still work - which made the ambient/environment controls look
    // inert. Copy uv -> uv2 like the worker thumbnail does.
    if (appliedMaterial?.aoMap) {
      ensureAoMapUv2(mesh.geometry)
    }

    // Add the shared-displacement-normal attribute when this mesh is about
    // to be displaced. The shader uses this attribute as the push direction
    // so hard-edged meshes (game-asset cubes etc.) stay watertight along
    // seams while keeping their original per-face UVs / normals intact for
    // color shading. Idempotent: skipped if the attribute already exists.
    if (appliedMaterial?.displacementMap) {
      addSharedDisplacementNormal(mesh.geometry)
    }
  })
}

// Texture types in apply order, each with its fallback when the primary is
// absent (mutually-exclusive groups: Roughness<-Glossiness, Displacement<-Height).
// The MeshPhysicalMaterial slot each type feeds and whether it must be inverted
// at load come from the shared cross-runtime map
// (asset-processor/lib/textureChannels.js) - the same source the worker
// thumbnail uses, so every viewer and the thumbnail route textures identically.
const TEXTURE_SLOTS: Array<{
  type: TextureType
  fallback?: TextureType
}> = [
  { type: TextureType.Albedo },
  { type: TextureType.Normal },
  { type: TextureType.Roughness, fallback: TextureType.Glossiness },
  { type: TextureType.Metallic },
  { type: TextureType.Specular },
  { type: TextureType.AO },
  { type: TextureType.Emissive },
  { type: TextureType.Bump },
  { type: TextureType.Alpha },
  { type: TextureType.Displacement, fallback: TextureType.Height },
]

/**
 * Build a combined texture config map for all material->textureSet mappings.
 * Keys are namespaced as "materialName::slotName" so the hook loads everything
 * in one pass.
 */
export function buildCombinedTextureConfigs(
  materialTextureSets: MaterialTextureSets
): Record<string, TextureConfig> {
  const configs: Record<string, TextureConfig> = {}

  for (const [materialName, textureSet] of Object.entries(
    materialTextureSets
  )) {
    if (!textureSet?.textures) continue
    for (const { type, fallback } of TEXTURE_SLOTS) {
      const slot = MATERIAL_SLOT_BY_TEXTURE_TYPE[type]
      let tex = textureSet.textures.find(t => t.textureType === type)
      let chosenType = type
      if (!tex && fallback) {
        const fallbackTex = textureSet.textures.find(
          t => t.textureType === fallback
        )
        if (fallbackTex) {
          tex = fallbackTex
          chosenType = fallback
        }
      }
      if (tex) {
        configs[`${materialName}${KEY_SEP}${slot}`] = {
          url: getFileUrl(tex.fileId.toString()),
          sourceChannel: tex.sourceChannel ?? TextureChannel.RGB,
          fileName: tex.fileName,
          // Glossiness feeds roughnessMap inverted (shared rule).
          invert: textureTypeNeedsInvert(chosenType),
        }
      }
    }
  }

  return configs
}

/**
 * Loads every channel a set of material->textureSet mappings needs, and reports
 * when they are ready to build materials from.
 *
 * Safe to call inside `<Canvas>`: it touches only three.js and the renderer, no
 * React context from the surrounding app.
 */
export function usePerMaterialTextures(
  materialTextureSets: MaterialTextureSets,
  renderer: THREE.WebGLRenderer,
  flipY: boolean
): {
  loadedTextures: Record<string, THREE.Texture | null>
  texturesReady: boolean
} {
  const textureConfigs = useMemo(
    () => buildCombinedTextureConfigs(materialTextureSets),
    [materialTextureSets]
  )
  const hasTextures = Object.keys(textureConfigs).length > 0
  const loadedTextures = useChannelExtractedTextures(
    textureConfigs,
    renderer,
    flipY
  )
  const texturesReady = hasTextures && Object.keys(loadedTextures).length > 0
  return { loadedTextures, texturesReady }
}
