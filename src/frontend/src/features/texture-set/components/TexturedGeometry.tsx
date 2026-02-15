import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useTexture } from '@react-three/drei'
import { GeometryType } from './GeometrySelector'
import { TextureSetDto, TextureType } from '@/types'
import { getFileUrl } from '@/features/models/api/modelApi'

interface GeometryParams {
  type: GeometryType
  scale: number
  rotationSpeed: number
  wireframe: boolean
  cubeSize?: number
  sphereRadius?: number
  sphereSegments?: number
  cylinderRadius?: number
  cylinderHeight?: number
  torusRadius?: number
  torusTube?: number
}

interface TexturedGeometryProps {
  geometryType: GeometryType
  textureSet: TextureSetDto
  geometryParams?: GeometryParams
}

export function TexturedGeometry({
  geometryType,
  textureSet,
  geometryParams = {},
}: TexturedGeometryProps) {
  const meshRef = useRef<THREE.Mesh>(null)

  // Rotate the geometry with configurable speed
  useFrame(() => {
    if (meshRef.current) {
      meshRef.current.rotation.y += geometryParams.rotationSpeed
    }
  })

  // Build texture URLs object (create URLs for textures that exist)
  const textureUrlsObject = useMemo(() => {
    const urls: Record<string, string> = {}

    // Albedo or Diffuse for base color
    const albedo = textureSet.textures.find(
      t => t.textureType === TextureType.Albedo
    )
    const diffuse = textureSet.textures.find(
      t => t.textureType === TextureType.Diffuse
    )
    if (albedo) {
      urls.map = getFileUrl(albedo.fileId.toString())
    } else if (diffuse) {
      urls.map = getFileUrl(diffuse.fileId.toString())
    }

    // Normal map
    const normal = textureSet.textures.find(
      t => t.textureType === TextureType.Normal
    )
    if (normal) {
      urls.normalMap = getFileUrl(normal.fileId.toString())
    }

    // Roughness map
    const roughness = textureSet.textures.find(
      t => t.textureType === TextureType.Roughness
    )
    if (roughness) {
      urls.roughnessMap = getFileUrl(roughness.fileId.toString())
    }

    // Metallic map
    const metallic = textureSet.textures.find(
      t => t.textureType === TextureType.Metallic
    )
    if (metallic) {
      urls.metalnessMap = getFileUrl(metallic.fileId.toString())
    }

    // AO map
    const ao = textureSet.textures.find(t => t.textureType === TextureType.AO)
    if (ao) {
      urls.aoMap = getFileUrl(ao.fileId.toString())
    }

    // Emissive map
    const emissive = textureSet.textures.find(
      t => t.textureType === TextureType.Emissive
    )
    if (emissive) {
      urls.emissiveMap = getFileUrl(emissive.fileId.toString())
    }

    // Bump map
    const bump = textureSet.textures.find(
      t => t.textureType === TextureType.Bump
    )
    if (bump) {
      urls.bumpMap = getFileUrl(bump.fileId.toString())
    }

    // Alpha map
    const alpha = textureSet.textures.find(
      t => t.textureType === TextureType.Alpha
    )
    if (alpha) {
      urls.alphaMap = getFileUrl(alpha.fileId.toString())
    }

    // Displacement map (also check Height for backwards compatibility)
    const displacement = textureSet.textures.find(
      t => t.textureType === TextureType.Displacement
    )
    const height = textureSet.textures.find(
      t => t.textureType === TextureType.Height
    )
    if (displacement) {
      urls.displacementMap = getFileUrl(displacement.fileId.toString())
    } else if (height) {
      urls.displacementMap = getFileUrl(height.fileId.toString())
    }

    return urls
  }, [textureSet])

  // Always call useTexture (even with empty object) to satisfy React Hooks rules
  const loadedTextures = useTexture(
    Object.keys(textureUrlsObject).length > 0
      ? textureUrlsObject
      : { dummy: '' }
  )

  // Configure texture properties
  Object.values(loadedTextures).forEach((texture: THREE.Texture) => {
    if (texture && texture.wrapS !== undefined) {
      texture.wrapS = THREE.RepeatWrapping
      texture.wrapT = THREE.RepeatWrapping
    }
  })

  // Create geometry based on type with configurable parameters
  const geometry = useMemo(() => {
    const scale = geometryParams.scale || 1
    switch (geometryType) {
      case 'box': {
        const size = geometryParams.cubeSize || 2
        return <boxGeometry args={[size * scale, size * scale, size * scale]} />
      }
      case 'sphere': {
        const radius = geometryParams.sphereRadius || 1.2
        const segments = geometryParams.sphereSegments || 64
        return <sphereGeometry args={[radius * scale, segments, segments]} />
      }
      case 'cylinder': {
        const radius = geometryParams.cylinderRadius || 1
        const height = geometryParams.cylinderHeight || 2
        return (
          <cylinderGeometry
            args={[radius * scale, radius * scale, height * scale, 64]}
          />
        )
      }
      case 'torus': {
        const radius = geometryParams.torusRadius || 1
        const tube = geometryParams.torusTube || 0.4
        return <torusGeometry args={[radius * scale, tube * scale, 32, 64]} />
      }
      default:
        return <boxGeometry args={[2, 2, 2]} />
    }
  }, [geometryType, geometryParams])

  // Extract loaded textures, handling the dummy case
  const hasTextures = Object.keys(textureUrlsObject).length > 0
  const textures = hasTextures
    ? {
        map: (loadedTextures as Record<string, THREE.Texture>).map || null,
        normalMap:
          (loadedTextures as Record<string, THREE.Texture>).normalMap || null,
        roughnessMap:
          (loadedTextures as Record<string, THREE.Texture>).roughnessMap ||
          null,
        metalnessMap:
          (loadedTextures as Record<string, THREE.Texture>).metalnessMap ||
          null,
        aoMap: (loadedTextures as Record<string, THREE.Texture>).aoMap || null,
        emissiveMap:
          (loadedTextures as Record<string, THREE.Texture>).emissiveMap || null,
        bumpMap:
          (loadedTextures as Record<string, THREE.Texture>).bumpMap || null,
        alphaMap:
          (loadedTextures as Record<string, THREE.Texture>).alphaMap || null,
        displacementMap:
          (loadedTextures as Record<string, THREE.Texture>).displacementMap ||
          null,
      }
    : {
        map: null,
        normalMap: null,
        roughnessMap: null,
        metalnessMap: null,
        aoMap: null,
        emissiveMap: null,
        bumpMap: null,
        alphaMap: null,
        displacementMap: null,
      }

  return (
    <mesh ref={meshRef} castShadow receiveShadow>
      {geometry}
      <meshStandardMaterial
        map={textures.map}
        normalMap={textures.normalMap}
        roughnessMap={textures.roughnessMap}
        metalnessMap={textures.metalnessMap}
        aoMap={textures.aoMap}
        emissiveMap={textures.emissiveMap}
        bumpMap={textures.bumpMap}
        alphaMap={textures.alphaMap}
        displacementMap={textures.displacementMap}
        roughness={textures.roughnessMap ? 1 : 0.5}
        metalness={textures.metalnessMap ? 1 : 0.3}
        emissive={textures.emissiveMap ? '#ffffff' : '#000000'}
        transparent={textures.alphaMap ? true : false}
        color={textures.map ? undefined : '#ffffff'}
        wireframe={geometryParams.wireframe || false}
      />
    </mesh>
  )
}

