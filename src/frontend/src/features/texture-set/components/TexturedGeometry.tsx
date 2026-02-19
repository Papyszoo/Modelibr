import { useRef, useMemo, useEffect, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { GeometryType } from './GeometrySelector'
import { TextureSetDto, TextureType, UvMappingMode } from '@/types'
import { getFileUrl } from '@/features/models/api/modelApi'
import { isExrFile } from '@/utils/fileUtils'
import { getPhysicalTiling } from '../utils/physicalUvTiling'
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
  tilingScaleX?: number
  tilingScaleY?: number
  uvMappingMode?: UvMappingMode
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

/** Create the geometry JSX based on type and params */
function useGeometry(
  geometryType: GeometryType,
  geometryParams: GeometryParams
) {
  return useMemo(() => {
    const scale = geometryParams.scale || 1
    switch (geometryType) {
      case 'box': {
        const size = geometryParams.cubeSize || 2
        return (
          <boxGeometry
            args={[size * scale, size * scale, size * scale, 64, 64, 64]}
          />
        )
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
            args={[
              radius * scale,
              radius * scale,
              height * scale,
              64,
              1,
              false,
            ]}
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

  const geometry = useGeometry(geometryType, geometryParams)

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

  // Compute tiling
  const uvMode = geometryParams.uvMappingMode ?? UvMappingMode.Standard
  let tilingX: number
  let tilingY: number

  if (uvMode === UvMappingMode.Physical) {
    const physicalTiling = getPhysicalTiling(
      geometryType,
      {
        scale: geometryParams.scale,
        cubeSize: geometryParams.cubeSize,
        sphereRadius: geometryParams.sphereRadius,
        cylinderRadius: geometryParams.cylinderRadius,
        cylinderHeight: geometryParams.cylinderHeight,
        torusRadius: geometryParams.torusRadius,
        torusTube: geometryParams.torusTube,
      },
      geometryParams.uvScale ?? 1
    )
    tilingX = physicalTiling.x
    tilingY = physicalTiling.y
  } else {
    tilingX = geometryParams.tilingScaleX ?? 1
    tilingY = geometryParams.tilingScaleY ?? 1
  }

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

  // Apply tiling whenever textures or tiling params change
  useEffect(() => {
    Object.values(loadedTextures).forEach((texture: THREE.Texture) => {
      if (texture && texture.wrapS !== undefined) {
        texture.repeat.set(tilingX, tilingY)
      }
    })
  }, [loadedTextures, tilingX, tilingY])

  const t = loadedTextures

  return (
    <mesh ref={meshRef} castShadow receiveShadow>
      {geometry}
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
