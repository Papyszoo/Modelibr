import { useFrame, useLoader, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { ThreeMFLoader } from 'three/examples/jsm/loaders/3MFLoader'
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader'

import {
  type TextureConfig,
  useChannelExtractedTextures,
} from '@/features/model-viewer/hooks/useChannelExtractedTextures'
import { useModelObject } from '@/features/model-viewer/hooks/useModelObject'
import { getFileUrl } from '@/features/models/api/modelApi'
import { safeLoadingManager } from '@/shared/three/safeLoadingManager'
import {
  addSharedDisplacementNormal,
  applyDispNormalDisplacement,
} from '@/shared/three/sharedDisplacementNormal'
import { TextureChannel, type TextureSetDto, TextureType } from '@/types'

/** Map of material names to their texture sets. Key "" means apply to all meshes. */
export type MaterialTextureSets = Record<string, TextureSetDto>

interface TexturedModelProps {
  modelUrl: string
  fileExtension: string
  rotationSpeed: number
  materialTextureSets: MaterialTextureSets
}

// Material property slot names used by MeshPhysicalMaterial.
// `fallback` is used when the primary type is absent (mutually-exclusive groups).
// `invertFallback` means the fallback texture must be channel-inverted at load
// time (e.g. Glossiness fed through the roughnessMap slot).
const TEXTURE_SLOTS: Array<{
  slot: string
  type: TextureType
  fallback?: TextureType
  invertFallback?: boolean
}> = [
  { slot: 'map', type: TextureType.Albedo },
  { slot: 'normalMap', type: TextureType.Normal },
  {
    slot: 'roughnessMap',
    type: TextureType.Roughness,
    fallback: TextureType.Glossiness,
    invertFallback: true,
  },
  { slot: 'metalnessMap', type: TextureType.Metallic },
  { slot: 'specularColorMap', type: TextureType.Specular },
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
    for (const { slot, type, fallback, invertFallback } of TEXTURE_SLOTS) {
      let tex = textureSet.textures.find(t => t.textureType === type)
      let invert = false
      if (!tex && fallback) {
        tex = textureSet.textures.find(t => t.textureType === fallback)
        if (tex && invertFallback) invert = true
      }
      if (tex) {
        configs[`${materialName}${KEY_SEP}${slot}`] = {
          url: getFileUrl(tex.fileId.toString()),
          sourceChannel: tex.sourceChannel ?? TextureChannel.RGB,
          fileName: tex.fileName,
          invert,
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
 * Build a MeshPhysicalMaterial from loaded textures for a given material key prefix.
 */
function buildMaterialFromTextures(
  loadedTextures: Record<string, THREE.Texture | null>,
  materialPrefix: string
): THREE.MeshPhysicalMaterial {
  const get = (slot: string) =>
    loadedTextures[`${materialPrefix}${KEY_SEP}${slot}`] ?? null
  const hasMap = get('map') !== null

  const material = new THREE.MeshPhysicalMaterial({
    color: hasMap ? 0xffffff : new THREE.Color(0.7, 0.7, 0.9),
    metalness: hasMap ? 1 : 0.3,
    roughness: hasMap ? 1 : 0.4,
    envMapIntensity: 1.0,
    // MeshPhysicalMaterial enables a dielectric specular channel by default
    // (intensity=1, color=white). Without an explicit Specular texture we
    // want MeshStandardMaterial-equivalent behavior, otherwise the channel
    // adds a sheen that washes the albedo toward white.
    specularIntensity: get('specularColorMap') ? 1 : 0,
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
    // attribute rather than the face-aligned objectNormal — so hard-edged
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

  // Multiply, don't replace: FBX bakes a non-1 unit-conversion scale into
  // the root and setScalar would drop it, collapsing the model.
  clonedModel.scale.multiplyScalar(scale)

  const scaledBox = new THREE.Box3().setFromObject(clonedModel)
  const scaledCenter = scaledBox.getCenter(new THREE.Vector3())

  // Subtract (not assign): FBX bakes a non-zero translation into the root,
  // and overwriting it would offset the model from the camera target.
  clonedModel.position.x -= scaledCenter.x
  clonedModel.position.z -= scaledCenter.z
  clonedModel.position.y -= scaledBox.min.y

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

  const model = useLoader(OBJLoader, modelUrl, loader => {
    loader.manager = safeLoadingManager
  })
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

  const gltf = useLoader(GLTFLoader, modelUrl, loader => {
    loader.manager = safeLoadingManager
  })
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

  const model = useLoader(FBXLoader, modelUrl, loader => {
    loader.manager = safeLoadingManager
  })
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

// STL Model with per-material textures. STLLoader returns raw BufferGeometry,
// so wrap it in a Mesh + Group before the shared setup applies textures.
function STLModelWithTextures({
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

  const geometry = useLoader(STLLoader, modelUrl, loader => {
    loader.manager = safeLoadingManager
  })
  const model = useMemo(() => {
    const mesh = new THREE.Mesh(geometry, new THREE.MeshPhysicalMaterial())
    const group = new THREE.Group()
    group.add(mesh)
    return group
  }, [geometry])
  const { loadedTextures, texturesReady } = usePerMaterialTextures(
    materialTextureSets,
    renderer,
    true
  )

  useEffect(() => {
    scaledRef.current = false
  }, [model, materialTextureSets, texturesReady])

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

// 3MF Model with per-material textures
function ThreeMFModelWithTextures({
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

  const model = useLoader(ThreeMFLoader, modelUrl, loader => {
    loader.manager = safeLoadingManager
  })
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
  if (fileExtension === 'stl') {
    return (
      <STLModelWithTextures
        modelUrl={modelUrl}
        rotationSpeed={rotationSpeed}
        materialTextureSets={materialTextureSets}
      />
    )
  }
  if (fileExtension === '3mf') {
    return (
      <ThreeMFModelWithTextures
        modelUrl={modelUrl}
        rotationSpeed={rotationSpeed}
        materialTextureSets={materialTextureSets}
      />
    )
  }
  return null
}
