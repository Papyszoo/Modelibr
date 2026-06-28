import * as THREE from 'three'
import * as THREE_GPU from 'three/webgpu'

import {
  addSharedDisplacementNormal,
  applyDispNormalDisplacementNode,
} from '@/shared/three/sharedDisplacementNormal'
import { type TextureSetDto } from '@/types'

import {
  ensureAoMapUv2,
  resolveTextureMaterialConfig,
} from '../../../../../asset-processor/lib/textureMaterial.js'

/**
 * The viewer renders with a WebGPURenderer, so materials are Node materials
 * (MeshPhysicalNodeMaterial). It maps every standard PBR slot exactly like
 * MeshPhysicalMaterial, and additionally lets the displacement push along the
 * shared `aDispNormal` direction via a TSL positionNode.
 */
type ViewerMaterial = THREE_GPU.MeshPhysicalNodeMaterial

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
): ViewerMaterial {
  const get = (slot: string) =>
    loadedTextures[`${materialPrefix}${KEY_SEP}${slot}`] ?? null

  // Shared gating rule (asset-processor/lib/textureMaterial.js — the same rule
  // the worker thumbnail uses). Gating metalness/roughness on their OWN maps,
  // not on the base-color map, is what stops a textured-but-not-metal surface
  // from rendering as a black mirror in the viewer.
  const cfg = resolveTextureMaterialConfig({
    baseColorMap: get('map'),
    metalnessMap: get('metalnessMap'),
    roughnessMap: get('roughnessMap'),
    specularColorMap: get('specularColorMap'),
  })

  const material = new THREE_GPU.MeshPhysicalNodeMaterial({
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
  const displacementMap = get('displacementMap')
  if (displacementMap) {
    // Push along an averaged-by-position normal (aDispNormal) rather than the
    // face-aligned objectNormal — so hard-edged meshes (game-asset cubes etc.)
    // stay watertight under displacement while keeping their original per-face
    // UVs intact for color sampling. Bias by -scale/2 so heightmap mid-grey
    // means "no displacement". On WebGPU this is a TSL positionNode; the native
    // displacementMap slot is left unset so it doesn't ALSO displace along the
    // per-vertex normal.
    applyDispNormalDisplacementNode(material, displacementMap, 0.02, -0.01)
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
  const builtMaterials: Record<string, ViewerMaterial> = {}
  if (texturesReady) {
    for (const matName of materialNames) {
      builtMaterials[matName] = buildMaterialFromTextures(
        loadedTextures,
        matName
      )
    }
  }

  // Shared fallback material for unmatched meshes (avoids per-mesh allocation)
  const fallbackMaterial = new THREE_GPU.MeshPhysicalNodeMaterial({
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
    let appliedMaterial: ViewerMaterial | null = null
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
    // lights still work — which made the ambient/environment controls look
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
