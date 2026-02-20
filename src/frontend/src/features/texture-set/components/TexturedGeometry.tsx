import { useRef, useMemo, useEffect, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { GeometryType } from './GeometrySelector'
import { TextureSetDto, TextureType } from '@/types'
import { getFileUrl } from '@/features/models/api/modelApi'
import { isExrFile } from '@/utils/fileUtils'
import { EXRLoader } from 'three/examples/jsm/loaders/EXRLoader.js'

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
  uvScale?: number
}

interface TexturedGeometryProps {
  geometryType: GeometryType
  textureSet: TextureSetDto
  geometryParams?: GeometryParams
}

interface TextureUrlInfo {
  url: string
  isExrFormat: boolean
}

/** Build texture URLs for all textures including EXR */
function buildTextureUrls(
  textureSet: TextureSetDto
): Record<string, TextureUrlInfo> {
  const urls: Record<string, TextureUrlInfo> = {}

  const makeInfo = (t: {
    fileId: number
    fileName?: string
  }): TextureUrlInfo => ({
    url: getFileUrl(t.fileId.toString()),
    isExrFormat: isExrFile(t.fileName),
  })

  const albedo = textureSet.textures.find(
    t => t.textureType === TextureType.Albedo
  )
  const diffuse = textureSet.textures.find(
    t => t.textureType === TextureType.Diffuse
  )
  if (albedo) urls.map = makeInfo(albedo)
  else if (diffuse) urls.map = makeInfo(diffuse)

  const normal = textureSet.textures.find(
    t => t.textureType === TextureType.Normal
  )
  if (normal) urls.normalMap = makeInfo(normal)

  const roughness = textureSet.textures.find(
    t => t.textureType === TextureType.Roughness
  )
  if (roughness) urls.roughnessMap = makeInfo(roughness)

  const metallic = textureSet.textures.find(
    t => t.textureType === TextureType.Metallic
  )
  if (metallic) urls.metalnessMap = makeInfo(metallic)

  const ao = textureSet.textures.find(t => t.textureType === TextureType.AO)
  if (ao) urls.aoMap = makeInfo(ao)

  const emissive = textureSet.textures.find(
    t => t.textureType === TextureType.Emissive
  )
  if (emissive) urls.emissiveMap = makeInfo(emissive)

  const bump = textureSet.textures.find(t => t.textureType === TextureType.Bump)
  if (bump) urls.bumpMap = makeInfo(bump)

  const alpha = textureSet.textures.find(
    t => t.textureType === TextureType.Alpha
  )
  if (alpha) urls.alphaMap = makeInfo(alpha)

  const displacement = textureSet.textures.find(
    t => t.textureType === TextureType.Displacement
  )
  const height = textureSet.textures.find(
    t => t.textureType === TextureType.Height
  )
  if (displacement) urls.displacementMap = makeInfo(displacement)
  else if (height) urls.displacementMap = makeInfo(height)

  return urls
}

/**
 * Create a welded BufferGeometry for the given primitive type.
 * mergeVertices welds shared vertices so displacement mapping
 * doesn't tear the mesh apart at edges.
 */
function createWeldedGeometry(
  geometryType: GeometryType,
  geometryParams: GeometryParams
): THREE.BufferGeometry {
  const scale = geometryParams.scale || 1
  let geo: THREE.BufferGeometry

  switch (geometryType) {
    case 'box': {
      const size = geometryParams.cubeSize || 2
      geo = new THREE.BoxGeometry(
        size * scale, size * scale, size * scale, 64, 64, 64
      )
      break
    }
    case 'sphere': {
      const radius = geometryParams.sphereRadius || 1.2
      const detail = 5 // IcosahedronGeometry detail level — uniform vertex distribution, no pole pinching
      geo = new THREE.IcosahedronGeometry(radius * scale, detail)
      break
    }
    case 'cylinder': {
      const radius = geometryParams.cylinderRadius || 1
      const height = geometryParams.cylinderHeight || 2
      geo = new THREE.CylinderGeometry(
        radius * scale, radius * scale, height * scale, 64, 64, false
      )
      break
    }
    case 'torus': {
      const radius = geometryParams.torusRadius || 1
      const tube = geometryParams.torusTube || 0.4
      geo = new THREE.TorusGeometry(radius * scale, tube * scale, 32, 64)
      break
    }
    default:
      geo = new THREE.BoxGeometry(2, 2, 2, 64, 64, 64)
  }

  // Weld shared vertices — mandatory to prevent displacement cracks
  geo = mergeVertices(geo)
  geo.computeVertexNormals()
  return geo
}

/** Texture properties that carry color data (need sRGB encoding) */
const COLOR_TEXTURE_PROPS = new Set(['map', 'emissiveMap'])

/** Sub-component that loads textures (standard + EXR) and renders the mesh */
function TexturedMesh({
  geometryType,
  geometryParams,
  textureUrls,
}: {
  geometryType: GeometryType
  geometryParams: GeometryParams
  textureUrls: Record<string, TextureUrlInfo>
}) {
  const meshRef = useRef<THREE.Mesh>(null)
  const [loadedTextures, setLoadedTextures] = useState<
    Record<string, THREE.Texture>
  >({})

  useFrame(() => {
    if (meshRef.current) {
      meshRef.current.rotation.y += geometryParams.rotationSpeed
    }
  })

  // Build welded geometry (memoised)
  const geometry = useMemo(
    () => createWeldedGeometry(geometryType, geometryParams),
    [geometryType, geometryParams]
  )

  const hasNormalMap = !!loadedTextures.normalMap

  // Compute tangents for correct normal-map rendering
  useEffect(() => {
    const geo = meshRef.current?.geometry
    if (
      geo &&
      hasNormalMap &&
      geo.index &&
      geo.getAttribute('position') &&
      geo.getAttribute('normal') &&
      geo.getAttribute('uv')
    ) {
      try {
        geo.computeTangents()
      } catch {
        // computeTangents can fail on degenerate geometry — safe to ignore
      }
    }
  }, [hasNormalMap, geometryType, geometryParams])

  // Simple UV scale — direct multiplier from database value
  const uvScale = geometryParams.uvScale ?? 1

  // Stable URL key for dependency tracking
  const urlsKey = useMemo(() => JSON.stringify(textureUrls), [textureUrls])

  // Load all textures (standard via TextureLoader, EXR via EXRLoader)
  useEffect(() => {
    let cancelled = false
    const textureLoader = new THREE.TextureLoader()
    const exrLoader = new EXRLoader()

    async function loadAll() {
      const result: Record<string, THREE.Texture> = {}

      await Promise.all(
        Object.entries(textureUrls).map(async ([prop, info]) => {
          try {
            let texture: THREE.Texture
            if (info.isExrFormat) {
              texture = await exrLoader.loadAsync(info.url)
            } else {
              texture = await textureLoader.loadAsync(info.url)
            }
            if (!cancelled) {
              // Set color space based on texture property
              if (COLOR_TEXTURE_PROPS.has(prop)) {
                texture.colorSpace = THREE.SRGBColorSpace
              } else {
                texture.colorSpace = THREE.LinearSRGBColorSpace
              }
              texture.wrapS = THREE.RepeatWrapping
              texture.wrapT = THREE.RepeatWrapping
              result[prop] = texture
            }
          } catch (err) {
            console.warn(`Failed to load ${prop} texture:`, err)
          }
        })
      )

      if (!cancelled) {
        setLoadedTextures(result)
      }
    }

    loadAll()
    return () => {
      cancelled = true
    }
  }, [urlsKey])

  // Apply tiling whenever textures or scale changes
  useEffect(() => {
    Object.values(loadedTextures).forEach((texture: THREE.Texture) => {
      if (texture && texture.wrapS !== undefined) {
        texture.repeat.set(uvScale, uvScale)
      }
    })
  }, [loadedTextures, uvScale])

  const t = loadedTextures

  return (
    <mesh ref={meshRef} castShadow receiveShadow geometry={geometry}>
      <meshStandardMaterial
        map={t.map || null}
        normalMap={t.normalMap || null}
        roughnessMap={t.roughnessMap || null}
        metalnessMap={t.metalnessMap || null}
        aoMap={t.aoMap || null}
        emissiveMap={t.emissiveMap || null}
        bumpMap={t.bumpMap || null}
        alphaMap={t.alphaMap || null}
        displacementMap={t.displacementMap || null}
        displacementScale={t.displacementMap ? 0.1 : 0}
        roughness={t.roughnessMap ? 1 : 0.5}
        metalness={t.metalnessMap ? 1 : 0.3}
        emissive={t.emissiveMap ? '#ffffff' : '#000000'}
        transparent={!!t.alphaMap}
        color={t.map ? undefined : '#ffffff'}
        wireframe={geometryParams.wireframe || false}
      />
    </mesh>
  )
}

export function TexturedGeometry({
  geometryType,
  textureSet,
  geometryParams = {} as GeometryParams,
}: TexturedGeometryProps) {
  const textureUrls = useMemo(() => buildTextureUrls(textureSet), [textureSet])

  return (
    <TexturedMesh
      geometryType={geometryType}
      geometryParams={geometryParams}
      textureUrls={textureUrls}
    />
  )
}
