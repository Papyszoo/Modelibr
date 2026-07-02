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
import { TextureChannel, TextureType } from '@/types'

import { buildStlModel } from '../../../../../asset-processor/lib/stlMesh.js'
import {
  MATERIAL_SLOT_BY_TEXTURE_TYPE,
  textureTypeNeedsInvert,
} from '../../../../../asset-processor/lib/textureChannels.js'
import {
  applyMaterialTextures,
  KEY_SEP,
  type MaterialTextureSets,
} from './materialTextures'

export type { MaterialTextureSets } from './materialTextures'

interface TexturedModelProps {
  modelUrl: string
  fileExtension: string
  rotationSpeed: number
  materialTextureSets: MaterialTextureSets
}

// Texture types in apply order, each with its fallback when the primary is
// absent (mutually-exclusive groups: Roughness←Glossiness, Displacement←Height).
// The MeshPhysicalMaterial slot each type feeds and whether it must be inverted
// at load come from the shared cross-runtime map
// (asset-processor/lib/textureChannels.js) — the same source the worker
// thumbnail uses, so the viewer and the thumbnail route textures identically.
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

/**
 * Dispose the materials of a previously-built clone before it is dropped.
 * applyMaterialTextures allocates fresh MeshPhysicalMaterials on every rebuild
 * (texture-ready toggle, texture-set change), so without this the old GPU
 * materials leak for the lifetime of the viewing session. Geometries are NOT
 * disposed: Object3D.clone() shares geometry with the source model, and the
 * loaded textures are owned by the extraction hook's cache — disposing either
 * here would corrupt the still-live original.
 */
function disposePreviousClone(group: THREE.Object3D): void {
  const seen = new Set<THREE.Material>()
  group.traverse(child => {
    const mesh = child as THREE.Mesh
    if (!mesh.isMesh) return
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    for (const mat of mats) {
      if (mat && !seen.has(mat)) {
        seen.add(mat)
        mat.dispose()
      }
    }
  })
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
    disposePreviousClone(meshRef.current)
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
  // Shared wrap; setupModel's per-material textures replace this material.
  const model = useMemo(() => buildStlModel(THREE, geometry), [geometry])
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
