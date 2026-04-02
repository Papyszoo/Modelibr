import { useFrame, useLoader, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader'

import {
  type TextureConfig,
  useChannelExtractedTextures,
} from '@/features/model-viewer/hooks/useChannelExtractedTextures'
import { useModelObject } from '@/features/model-viewer/hooks/useModelObject'
import { getFileUrl } from '@/features/models/api/modelApi'
import { TextureChannel, type TextureSetDto, TextureType } from '@/types'

/** Map of material names to their texture sets. Key "" means apply to all meshes. */
export type MaterialTextureSets = Record<string, TextureSetDto>

interface TexturedModelProps {
  modelUrl: string
  fileExtension: string
  rotationSpeed: number
  materialTextureSets: MaterialTextureSets
}

// Material property slot names used by MeshStandardMaterial
const TEXTURE_SLOTS: Array<{
  slot: string
  type: TextureType
  fallback?: TextureType
}> = [
  { slot: 'map', type: TextureType.Albedo },
  { slot: 'normalMap', type: TextureType.Normal },
  { slot: 'roughnessMap', type: TextureType.Roughness },
  { slot: 'metalnessMap', type: TextureType.Metallic },
  { slot: 'aoMap', type: TextureType.AO },
  { slot: 'emissiveMap', type: TextureType.Emissive },
  { slot: 'bumpMap', type: TextureType.Bump },
  { slot: 'alphaMap', type: TextureType.Alpha },
  {
    slot: 'displacementMap',
    type: TextureType.Displacement,
    fallback: TextureType.Height,
  },
]

const KEY_SEP = '::'

/**
 * Build a combined texture config map for all material→textureSet mappings.
 * Keys are namespaced as "materialName::slotName" so the hook loads everything in one pass.
 * Also returns the set of material names that have textures.
 */
function buildCombinedTextureConfigs(
  materialTextureSets: MaterialTextureSets
): Record<string, TextureConfig> {
  const configs: Record<string, TextureConfig> = {}

  for (const [materialName, textureSet] of Object.entries(
    materialTextureSets
  )) {
    if (!textureSet?.textures) continue
    for (const { slot, type, fallback } of TEXTURE_SLOTS) {
      let tex = textureSet.textures.find(t => t.textureType === type)
      if (!tex && fallback) {
        tex = textureSet.textures.find(t => t.textureType === fallback)
      }
      if (tex) {
        configs[`${materialName}${KEY_SEP}${slot}`] = {
          url: getFileUrl(tex.fileId.toString()),
          sourceChannel: tex.sourceChannel ?? TextureChannel.RGB,
        }
      }
    }
  }

  return configs
}

/** Get the material names from a mesh (handles arrays). */
function getMeshMaterialNames(mesh: THREE.Mesh): string[] {
  const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
  return mats.map(m => m?.name ?? '').filter(Boolean)
}

/**
 * Build a MeshStandardMaterial from loaded textures for a given material key prefix.
 */
function buildMaterialFromTextures(
  loadedTextures: Record<string, THREE.Texture | null>,
  materialPrefix: string
): THREE.MeshStandardMaterial {
  const get = (slot: string) =>
    loadedTextures[`${materialPrefix}${KEY_SEP}${slot}`] ?? null
  const hasMap = get('map') !== null

  const material = new THREE.MeshStandardMaterial({
    color: hasMap ? 0xffffff : new THREE.Color(0.7, 0.7, 0.9),
    metalness: hasMap ? 1 : 0.3,
    roughness: hasMap ? 1 : 0.4,
    envMapIntensity: 1.0,
  })

  if (get('map')) material.map = get('map')
  if (get('normalMap')) material.normalMap = get('normalMap')
  if (get('roughnessMap')) material.roughnessMap = get('roughnessMap')
  if (get('metalnessMap')) material.metalnessMap = get('metalnessMap')
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
  if (get('displacementMap')) material.displacementMap = get('displacementMap')

  return material
}

/**
 * Apply per-material textures to a cloned model.
 * If a material name matches a key in materialTextureSets, that mesh gets textured.
 * A key of "" is a wildcard that applies to meshes with no specific mapping.
 */
function applyMaterialTextures(
  clonedModel: THREE.Group | THREE.Object3D,
  materialTextureSets: MaterialTextureSets,
  loadedTextures: Record<string, THREE.Texture | null>,
  texturesReady: boolean
) {
  const materialNames = Object.keys(materialTextureSets)
  const hasWildcard = materialNames.includes('')

  // Pre-build materials for each material name that has textures
  const builtMaterials: Record<string, THREE.MeshStandardMaterial> = {}
  if (texturesReady) {
    for (const matName of materialNames) {
      builtMaterials[matName] = buildMaterialFromTextures(
        loadedTextures,
        matName
      )
    }
  }

  clonedModel.traverse(child => {
    if (!child.isMesh) return
    child.castShadow = true
    child.receiveShadow = true

    const meshMatNames = getMeshMaterialNames(child as THREE.Mesh)

    // Find matching material: check mesh material names against our map
    let matched = false
    for (const meshMatName of meshMatNames) {
      if (meshMatName in builtMaterials) {
        ;(child as THREE.Mesh).material = builtMaterials[meshMatName]
        matched = true
        break
      }
    }

    // Fallback: use wildcard "" material (applies to all unmatched meshes)
    if (!matched && hasWildcard && texturesReady) {
      ;(child as THREE.Mesh).material = builtMaterials['']
    }

    // Strip embedded materials from unmatched meshes to match worker behavior
    if (!matched && !hasWildcard) {
      ;(child as THREE.Mesh).material = new THREE.MeshStandardMaterial({
        color: new THREE.Color(0.7, 0.7, 0.9),
        metalness: 0.3,
        roughness: 0.4,
        envMapIntensity: 1.0,
      })
    }
  })
}

// Shared props for per-format components
interface FormatComponentProps {
  modelUrl: string
  rotationSpeed: number
  materialTextureSets: MaterialTextureSets
}

/** Shared hook: build combined configs, load textures, return ready state */
function usePerMaterialTextures(
  materialTextureSets: MaterialTextureSets,
  renderer: THREE.WebGLRenderer,
  flipY: boolean
) {
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

/** Shared logic: clone model, apply per-material textures, scale and center */
function setupModel(
  model: THREE.Group | THREE.Object3D,
  materialTextureSets: MaterialTextureSets,
  loadedTextures: Record<string, THREE.Texture | null>,
  texturesReady: boolean,
  meshRef: React.RefObject<THREE.Group | null>,
  scaledRef: React.MutableRefObject<boolean>
) {
  if (!model || scaledRef.current) return

  const clonedModel = model.clone()

  applyMaterialTextures(
    clonedModel,
    materialTextureSets,
    loadedTextures,
    texturesReady
  )

  // Scale and position
  const box = new THREE.Box3().setFromObject(clonedModel)
  const size = box.getSize(new THREE.Vector3())
  const maxDim = Math.max(size.x, size.y, size.z)
  const scale = 2 / maxDim

  clonedModel.scale.setScalar(scale)

  const scaledBox = new THREE.Box3().setFromObject(clonedModel)
  const scaledCenter = scaledBox.getCenter(new THREE.Vector3())

  clonedModel.position.x = -scaledCenter.x
  clonedModel.position.z = -scaledCenter.z
  clonedModel.position.y = -scaledBox.min.y

  if (meshRef.current) {
    meshRef.current.clear()
    meshRef.current.add(clonedModel)
  }

  scaledRef.current = true
}

// OBJ Model with per-material textures
function OBJModelWithTextures({
  modelUrl,
  rotationSpeed,
  materialTextureSets,
}: FormatComponentProps) {
  const meshRef = useRef<THREE.Group>(null)
  const { setModelObject } = useModelObject()
  const scaledRef = useRef(false)
  const { gl: renderer } = useThree()

  useFrame(() => {
    if (meshRef.current && rotationSpeed > 0) {
      meshRef.current.rotation.y += rotationSpeed
    }
  })

  const model = useLoader(OBJLoader, modelUrl)
  const { loadedTextures, texturesReady } = usePerMaterialTextures(
    materialTextureSets,
    renderer,
    true
  )

  useEffect(() => {
    scaledRef.current = false
  }, [modelUrl, materialTextureSets, texturesReady])

  useEffect(() => {
    setupModel(
      model,
      materialTextureSets,
      loadedTextures,
      texturesReady,
      meshRef,
      scaledRef
    )
  }, [model, materialTextureSets, loadedTextures, texturesReady])

  useEffect(() => {
    if (model) setModelObject(model)
    return () => setModelObject(null)
  }, [model, setModelObject])

  return <group ref={meshRef} />
}

// GLTF Model with per-material textures
function GLTFModelWithTextures({
  modelUrl,
  rotationSpeed,
  materialTextureSets,
}: FormatComponentProps) {
  const meshRef = useRef<THREE.Group>(null)
  const { setModelObject } = useModelObject()
  const scaledRef = useRef(false)
  const { gl: renderer } = useThree()

  useFrame(() => {
    if (meshRef.current && rotationSpeed > 0) {
      meshRef.current.rotation.y += rotationSpeed
    }
  })

  const gltf = useLoader(GLTFLoader, modelUrl)
  const model = gltf?.scene
  const { loadedTextures, texturesReady } = usePerMaterialTextures(
    materialTextureSets,
    renderer,
    false
  )

  useEffect(() => {
    scaledRef.current = false
  }, [modelUrl, materialTextureSets, texturesReady])

  useEffect(() => {
    if (model)
      setupModel(
        model,
        materialTextureSets,
        loadedTextures,
        texturesReady,
        meshRef,
        scaledRef
      )
  }, [model, materialTextureSets, loadedTextures, texturesReady])

  useEffect(() => {
    if (model) setModelObject(model)
    return () => setModelObject(null)
  }, [model, setModelObject])

  return <group ref={meshRef} />
}

// FBX Model with per-material textures
function FBXModelWithTextures({
  modelUrl,
  rotationSpeed,
  materialTextureSets,
}: FormatComponentProps) {
  const meshRef = useRef<THREE.Group>(null)
  const { setModelObject } = useModelObject()
  const scaledRef = useRef(false)
  const { gl: renderer } = useThree()

  useFrame(() => {
    if (meshRef.current && rotationSpeed > 0) {
      meshRef.current.rotation.y += rotationSpeed
    }
  })

  const model = useLoader(FBXLoader, modelUrl)
  const { loadedTextures, texturesReady } = usePerMaterialTextures(
    materialTextureSets,
    renderer,
    true
  )

  useEffect(() => {
    scaledRef.current = false
  }, [modelUrl, materialTextureSets, texturesReady])

  useEffect(() => {
    setupModel(
      model,
      materialTextureSets,
      loadedTextures,
      texturesReady,
      meshRef,
      scaledRef
    )
  }, [model, materialTextureSets, loadedTextures, texturesReady])

  useEffect(() => {
    if (model) setModelObject(model)
    return () => setModelObject(null)
  }, [model, setModelObject])

  return <group ref={meshRef} />
}

export function TexturedModel({
  modelUrl,
  fileExtension,
  rotationSpeed,
  materialTextureSets,
}: TexturedModelProps) {
  if (fileExtension === 'obj') {
    return (
      <OBJModelWithTextures
        modelUrl={modelUrl}
        rotationSpeed={rotationSpeed}
        materialTextureSets={materialTextureSets}
      />
    )
  }
  if (fileExtension === 'fbx') {
    return (
      <FBXModelWithTextures
        modelUrl={modelUrl}
        rotationSpeed={rotationSpeed}
        materialTextureSets={materialTextureSets}
      />
    )
  }
  if (fileExtension === 'gltf' || fileExtension === 'glb') {
    return (
      <GLTFModelWithTextures
        modelUrl={modelUrl}
        rotationSpeed={rotationSpeed}
        materialTextureSets={materialTextureSets}
      />
    )
  }
  return null
}
