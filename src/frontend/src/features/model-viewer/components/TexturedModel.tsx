import { useRef, useEffect, useMemo } from 'react'
import { useFrame, useLoader, useThree } from '@react-three/fiber'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader'
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader'
import * as THREE from 'three'
import { useModelObject } from '@/features/model-viewer/hooks/useModelObject'
import {
  useChannelExtractedTextures,
  TextureConfig,
} from '@/features/model-viewer/hooks/useChannelExtractedTextures'
import { TextureSetDto, TextureType, TextureChannel } from '@/types'
import { getFileUrl } from '@/features/models/api/modelApi'

interface TexturedModelProps {
  modelUrl: string
  fileExtension: string
  rotationSpeed: number
  textureSet: TextureSetDto | null
}

// Build texture configs with channel information from texture set
function buildTextureConfigs(
  textureSet: TextureSetDto | null
): Record<string, TextureConfig> {
  if (!textureSet) return {}

  const configs: Record<string, TextureConfig> = {}

  // Helper to add texture config
  const addConfig = (
    slotName: string,
    textureType: TextureType,
    fallbackType?: TextureType
  ) => {
    let texture = textureSet.textures?.find(t => t.textureType === textureType)
    if (!texture && fallbackType) {
      texture = textureSet.textures?.find(t => t.textureType === fallbackType)
    }
    if (texture) {
      configs[slotName] = {
        url: getFileUrl(texture.fileId.toString()),
        sourceChannel: texture.sourceChannel ?? TextureChannel.RGB,
      }
    }
  }

  // Add all texture types (Diffuse removed - use Albedo instead)
  addConfig('map', TextureType.Albedo)
  addConfig('normalMap', TextureType.Normal)
  addConfig('roughnessMap', TextureType.Roughness)
  addConfig('metalnessMap', TextureType.Metallic)
  addConfig('aoMap', TextureType.AO)
  addConfig('emissiveMap', TextureType.Emissive)
  addConfig('bumpMap', TextureType.Bump)
  addConfig('alphaMap', TextureType.Alpha)
  addConfig('displacementMap', TextureType.Displacement, TextureType.Height)

  return configs
}

// OBJ Model with textures
function OBJModelWithTextures({
  modelUrl,
  rotationSpeed,
  textureSet,
}: {
  modelUrl: string
  rotationSpeed: number
  textureSet: TextureSetDto | null
}) {
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

  // Build texture configs with channel info
  const textureConfigs = useMemo(
    () => buildTextureConfigs(textureSet),
    [textureSet]
  )
  const hasTextures = Object.keys(textureConfigs).length > 0

  // Load textures with channel extraction
  const loadedTextures = useChannelExtractedTextures(
    textureConfigs,
    renderer,
    true
  ) // OBJ uses flipY=true
  const texturesReady = Object.keys(loadedTextures).length > 0

  useEffect(() => {
    scaledRef.current = false
  }, [modelUrl, textureSet, texturesReady])

  useEffect(() => {
    if (model && !scaledRef.current) {
      const clonedModel = model.clone()

      // Apply material with textures
      const material = new THREE.MeshStandardMaterial({
        color: hasTextures ? 0xffffff : new THREE.Color(0.7, 0.7, 0.9),
        metalness: hasTextures ? 1 : 0.3,
        roughness: hasTextures ? 1 : 0.4,
        envMapIntensity: 1.0,
      })

      if (hasTextures && texturesReady) {
        if (loadedTextures.map) material.map = loadedTextures.map
        if (loadedTextures.normalMap)
          material.normalMap = loadedTextures.normalMap
        if (loadedTextures.roughnessMap)
          material.roughnessMap = loadedTextures.roughnessMap
        if (loadedTextures.metalnessMap)
          material.metalnessMap = loadedTextures.metalnessMap
        if (loadedTextures.aoMap) material.aoMap = loadedTextures.aoMap
        if (loadedTextures.emissiveMap) {
          material.emissiveMap = loadedTextures.emissiveMap
          material.emissive = new THREE.Color(0xffffff)
        }
        if (loadedTextures.bumpMap) material.bumpMap = loadedTextures.bumpMap
        if (loadedTextures.alphaMap) {
          material.alphaMap = loadedTextures.alphaMap
          material.transparent = true
        }
        if (loadedTextures.displacementMap)
          material.displacementMap = loadedTextures.displacementMap
      }

      clonedModel.traverse(child => {
        if (child.isMesh) {
          child.material = material
          child.castShadow = true
          child.receiveShadow = true
        }
      })

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
  }, [model, loadedTextures, hasTextures, texturesReady])

  useEffect(() => {
    if (model) {
      setModelObject(model)
    }
    return () => setModelObject(null)
  }, [model, setModelObject])

  return <group ref={meshRef} />
}

// GLTF Model with textures
function GLTFModelWithTextures({
  modelUrl,
  rotationSpeed,
  textureSet,
}: {
  modelUrl: string
  rotationSpeed: number
  textureSet: TextureSetDto | null
}) {
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

  // Build texture configs with channel info
  const textureConfigs = useMemo(
    () => buildTextureConfigs(textureSet),
    [textureSet]
  )
  const hasTextures = Object.keys(textureConfigs).length > 0

  // Load textures with channel extraction
  const loadedTextures = useChannelExtractedTextures(
    textureConfigs,
    renderer,
    false
  ) // GLTF uses flipY=false
  const texturesReady = Object.keys(loadedTextures).length > 0

  useEffect(() => {
    scaledRef.current = false
  }, [modelUrl, textureSet, texturesReady])

  useEffect(() => {
    if (model && !scaledRef.current) {
      const clonedModel = model.clone()

      // Apply material with textures
      const material = new THREE.MeshStandardMaterial({
        color: hasTextures ? 0xffffff : new THREE.Color(0.7, 0.7, 0.9),
        metalness: hasTextures ? 1 : 0.3,
        roughness: hasTextures ? 1 : 0.4,
        envMapIntensity: 1.0,
      })

      if (hasTextures && texturesReady) {
        if (loadedTextures.map) material.map = loadedTextures.map
        if (loadedTextures.normalMap)
          material.normalMap = loadedTextures.normalMap
        if (loadedTextures.roughnessMap)
          material.roughnessMap = loadedTextures.roughnessMap
        if (loadedTextures.metalnessMap)
          material.metalnessMap = loadedTextures.metalnessMap
        if (loadedTextures.aoMap) material.aoMap = loadedTextures.aoMap
        if (loadedTextures.emissiveMap) {
          material.emissiveMap = loadedTextures.emissiveMap
          material.emissive = new THREE.Color(0xffffff)
        }
        if (loadedTextures.bumpMap) material.bumpMap = loadedTextures.bumpMap
        if (loadedTextures.alphaMap) {
          material.alphaMap = loadedTextures.alphaMap
          material.transparent = true
        }
        if (loadedTextures.displacementMap)
          material.displacementMap = loadedTextures.displacementMap
      }

      clonedModel.traverse(child => {
        if (child.isMesh) {
          child.material = material
          child.castShadow = true
          child.receiveShadow = true
        }
      })

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
  }, [model, loadedTextures, hasTextures, texturesReady])

  useEffect(() => {
    if (model) {
      setModelObject(model)
    }
    return () => setModelObject(null)
  }, [model, setModelObject])

  return <group ref={meshRef} />
}

// FBX Model with textures
function FBXModelWithTextures({
  modelUrl,
  rotationSpeed,
  textureSet,
}: {
  modelUrl: string
  rotationSpeed: number
  textureSet: TextureSetDto | null
}) {
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

  // Build texture configs with channel info
  const textureConfigs = useMemo(
    () => buildTextureConfigs(textureSet),
    [textureSet]
  )
  const hasTextures = Object.keys(textureConfigs).length > 0

  // Load textures with channel extraction
  const loadedTextures = useChannelExtractedTextures(
    textureConfigs,
    renderer,
    true
  ) // FBX uses flipY=true
  const texturesReady = Object.keys(loadedTextures).length > 0

  useEffect(() => {
    scaledRef.current = false
  }, [modelUrl, textureSet, texturesReady])

  useEffect(() => {
    if (model && !scaledRef.current) {
      const clonedModel = model.clone()

      // Apply material with textures
      const material = new THREE.MeshStandardMaterial({
        color: hasTextures ? 0xffffff : new THREE.Color(0.7, 0.7, 0.9),
        metalness: hasTextures ? 1 : 0.3,
        roughness: hasTextures ? 1 : 0.4,
        envMapIntensity: 1.0,
      })

      if (hasTextures && texturesReady) {
        if (loadedTextures.map) material.map = loadedTextures.map
        if (loadedTextures.normalMap)
          material.normalMap = loadedTextures.normalMap
        if (loadedTextures.roughnessMap)
          material.roughnessMap = loadedTextures.roughnessMap
        if (loadedTextures.metalnessMap)
          material.metalnessMap = loadedTextures.metalnessMap
        if (loadedTextures.aoMap) material.aoMap = loadedTextures.aoMap
        if (loadedTextures.emissiveMap) {
          material.emissiveMap = loadedTextures.emissiveMap
          material.emissive = new THREE.Color(0xffffff)
        }
        if (loadedTextures.bumpMap) material.bumpMap = loadedTextures.bumpMap
        if (loadedTextures.alphaMap) {
          material.alphaMap = loadedTextures.alphaMap
          material.transparent = true
        }
        if (loadedTextures.displacementMap)
          material.displacementMap = loadedTextures.displacementMap
      }

      clonedModel.traverse(child => {
        if (child.isMesh) {
          child.material = material
          child.castShadow = true
          child.receiveShadow = true
        }
      })

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
  }, [model, loadedTextures, hasTextures, texturesReady])

  useEffect(() => {
    if (model) {
      setModelObject(model)
    }
    return () => setModelObject(null)
  }, [model, setModelObject])

  return <group ref={meshRef} />
}

export function TexturedModel({
  modelUrl,
  fileExtension,
  rotationSpeed,
  textureSet,
}: TexturedModelProps) {
  if (fileExtension === 'obj') {
    return (
      <OBJModelWithTextures
        modelUrl={modelUrl}
        rotationSpeed={rotationSpeed}
        textureSet={textureSet}
      />
    )
  }
  if (fileExtension === 'fbx') {
    return (
      <FBXModelWithTextures
        modelUrl={modelUrl}
        rotationSpeed={rotationSpeed}
        textureSet={textureSet}
      />
    )
  }
  if (fileExtension === 'gltf' || fileExtension === 'glb') {
    return (
      <GLTFModelWithTextures
        modelUrl={modelUrl}
        rotationSpeed={rotationSpeed}
        textureSet={textureSet}
      />
    )
  }
  // Fallback to basic model without textures
  return null
}

