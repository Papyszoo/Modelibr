import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { EXRLoader } from 'three/examples/jsm/loaders/EXRLoader.js'

import { getFileUrl } from '@/features/models/api/modelApi'
import { applyDispNormalDisplacement } from '@/shared/three/sharedDisplacementNormal'
import { TextureChannel, type TextureSetDto, TextureType } from '@/types'
import { isExrFile, isTiffFile } from '@/utils/fileUtils'
import { decodeTiffBlobToBitmap } from '@/utils/tiffTextureLoader'

import { createPreviewGeometry } from '../utils/createPreviewGeometry'
import { type GeometryType } from './GeometrySelector'

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
  /** 0 = Original, 256/512/1024/2048 = proxy size */
  textureQuality?: number
}

interface TextureUrlInfo {
  url: string
  isExrFormat: boolean
  isTiffFormat: boolean
  /** Channel to extract client-side (1=R, 2=G, 3=B, 4=A, undefined=full RGB).
   *  Only set when textureQuality=0 (original) and texture uses a split channel.
   *  When using proxies, channel extraction is done server-side. */
  sourceChannel?: number
  /** Invert pixel values (255 - v) after decode. Used for Glossiness, which is
   *  stored as glossiness but rendered through Three's roughnessMap slot. */
  invert?: boolean
}

/** Build ALL texture URLs from the texture set (never filters by disabled state).
 *  When textureQuality > 0 and a proxy at that size exists, use the proxy file.
 *  For split-channel textures at original quality, includes sourceChannel for
 *  client-side channel extraction. */
function buildTextureUrls(
  textureSet: TextureSetDto,
  textureQuality: number = 0
): Record<string, TextureUrlInfo> {
  const urls: Record<string, TextureUrlInfo> = {}

  const makeInfo = (t: {
    fileId: number
    fileName?: string
    sourceChannel?: TextureChannel
    proxies?: { fileId: number; size: number }[]
  }): TextureUrlInfo => {
    // If a specific proxy size is requested and a matching proxy exists, use it.
    // Proxy files already have the correct channel extracted server-side.
    if (textureQuality > 0 && t.proxies && t.proxies.length > 0) {
      const proxy = t.proxies.find(p => p.size === textureQuality)
      if (proxy) {
        return {
          url: getFileUrl(proxy.fileId.toString()),
          isExrFormat: false, // proxies are always WebP/PNG, never EXR
          isTiffFormat: false,
        }
      }
    }
    // Original quality — include sourceChannel for client-side extraction
    const needsChannelExtract =
      t.sourceChannel !== undefined &&
      t.sourceChannel !== TextureChannel.RGB &&
      t.sourceChannel >= TextureChannel.R &&
      t.sourceChannel <= TextureChannel.A
    return {
      url: getFileUrl(t.fileId.toString()),
      isExrFormat: isExrFile(t.fileName),
      isTiffFormat: isTiffFile(t.fileName),
      sourceChannel: needsChannelExtract ? t.sourceChannel : undefined,
    }
  }

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

  // Glossiness is the inverse of Roughness — same slot, channel inverted at load
  const glossiness = textureSet.textures.find(
    t => t.textureType === TextureType.Glossiness
  )
  if (glossiness) urls.roughnessMap = { ...makeInfo(glossiness), invert: true }

  const metallic = textureSet.textures.find(
    t => t.textureType === TextureType.Metallic
  )
  if (metallic) urls.metalnessMap = makeInfo(metallic)

  const specular = textureSet.textures.find(
    t => t.textureType === TextureType.Specular
  )
  if (specular) urls.specularColorMap = makeInfo(specular)

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
  roughnessMap: ['Roughness', 'Glossiness'],
  metalnessMap: ['Metallic'],
  specularColorMap: ['Specular'],
  aoMap: ['AO'],
  emissiveMap: ['Emissive'],
  bumpMap: ['Bump'],
  alphaMap: ['Alpha'],
  displacementMap: ['Height', 'Displacement'],
}

/** Texture properties that carry color data (need sRGB encoding) */
const COLOR_TEXTURE_PROPS = new Set(['map', 'emissiveMap', 'specularColorMap'])

/**
 * Extract a single channel from an ImageBitmap, producing a grayscale canvas texture.
 * Optionally inverts the channel value (used for Glossiness → Roughness conversion).
 * @param bitmap Source ImageBitmap (will be closed after extraction)
 * @param channel 1=R, 2=G, 3=B, 4=A
 * @param invert If true, output 255 - channelValue instead of channelValue
 */
function extractChannelFromBitmap(
  bitmap: ImageBitmap,
  channel: number,
  invert: boolean = false
): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(bitmap, 0, 0)
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const data = imageData.data
  const offset = channel - 1 // 1→0, 2→1, 3→2, 4→3

  for (let i = 0; i < data.length; i += 4) {
    const raw = data[i + offset]
    const v = invert ? 255 - raw : raw
    data[i] = v // R
    data[i + 1] = v // G
    data[i + 2] = v // B
    data[i + 3] = 255
  }

  ctx.putImageData(imageData, 0, 0)
  bitmap.close()
  return canvas
}

/**
 * Invert the RGB channels of an EXR-loaded texture in place. EXR stores
 * linear-light values, so the Glossiness → Roughness inversion is `1 - v`.
 * Three's EXRLoader returns either Float32 or HalfFloat (Uint16) pixel data;
 * both layouts are handled. Alpha is preserved.
 */
function invertExrTextureInPlace(texture: THREE.Texture): void {
  const img = texture.image as
    | { data?: Float32Array | Uint16Array; width: number; height: number }
    | undefined
  const data = img?.data
  if (!data) return

  if (data instanceof Float32Array) {
    for (let i = 0; i < data.length; i += 4) {
      data[i] = 1 - data[i]
      data[i + 1] = 1 - data[i + 1]
      data[i + 2] = 1 - data[i + 2]
    }
  } else if (data instanceof Uint16Array) {
    // HalfFloat path — decode, invert, re-encode each value.
    for (let i = 0; i < data.length; i += 4) {
      for (let c = 0; c < 3; c++) {
        const v = THREE.DataUtils.fromHalfFloat(data[i + c])
        data[i + c] = THREE.DataUtils.toHalfFloat(1 - v)
      }
    }
  } else {
    return
  }
  texture.needsUpdate = true
}

/**
 * Invert RGB pixel values (255 - v) of an ImageBitmap. Alpha is preserved.
 * Used for Glossiness textures sourced as full-RGB grayscale, where we need
 * to flip the channel before feeding it into Three's roughnessMap slot.
 * @param bitmap Source ImageBitmap (will be closed after inversion)
 */
function invertBitmap(bitmap: ImageBitmap): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(bitmap, 0, 0)
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const data = imageData.data

  for (let i = 0; i < data.length; i += 4) {
    data[i] = 255 - data[i]
    data[i + 1] = 255 - data[i + 1]
    data[i + 2] = 255 - data[i + 2]
  }

  ctx.putImageData(imageData, 0, 0)
  bitmap.close()
  return canvas
}

/**
 * Load a single texture off the main thread using fetch + createImageBitmap.
 * Falls back to TextureLoader for formats that don't support ImageBitmap.
 * Accepts a pre-fetched blob to enable URL deduplication across split-channel textures.
 */
async function loadTextureOffThread(
  url: string,
  isExr: boolean,
  isTiff: boolean,
  signal: AbortSignal,
  sourceChannel?: number,
  cachedBlob?: Blob,
  invert: boolean = false
): Promise<THREE.Texture> {
  if (isExr) {
    // EXR must use the specialised loader — no ImageBitmap path
    const exrLoader = new EXRLoader()
    const texture = await exrLoader.loadAsync(url)
    if (invert) invertExrTextureInPlace(texture)
    return texture
  }

  // Fetch blob (or use cached one for dedup), then decode off-thread
  let blob: Blob
  if (cachedBlob) {
    blob = cachedBlob
  } else {
    const response = await fetch(url, { signal })
    if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`)
    blob = await response.blob()
  }

  // Pre-flip TIFF to match the non-TIFF path (createImageBitmap with
  // imageOrientation: 'flipY'). Both produce a top-down-flipped bitmap that
  // texture.flipY = true (THREE default) leaves visually upright on the sphere.
  const bitmap = isTiff
    ? await decodeTiffBlobToBitmap(blob, { flipY: true })
    : await createImageBitmap(blob, { imageOrientation: 'flipY' })

  // If a specific channel needs extraction, do it via canvas (inversion fused in)
  if (sourceChannel && sourceChannel >= 1 && sourceChannel <= 4) {
    const canvas = extractChannelFromBitmap(bitmap, sourceChannel, invert)
    const texture = new THREE.CanvasTexture(canvas)
    texture.needsUpdate = true
    return texture
  }

  // Full-RGB path with inversion (e.g. Glossiness as a normal grayscale image)
  if (invert) {
    const canvas = invertBitmap(bitmap)
    const texture = new THREE.CanvasTexture(canvas)
    texture.needsUpdate = true
    return texture
  }

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
    () => createPreviewGeometry(geometryType),
    [geometryType]
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
  }, [hasNormalMap, geometryType])

  // Simple UV scale — direct multiplier from database value
  const uvScale = geometryParams.uvScale ?? 1

  // Stable URL key for dependency tracking
  const urlsKey = useMemo(() => JSON.stringify(textureUrls), [textureUrls])

  // Load all textures off the main thread with per-item progress.
  // Deduplicates fetches: when multiple texture slots share the same URL
  // (split-channel textures), the file is downloaded once and reused.
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

      // Step 1: Deduplicate — fetch each unique URL once
      const uniqueUrls = new Map<string, { isExr: boolean; isTiff: boolean }>()
      for (const [, info] of entries) {
        if (!uniqueUrls.has(info.url)) {
          uniqueUrls.set(info.url, {
            isExr: info.isExrFormat,
            isTiff: info.isTiffFormat,
          })
        }
      }

      const blobCache = new Map<string, Blob>()
      await Promise.all(
        Array.from(uniqueUrls.entries()).map(async ([url, fmt]) => {
          if (fmt.isExr) return // EXR uses its own loader, no blob caching
          try {
            const response = await fetch(url, {
              signal: abortController.signal,
            })
            if (!response.ok) throw new Error(`HTTP ${response.status}`)
            blobCache.set(url, await response.blob())
          } catch (err) {
            if (!abortController.signal.aborted) {
              console.warn(`Failed to fetch ${url}:`, err)
            }
          }
        })
      )

      if (abortController.signal.aborted) return

      // Step 2: Create textures per entry, with channel extraction where needed
      await Promise.all(
        entries.map(async ([prop, info]) => {
          try {
            const texture = await loadTextureOffThread(
              info.url,
              info.isExrFormat,
              info.isTiffFormat,
              abortController.signal,
              info.sourceChannel,
              blobCache.get(info.url),
              info.invert
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
              setLoadingProgress({
                isLoading: true,
                loaded: loadedCount,
                total,
              })
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
  const hasDisplacementMap =
    !!t.displacementMap && !isDisabled('displacementMap')

  // Key forces material re-mount when texture slots change.
  // Three.js compiles shaders based on which texture slots are non-null;
  // prop-diffing alone doesn't trigger shader recompilation.
  const materialKey = JSON.stringify([Array.from(disabled).sort(), strengths])

  return (
    <mesh ref={meshRef} castShadow receiveShadow geometry={geometry}>
      <meshPhysicalMaterial
        key={materialKey}
        ref={(mat: THREE.MeshPhysicalMaterial | null) => {
          if (mat) applyDispNormalDisplacement(mat)
        }}
        map={(!isDisabled('map') && t.map) || null}
        normalMap={(!isDisabled('normalMap') && t.normalMap) || null}
        normalScale={normalScale}
        roughnessMap={(!isDisabled('roughnessMap') && t.roughnessMap) || null}
        metalnessMap={(!isDisabled('metalnessMap') && t.metalnessMap) || null}
        specularColorMap={
          (!isDisabled('specularColorMap') && t.specularColorMap) || null
        }
        specularIntensity={
          t.specularColorMap && !isDisabled('specularColorMap') ? 1 : 0
        }
        aoMap={(!isDisabled('aoMap') && t.aoMap) || null}
        aoMapIntensity={getStrength('aoMap')}
        emissiveMap={(!isDisabled('emissiveMap') && t.emissiveMap) || null}
        emissiveIntensity={getStrength('emissiveMap')}
        bumpMap={(!isDisabled('bumpMap') && t.bumpMap) || null}
        bumpScale={getStrength('bumpMap') * 0.5}
        alphaMap={(!isDisabled('alphaMap') && t.alphaMap) || null}
        displacementMap={hasDisplacementMap ? t.displacementMap : null}
        displacementScale={
          hasDisplacementMap ? getStrength('displacementMap') * 0.02 : 0
        }
        displacementBias={
          hasDisplacementMap ? -(getStrength('displacementMap') * 0.02) / 2 : 0
        }
        roughness={t.roughnessMap && !isDisabled('roughnessMap') ? 1 : 0.8}
        metalness={t.metalnessMap && !isDisabled('metalnessMap') ? 1 : 0}
        emissive={
          t.emissiveMap && !isDisabled('emissiveMap') ? '#ffffff' : '#000000'
        }
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
  textureQuality = 0,
}: TexturedGeometryProps) {
  // Build ALL texture URLs — does NOT depend on disabledTextures
  // When textureQuality > 0, use proxy files where available
  const textureUrls = useMemo(
    () => buildTextureUrls(textureSet, textureQuality),
    [textureSet, textureQuality]
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
