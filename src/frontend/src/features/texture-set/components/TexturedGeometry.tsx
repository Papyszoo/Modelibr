import { useRef, useMemo, useEffect, useState } from 'react'
import * as THREE from 'three'
import { GeometryType } from './GeometrySelector'
import { TextureSetDto, TextureType } from '@/types'
import { getFileUrl } from '@/features/models/api/modelApi'
import { isExrFile } from '@/utils/fileUtils'
import { EXRLoader } from 'three/examples/jsm/loaders/EXRLoader.js'

interface GeometryParams {
  type: GeometryType
  scale: number
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

export interface TextureLoadingState {
  isLoading: boolean
  loaded: number
  total: number
}

/** Per-texture-type strength values (0–1) */
export type TextureStrengths = Record<string, number>

interface TexturedGeometryProps {
  geometryType: GeometryType
  textureSet: TextureSetDto
  geometryParams?: GeometryParams
  disabledTextures?: Set<string>
  textureStrengths?: TextureStrengths
  onLoadingChange?: (state: TextureLoadingState) => void
}

interface TextureUrlInfo {
  url: string
  isExrFormat: boolean
}

/** Build ALL texture URLs from the texture set (never filters by disabled state) */
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
  if (albedo) urls.map = makeInfo(albedo)

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

  const height = textureSet.textures.find(
    t => t.textureType === TextureType.Height
  )
  if (height) urls.displacementMap = makeInfo(height)

  const displacement = textureSet.textures.find(
    t => t.textureType === TextureType.Displacement
  )
  if (displacement) urls.displacementMap = makeInfo(displacement)

  return urls
}

/**
 * Maps material property names to the TextureType enum key used by disabledTextures.
 * Used to filter loaded textures at render time without re-fetching.
 */
const MATERIAL_PROP_TO_TYPE_KEY: Record<string, string[]> = {
  map: ['Albedo'],
  normalMap: ['Normal'],
  roughnessMap: ['Roughness'],
  metalnessMap: ['Metallic'],
  aoMap: ['AO'],
  emissiveMap: ['Emissive'],
  bumpMap: ['Bump'],
  alphaMap: ['Alpha'],
  displacementMap: ['Height', 'Displacement'],
}

/**
 * Create a BufferGeometry for the given primitive type.
 * Uses fixed standard unit sizes — the <Stage> component positions
 * the object consistently for all geometry types.
 */
function createGeometry(
  geometryType: GeometryType
): THREE.BufferGeometry {
  switch (geometryType) {
    case 'plane':
      // High subdivision (512) so displacement mapping captures fine texture detail
      return new THREE.PlaneGeometry(2.4, 2.4, 512, 512)
    case 'box':
      return new THREE.BoxGeometry(2, 2, 2, 128, 128, 128)
    case 'sphere':
      return new THREE.SphereGeometry(1.2, 128, 128)
    case 'cylinder':
      return new THREE.CylinderGeometry(1, 1, 2, 128, 128, false)
    case 'torus':
      return new THREE.TorusGeometry(1, 0.4, 64, 128)
    default:
      return new THREE.PlaneGeometry(2.4, 2.4, 512, 512)
  }
}

/** Texture properties that carry color data (need sRGB encoding) */
const COLOR_TEXTURE_PROPS = new Set(['map', 'emissiveMap'])

/**
 * Load a single texture off the main thread using fetch + createImageBitmap.
 * Falls back to TextureLoader for formats that don't support ImageBitmap.
 */
async function loadTextureOffThread(
  url: string,
  isExr: boolean,
  signal: AbortSignal
): Promise<THREE.Texture> {
  if (isExr) {
    // EXR must use the specialised loader — no ImageBitmap path
    const exrLoader = new EXRLoader()
    return exrLoader.loadAsync(url)
  }

  // Fetch blob, then decode off-thread via createImageBitmap
  const response = await fetch(url, { signal })
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`)
  const blob = await response.blob()
  // imageOrientation: 'flipY' ensures the bitmap is flipped to match WebGL's
  // bottom-left origin. Without this, textures appear distorted / mirrored.
  const bitmap = await createImageBitmap(blob, { imageOrientation: 'flipY' })
  const texture = new THREE.Texture(bitmap)
  texture.needsUpdate = true
  return texture
}

/** Sub-component that loads textures off-thread and renders the mesh */
function TexturedMesh({
  geometryType,
  geometryParams,
  textureUrls,
  disabledTextures,
  textureStrengths,
  onLoadingChange,
}: {
  geometryType: GeometryType
  geometryParams: GeometryParams
  textureUrls: Record<string, TextureUrlInfo>
  disabledTextures?: Set<string>
  textureStrengths?: TextureStrengths
  onLoadingChange?: (state: TextureLoadingState) => void
}) {
  const meshRef = useRef<THREE.Mesh>(null)
  const [loadedTextures, setLoadedTextures] = useState<
    Record<string, THREE.Texture>
  >({})
  const [texturesReady, setTexturesReady] = useState(false)

  // Track loading progress as internal state — avoids cross-reconciler
  // setState during render (R3F tree → DOM tree) which triggers React #310.
  const [loadingProgress, setLoadingProgress] = useState<TextureLoadingState>({
    isLoading: false,
    loaded: 0,
    total: 0,
  })

  // Sync loading progress to parent via dedicated effect.
  // This ensures the DOM-tree state update happens in its own render cycle,
  // completely decoupled from R3F reconciler commits.
  useEffect(() => {
    onLoadingChange?.(loadingProgress)
  }, [loadingProgress]) // eslint-disable-line react-hooks/exhaustive-deps
  // onLoadingChange intentionally excluded — stable callback from parent

  // Build geometry (memoised — depends only on geometry type)
  const geometry = useMemo(
    () => createGeometry(geometryType),
    [geometryType]
  )

  const hasNormalMap = !!loadedTextures.normalMap
  const hasAoMap = !!loadedTextures.aoMap

  // AO maps require a second UV set — copy uv to uv2
  useEffect(() => {
    const geo = geometry
    if (hasAoMap && geo && !geo.getAttribute('uv2')) {
      const uvAttr = geo.getAttribute('uv')
      if (uvAttr) {
        geo.setAttribute('uv2', uvAttr.clone())
      }
    }
  }, [hasAoMap, geometry])

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
  }, [hasNormalMap, geometryType])

  // Simple UV scale — direct multiplier from database value
  const uvScale = geometryParams.uvScale ?? 1

  // Stable URL key for dependency tracking
  const urlsKey = useMemo(() => JSON.stringify(textureUrls), [textureUrls])

  // Load all textures off the main thread with per-item progress
  useEffect(() => {
    const entries = Object.entries(textureUrls)
    const total = entries.length

    if (total === 0) {
      setLoadedTextures({})
      setTexturesReady(true)
      setLoadingProgress({ isLoading: false, loaded: 0, total: 0 })
      return
    }

    const abortController = new AbortController()
    let loadedCount = 0

    setTexturesReady(false)
    setLoadingProgress({ isLoading: true, loaded: 0, total })

    async function loadAll() {
      const result: Record<string, THREE.Texture> = {}

      await Promise.all(
        entries.map(async ([prop, info]) => {
          try {
            const texture = await loadTextureOffThread(
              info.url,
              info.isExrFormat,
              abortController.signal
            )
            if (!abortController.signal.aborted) {
              // Set color space based on texture property
              if (COLOR_TEXTURE_PROPS.has(prop)) {
                texture.colorSpace = THREE.SRGBColorSpace
              } else {
                texture.colorSpace = THREE.LinearSRGBColorSpace
              }
              texture.wrapS = THREE.RepeatWrapping
              texture.wrapT = THREE.RepeatWrapping
              result[prop] = texture

              loadedCount++
              setLoadingProgress({ isLoading: true, loaded: loadedCount, total })
            }
          } catch (err) {
            if (abortController.signal.aborted) return
            console.warn(`Failed to load ${prop} texture:`, err)
            loadedCount++
            setLoadingProgress({ isLoading: true, loaded: loadedCount, total })
          }
        })
      )

      if (!abortController.signal.aborted) {
        setLoadedTextures(result)
        setTexturesReady(true)
        setLoadingProgress({ isLoading: false, loaded: total, total })
      }
    }

    loadAll()
    return () => {
      abortController.abort()
    }
  }, [urlsKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // Apply tiling whenever textures or scale changes
  useEffect(() => {
    Object.values(loadedTextures).forEach((texture: THREE.Texture) => {
      if (texture && texture.wrapS !== undefined) {
        texture.repeat.set(uvScale, uvScale)
      }
    })
  }, [loadedTextures, uvScale])

  // Filter loaded textures by disabled state — instant, no re-fetch
  const disabled = disabledTextures ?? new Set<string>()
  const strengths = textureStrengths ?? {}
  const isDisabled = (prop: string): boolean => {
    const typeKeys = MATERIAL_PROP_TO_TYPE_KEY[prop]
    if (!typeKeys) return false
    return typeKeys.some(key => disabled.has(key))
  }

  /** Get strength value (0–1) for a material property */
  const getStrength = (prop: string): number => {
    const typeKeys = MATERIAL_PROP_TO_TYPE_KEY[prop]
    if (!typeKeys) return 1
    for (const key of typeKeys) {
      if (strengths[key] !== undefined) return strengths[key]
    }
    return 1
  }

  // Normal map scale vector controlled by strength — must be before any conditional return
  const normalStrength = getStrength('normalMap')
  const normalScale = useMemo(
    () => new THREE.Vector2(normalStrength, normalStrength),
    [normalStrength]
  )

  // Don't render the mesh until textures are loaded
  if (!texturesReady) return null

  const t = loadedTextures
  const hasAlphaMap = !!t.alphaMap && !isDisabled('alphaMap')
  const hasDisplacementMap = !!t.displacementMap && !isDisabled('displacementMap')

  // Key forces material re-mount when texture slots change.
  // Three.js compiles shaders based on which texture slots are non-null;
  // prop-diffing alone doesn't trigger shader recompilation.
  const materialKey = JSON.stringify([
    Array.from(disabled).sort(),
    strengths,
  ])

  return (
    <mesh ref={meshRef} castShadow receiveShadow geometry={geometry}>
      <meshStandardMaterial
        key={materialKey}
        map={(!isDisabled('map') && t.map) || null}
        normalMap={(!isDisabled('normalMap') && t.normalMap) || null}
        normalScale={normalScale}
        roughnessMap={(!isDisabled('roughnessMap') && t.roughnessMap) || null}
        metalnessMap={(!isDisabled('metalnessMap') && t.metalnessMap) || null}
        aoMap={(!isDisabled('aoMap') && t.aoMap) || null}
        aoMapIntensity={getStrength('aoMap')}
        emissiveMap={(!isDisabled('emissiveMap') && t.emissiveMap) || null}
        emissiveIntensity={getStrength('emissiveMap')}
        bumpMap={(!isDisabled('bumpMap') && t.bumpMap) || null}
        bumpScale={getStrength('bumpMap') * 0.5}
        alphaMap={(!isDisabled('alphaMap') && t.alphaMap) || null}
        displacementMap={hasDisplacementMap ? t.displacementMap : null}
        displacementScale={hasDisplacementMap ? getStrength('displacementMap') * 0.1 : 0}
        roughness={t.roughnessMap && !isDisabled('roughnessMap') ? 1 : 0.8}
        metalness={t.metalnessMap && !isDisabled('metalnessMap') ? 1 : 0}
        emissive={t.emissiveMap && !isDisabled('emissiveMap') ? '#ffffff' : '#000000'}
        transparent={hasAlphaMap}
        color="#ffffff"
        wireframe={geometryParams.wireframe || false}
      />
    </mesh>
  )
}

export function TexturedGeometry({
  geometryType,
  textureSet,
  geometryParams = {} as GeometryParams,
  disabledTextures,
  textureStrengths,
  onLoadingChange,
}: TexturedGeometryProps) {
  // Build ALL texture URLs — does NOT depend on disabledTextures
  const textureUrls = useMemo(
    () => buildTextureUrls(textureSet),
    [textureSet]
  )

  return (
    <TexturedMesh
      geometryType={geometryType}
      geometryParams={geometryParams}
      textureUrls={textureUrls}
      disabledTextures={disabledTextures}
      textureStrengths={textureStrengths}
      onLoadingChange={onLoadingChange}
    />
  )
}
