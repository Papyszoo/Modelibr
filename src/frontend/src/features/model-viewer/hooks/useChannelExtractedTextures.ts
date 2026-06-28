import { useEffect, useMemo, useState } from 'react'
import * as THREE from 'three'

import { TextureChannel } from '@/types'
import { isTiffFile } from '@/utils/fileUtils'
import { loadTiffTextureFromUrl } from '@/utils/tiffTextureLoader'

import {
  CHANNEL_EXTRACT_FRAGMENT_SHADER,
  CHANNEL_VERTEX_SHADER,
  getChannelUniformIndex,
  RGB_INVERT_FRAGMENT_SHADER,
} from '../../../../../asset-processor/lib/textureChannels.js'

/**
 * Extract a single channel from a texture using WebGL rendering.
 * Returns a new texture with the extracted channel as grayscale.
 * If invert=true, the channel value is flipped (used for Glossiness → Roughness).
 */
function extractChannel(
  sourceTexture: THREE.Texture,
  channel: TextureChannel,
  renderer: THREE.WebGLRenderer,
  invert: boolean = false
): THREE.Texture {
  const width = sourceTexture.image?.width || 1024
  const height = sourceTexture.image?.height || 1024

  // Create render target
  const renderTarget = new THREE.WebGLRenderTarget(width, height, {
    format: THREE.RGBAFormat,
    type: THREE.UnsignedByteType,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
  })

  // Create scene with fullscreen quad
  const scene = new THREE.Scene()
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)

  const geometry = new THREE.PlaneGeometry(2, 2)
  const material = new THREE.ShaderMaterial({
    vertexShader: CHANNEL_VERTEX_SHADER,
    fragmentShader: CHANNEL_EXTRACT_FRAGMENT_SHADER,
    uniforms: {
      uTexture: { value: sourceTexture },
      uChannel: { value: getChannelUniformIndex(channel) },
      uInvert: { value: invert ? 1 : 0 },
    },
  })

  const mesh = new THREE.Mesh(geometry, material)
  scene.add(mesh)

  // Render to target
  renderer.setRenderTarget(renderTarget)
  renderer.render(scene, camera)
  renderer.setRenderTarget(null)

  // Create texture from render target
  const extractedTexture = renderTarget.texture.clone()
  extractedTexture.needsUpdate = true

  // Copy wrapping and filtering settings
  extractedTexture.wrapS = sourceTexture.wrapS
  extractedTexture.wrapT = sourceTexture.wrapT
  extractedTexture.flipY = sourceTexture.flipY

  // Cleanup
  geometry.dispose()
  material.dispose()
  renderTarget.dispose()

  return extractedTexture
}

/**
 * Invert an RGB texture using WebGL rendering. Used for Glossiness textures
 * sourced as full-RGB grayscale, which need to be flipped to behave as roughness.
 */
function invertTexture(
  sourceTexture: THREE.Texture,
  renderer: THREE.WebGLRenderer
): THREE.Texture {
  const width = sourceTexture.image?.width || 1024
  const height = sourceTexture.image?.height || 1024

  const renderTarget = new THREE.WebGLRenderTarget(width, height, {
    format: THREE.RGBAFormat,
    type: THREE.UnsignedByteType,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
  })

  const scene = new THREE.Scene()
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  const geometry = new THREE.PlaneGeometry(2, 2)
  const material = new THREE.ShaderMaterial({
    vertexShader: CHANNEL_VERTEX_SHADER,
    fragmentShader: RGB_INVERT_FRAGMENT_SHADER,
    uniforms: { uTexture: { value: sourceTexture } },
  })

  const mesh = new THREE.Mesh(geometry, material)
  scene.add(mesh)
  renderer.setRenderTarget(renderTarget)
  renderer.render(scene, camera)
  renderer.setRenderTarget(null)

  const inverted = renderTarget.texture.clone()
  inverted.needsUpdate = true
  inverted.wrapS = sourceTexture.wrapS
  inverted.wrapT = sourceTexture.wrapT
  inverted.flipY = sourceTexture.flipY

  geometry.dispose()
  material.dispose()
  renderTarget.dispose()

  return inverted
}

export interface TextureConfig {
  url: string
  sourceChannel: TextureChannel
  /** Original file name (used to detect formats the browser cannot decode natively, e.g. TIFF). */
  fileName?: string
  /** Invert texture values (255-v) after load. Used for Glossiness → Roughness. */
  invert?: boolean
}

export interface ChannelExtractedTextures {
  [key: string]: THREE.Texture | null
}

/**
 * Hook that loads textures and extracts individual channels as needed.
 * For RGB textures, returns the original. For R/G/B/A, extracts that channel as grayscale.
 *
 * @param textureConfigs - Map of texture slot names to their config (url + sourceChannel)
 * @param renderer - Three.js renderer for GPU-based extraction
 * @param flipY - Whether to flip textures on Y axis (false for GLTF/GLB, true for OBJ/FBX)
 * @returns Object with processed textures keyed by slot name
 */
export function useChannelExtractedTextures(
  textureConfigs: Record<string, TextureConfig>,
  renderer: THREE.WebGLRenderer | null,
  flipY: boolean = true
): ChannelExtractedTextures {
  const [textures, setTextures] = useState<ChannelExtractedTextures>({})

  // Create a stable key for the configs to track changes
  const configKey = useMemo(() => {
    return (
      Object.entries(textureConfigs)
        .map(
          ([key, config]) =>
            `${key}:${config.url}:${config.sourceChannel}:${config.fileName ?? ''}:${config.invert ? 1 : 0}`
        )
        .join('|') + `:flipY=${flipY}`
    )
  }, [textureConfigs, flipY])

  useEffect(() => {
    if (!renderer) return

    // Guard against the effect re-running before async loads settle. Without
    // this, the cleanup disposes whatever is already in loadedTextures while
    // later-resolving promises keep writing into the same map, and the final
    // Promise.all(...).then(setTextures) installs a state of dead GPU objects.
    let cancelled = false

    const loader = new THREE.TextureLoader()
    const loadedTextures: ChannelExtractedTextures = {}
    const loadPromises: Promise<void>[] = []

    const handleLoaded = (
      slotName: string,
      config: TextureConfig,
      loadedTexture: THREE.Texture
    ) => {
      if (cancelled) {
        loadedTexture.dispose()
        return
      }
      // Configure texture wrapping and flip
      loadedTexture.wrapS = THREE.RepeatWrapping
      loadedTexture.wrapT = THREE.RepeatWrapping
      loadedTexture.flipY = flipY

      if (config.sourceChannel === TextureChannel.RGB) {
        if (config.invert) {
          loadedTextures[slotName] = invertTexture(loadedTexture, renderer)
          loadedTexture.dispose()
        } else {
          loadedTextures[slotName] = loadedTexture
        }
      } else {
        loadedTextures[slotName] = extractChannel(
          loadedTexture,
          config.sourceChannel,
          renderer,
          config.invert ?? false
        )
        loadedTexture.dispose()
      }
    }

    Object.entries(textureConfigs).forEach(([slotName, config]) => {
      if (!config.url) {
        loadedTextures[slotName] = null
        return
      }

      const promise = new Promise<void>(resolve => {
        if (isTiffFile(config.fileName)) {
          loadTiffTextureFromUrl(config.url)
            .then(loadedTexture => {
              handleLoaded(slotName, config, loadedTexture)
              resolve()
            })
            .catch(error => {
              console.error(
                `Failed to load TIFF texture for ${slotName}:`,
                error
              )
              loadedTextures[slotName] = null
              resolve()
            })
          return
        }

        loader.load(
          config.url,
          loadedTexture => {
            handleLoaded(slotName, config, loadedTexture)
            resolve()
          },
          undefined,
          error => {
            console.error(`Failed to load texture for ${slotName}:`, error)
            loadedTextures[slotName] = null
            resolve()
          }
        )
      })

      loadPromises.push(promise)
    })

    Promise.all(loadPromises).then(() => {
      if (cancelled) {
        // Cleanup already ran; dispose any textures that landed afterward
        // so they don't leak. setTextures must not be called.
        Object.values(loadedTextures).forEach(texture => {
          if (texture) texture.dispose()
        })
        return
      }
      setTextures(loadedTextures)
    })

    // Cleanup on unmount or config change
    return () => {
      cancelled = true
      Object.values(loadedTextures).forEach(texture => {
        if (texture) texture.dispose()
      })
    }
  }, [configKey, renderer, textureConfigs, flipY])

  return textures
}

/**
 * Re-exported from the shared cross-runtime module (the worker thumbnail uses the
 * same channel numbering). Kept under the original name for external use/tests.
 */
export { getChannelUniformIndex as getChannelIndex }
