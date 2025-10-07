import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useTexture } from '@react-three/drei'
import { GeometryType } from './GeometrySelector'
import { TexturePackDto, TextureType } from '../../../types'
// eslint-disable-next-line no-restricted-imports
import ApiClient from '../../../services/ApiClient'

interface TexturedGeometryProps {
  geometryType: GeometryType
  texturePack: TexturePackDto
}

function TexturedGeometry({
  geometryType,
  texturePack,
}: TexturedGeometryProps) {
  const meshRef = useRef<THREE.Mesh>(null)

  // Rotate the geometry
  useFrame(() => {
    if (meshRef.current) {
      meshRef.current.rotation.y += 0.01
      meshRef.current.rotation.x += 0.005
    }
  })

  // Build texture URLs object (create URLs for textures that exist)
  const textureUrlsObject = useMemo(() => {
    const urls: Record<string, string> = {}

    // Albedo or Diffuse for base color
    const albedo = texturePack.textures.find(
      t => t.textureType === TextureType.Albedo
    )
    const diffuse = texturePack.textures.find(
      t => t.textureType === TextureType.Diffuse
    )
    if (albedo) {
      urls.map = ApiClient.getFileUrl(albedo.fileId.toString())
    } else if (diffuse) {
      urls.map = ApiClient.getFileUrl(diffuse.fileId.toString())
    }

    // Normal map
    const normal = texturePack.textures.find(
      t => t.textureType === TextureType.Normal
    )
    if (normal) {
      urls.normalMap = ApiClient.getFileUrl(normal.fileId.toString())
    }

    // Roughness map
    const roughness = texturePack.textures.find(
      t => t.textureType === TextureType.Roughness
    )
    if (roughness) {
      urls.roughnessMap = ApiClient.getFileUrl(roughness.fileId.toString())
    }

    // Metallic map
    const metallic = texturePack.textures.find(
      t => t.textureType === TextureType.Metallic
    )
    if (metallic) {
      urls.metalnessMap = ApiClient.getFileUrl(metallic.fileId.toString())
    }

    // AO map
    const ao = texturePack.textures.find(t => t.textureType === TextureType.AO)
    if (ao) {
      urls.aoMap = ApiClient.getFileUrl(ao.fileId.toString())
    }

    return urls
  }, [texturePack])

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

  // Create geometry based on type
  const geometry = useMemo(() => {
    switch (geometryType) {
      case 'box':
        return <boxGeometry args={[2, 2, 2]} />
      case 'sphere':
        return <sphereGeometry args={[1.2, 64, 64]} />
      case 'cylinder':
        return <cylinderGeometry args={[1, 1, 2, 64]} />
      case 'torus':
        return <torusGeometry args={[1, 0.4, 32, 64]} />
      default:
        return <boxGeometry args={[2, 2, 2]} />
    }
  }, [geometryType])

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
      }
    : {
        map: null,
        normalMap: null,
        roughnessMap: null,
        metalnessMap: null,
        aoMap: null,
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
        roughness={textures.roughnessMap ? 1 : 0.5}
        metalness={textures.metalnessMap ? 1 : 0.3}
        color={textures.map ? undefined : '#ffffff'}
      />
    </mesh>
  )
}

export default TexturedGeometry
