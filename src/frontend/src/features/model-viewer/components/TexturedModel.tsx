import { useRef, useEffect } from 'react'
import { useFrame, useLoader } from '@react-three/fiber'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader'
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader'
import { useTexture } from '@react-three/drei'
import * as THREE from 'three'
import { useModelObject } from '../hooks/useModelObject'
import { TextureSetDto, TextureType } from '../../../types'
// eslint-disable-next-line no-restricted-imports
import ApiClient from '../../../services/ApiClient'

interface TexturedModelProps {
  modelUrl: string
  fileExtension: string
  rotationSpeed: number
  textureSet: TextureSetDto | null
}

// Build texture URLs from texture set
function buildTextureUrls(textureSet: TextureSetDto | null) {
  if (!textureSet) return {}

  const urls: Record<string, string> = {}

  // Albedo or Diffuse for base color
  const albedo = textureSet.textures?.find(
    t => t.textureType === TextureType.Albedo
  )
  const diffuse = textureSet.textures?.find(
    t => t.textureType === TextureType.Diffuse
  )
  if (albedo) {
    urls.map = ApiClient.getFileUrl(albedo.fileId.toString())
  } else if (diffuse) {
    urls.map = ApiClient.getFileUrl(diffuse.fileId.toString())
  }

  // Normal map
  const normal = textureSet.textures?.find(
    t => t.textureType === TextureType.Normal
  )
  if (normal) {
    urls.normalMap = ApiClient.getFileUrl(normal.fileId.toString())
  }

  // Roughness map
  const roughness = textureSet.textures?.find(
    t => t.textureType === TextureType.Roughness
  )
  if (roughness) {
    urls.roughnessMap = ApiClient.getFileUrl(roughness.fileId.toString())
  }

  // Metallic map
  const metallic = textureSet.textures?.find(
    t => t.textureType === TextureType.Metallic
  )
  if (metallic) {
    urls.metalnessMap = ApiClient.getFileUrl(metallic.fileId.toString())
  }

  // AO map
  const ao = textureSet.textures?.find(t => t.textureType === TextureType.AO)
  if (ao) {
    urls.aoMap = ApiClient.getFileUrl(ao.fileId.toString())
  }

  // Emissive map
  const emissive = textureSet.textures?.find(
    t => t.textureType === TextureType.Emissive
  )
  if (emissive) {
    urls.emissiveMap = ApiClient.getFileUrl(emissive.fileId.toString())
  }

  // Bump map
  const bump = textureSet.textures?.find(
    t => t.textureType === TextureType.Bump
  )
  if (bump) {
    urls.bumpMap = ApiClient.getFileUrl(bump.fileId.toString())
  }

  // Alpha map
  const alpha = textureSet.textures?.find(
    t => t.textureType === TextureType.Alpha
  )
  if (alpha) {
    urls.alphaMap = ApiClient.getFileUrl(alpha.fileId.toString())
  }

  // Displacement map (also check Height for backwards compatibility)
  const displacement = textureSet.textures?.find(
    t => t.textureType === TextureType.Displacement
  )
  const height = textureSet.textures?.find(
    t => t.textureType === TextureType.Height
  )
  if (displacement) {
    urls.displacementMap = ApiClient.getFileUrl(displacement.fileId.toString())
  } else if (height) {
    urls.displacementMap = ApiClient.getFileUrl(height.fileId.toString())
  }

  return urls
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

  useFrame(() => {
    if (meshRef.current && rotationSpeed > 0) {
      meshRef.current.rotation.y += rotationSpeed
    }
  })

  const model = useLoader(OBJLoader, modelUrl)
  const textureUrls = buildTextureUrls(textureSet)
  const hasTextures = Object.keys(textureUrls).length > 0

  // Configure texture properties
  let loadedTextures:
    | Record<string, THREE.Texture>
    | THREE.Texture[]
    | THREE.Texture = {}
  if (hasTextures) {
    loadedTextures = useTexture(textureUrls)
  }

  // Configure texture properties
  if (hasTextures) {
    Object.values(loadedTextures).forEach((texture: THREE.Texture) => {
      if (texture && texture.wrapS !== undefined) {
        texture.wrapS = THREE.RepeatWrapping
        texture.wrapT = THREE.RepeatWrapping
        // Use default flipY=true (web standard)
        // Blender addon handles UV conversion on export/import
      }
    })
  }

  useEffect(() => {
    scaledRef.current = false
  }, [modelUrl, textureSet])

  useEffect(() => {
    if (model && !scaledRef.current) {
      const clonedModel = model.clone()

      // Apply material with textures
      const material = new THREE.MeshStandardMaterial({
        color: hasTextures ? undefined : new THREE.Color(0.7, 0.7, 0.9),
        metalness: hasTextures ? 1 : 0.3,
        roughness: hasTextures ? 1 : 0.4,
        envMapIntensity: 1.0,
      })

      if (hasTextures) {
        const textures = loadedTextures as Record<string, THREE.Texture>
        if (textures.map) material.map = textures.map
        if (textures.normalMap) material.normalMap = textures.normalMap
        if (textures.roughnessMap) material.roughnessMap = textures.roughnessMap
        if (textures.metalnessMap) material.metalnessMap = textures.metalnessMap
        if (textures.aoMap) material.aoMap = textures.aoMap
        if (textures.emissiveMap) {
          material.emissiveMap = textures.emissiveMap
          material.emissive = new THREE.Color(0xffffff)
        }
        if (textures.bumpMap) material.bumpMap = textures.bumpMap
        if (textures.alphaMap) {
          material.alphaMap = textures.alphaMap
          material.transparent = true
        }
        if (textures.displacementMap)
          material.displacementMap = textures.displacementMap
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
  }, [model, loadedTextures, hasTextures])

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

  useFrame(() => {
    if (meshRef.current && rotationSpeed > 0) {
      meshRef.current.rotation.y += rotationSpeed
    }
  })

  const gltf = useLoader(GLTFLoader, modelUrl)
  const model = gltf?.scene
  const textureUrls = buildTextureUrls(textureSet)
  const hasTextures = Object.keys(textureUrls).length > 0

  const loadedTextures = useTexture(hasTextures ? textureUrls : { dummy: '' })

  // Configure texture properties
  if (hasTextures) {
    Object.values(loadedTextures).forEach((texture: THREE.Texture) => {
      if (texture && texture.wrapS !== undefined) {
        texture.wrapS = THREE.RepeatWrapping
        texture.wrapT = THREE.RepeatWrapping
        // Use default flipY=true (web standard)
        // Blender addon handles UV conversion on export/import
      }
    })
  }

  useEffect(() => {
    scaledRef.current = false
  }, [modelUrl, textureSet])

  useEffect(() => {
    if (model && !scaledRef.current) {
      const clonedModel = model.clone()

      // Apply material with textures
      const material = new THREE.MeshStandardMaterial({
        color: hasTextures ? undefined : new THREE.Color(0.7, 0.7, 0.9),
        metalness: hasTextures ? 1 : 0.3,
        roughness: hasTextures ? 1 : 0.4,
        envMapIntensity: 1.0,
      })

      if (hasTextures) {
        const textures = loadedTextures as Record<string, THREE.Texture>
        if (textures.map) material.map = textures.map
        if (textures.normalMap) material.normalMap = textures.normalMap
        if (textures.roughnessMap) material.roughnessMap = textures.roughnessMap
        if (textures.metalnessMap) material.metalnessMap = textures.metalnessMap
        if (textures.aoMap) material.aoMap = textures.aoMap
        if (textures.emissiveMap) {
          material.emissiveMap = textures.emissiveMap
          material.emissive = new THREE.Color(0xffffff)
        }
        if (textures.bumpMap) material.bumpMap = textures.bumpMap
        if (textures.alphaMap) {
          material.alphaMap = textures.alphaMap
          material.transparent = true
        }
        if (textures.displacementMap)
          material.displacementMap = textures.displacementMap
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
  }, [model, loadedTextures, hasTextures])

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

  useFrame(() => {
    if (meshRef.current && rotationSpeed > 0) {
      meshRef.current.rotation.y += rotationSpeed
    }
  })

  const model = useLoader(FBXLoader, modelUrl)
  const textureUrls = buildTextureUrls(textureSet)
  const hasTextures = Object.keys(textureUrls).length > 0

  const loadedTextures = useTexture(hasTextures ? textureUrls : { dummy: '' })

  // Configure texture properties
  if (hasTextures) {
    Object.values(loadedTextures).forEach((texture: THREE.Texture) => {
      if (texture && texture.wrapS !== undefined) {
        texture.wrapS = THREE.RepeatWrapping
        texture.wrapT = THREE.RepeatWrapping
        // Use default flipY=true (web standard)
        // Blender addon handles UV conversion on export/import
      }
    })
  }

  useEffect(() => {
    scaledRef.current = false
  }, [modelUrl, textureSet])

  useEffect(() => {
    if (model && !scaledRef.current) {
      const clonedModel = model.clone()

      // Apply material with textures
      const material = new THREE.MeshStandardMaterial({
        color: hasTextures ? undefined : new THREE.Color(0.7, 0.7, 0.9),
        metalness: hasTextures ? 1 : 0.3,
        roughness: hasTextures ? 1 : 0.4,
        envMapIntensity: 1.0,
      })

      if (hasTextures) {
        const textures = loadedTextures as Record<string, THREE.Texture>
        if (textures.map) material.map = textures.map
        if (textures.normalMap) material.normalMap = textures.normalMap
        if (textures.roughnessMap) material.roughnessMap = textures.roughnessMap
        if (textures.metalnessMap) material.metalnessMap = textures.metalnessMap
        if (textures.aoMap) material.aoMap = textures.aoMap
        if (textures.emissiveMap) {
          material.emissiveMap = textures.emissiveMap
          material.emissive = new THREE.Color(0xffffff)
        }
        if (textures.bumpMap) material.bumpMap = textures.bumpMap
        if (textures.alphaMap) {
          material.alphaMap = textures.alphaMap
          material.transparent = true
        }
        if (textures.displacementMap)
          material.displacementMap = textures.displacementMap
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
  }, [model, loadedTextures, hasTextures])

  useEffect(() => {
    if (model) {
      setModelObject(model)
    }
    return () => setModelObject(null)
  }, [model, setModelObject])

  return <group ref={meshRef} />
}

function TexturedModel({
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

export default TexturedModel
