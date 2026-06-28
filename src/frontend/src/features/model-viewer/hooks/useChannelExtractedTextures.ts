import { useEffect, useMemo, useState } from 'react'
import * as THREE from 'three'
import * as TSL from 'three/tsl'
import * as THREE_GPU from 'three/webgpu'

import { TextureChannel } from '@/types'
import { isTiffFile } from '@/utils/fileUtils'
import { loadTiffTextureFromUrl } from '@/utils/tiffTextureLoader'

import {
  extractTextureChannel,
  getChannelUniformIndex,
} from '../../../../../asset-processor/lib/textureChannels.js'

/** The viewer renders with a WebGPURenderer (WebGL2 fallback), so extraction
 * goes through the shared TSL node pass rather than a GLSL ShaderMaterial. */
type Renderer = THREE_GPU.WebGPURenderer

/**
 * Extract a single channel from a texture via the shared TSL node pass
 * (asset-processor/lib/textureChannels.js). Returns a new grayscale texture;
 * `invert` flips the value (Glossiness → Roughness). Async — the WebGPU render
 * is async on both backends.
 */
function extractChannel(
  sourceTexture: THREE.Texture,
  channel: TextureChannel,
  renderer: Renderer,
  invert: boolean = false
): Promise<THREE.Texture> {
  return extractTextureChannel({
    THREE: THREE_GPU,
    TSL,
    renderer,
    source: sourceTexture,
    channelIndex: getChannelUniformIndex(channel),
    invert,
  })
}

/**
 * Invert an RGB texture via the shared TSL node pass. Used for Glossiness
 * textures sourced as full-RGB grayscale, which need flipping to behave as
 * roughness.
 */
function invertTexture(
  sourceTexture: THREE.Texture,
  renderer: Renderer
): Promise<THREE.Texture> {
  return extractTextureChannel({
    THREE: THREE_GPU,
    TSL,
    renderer,
    source: sourceTexture,
    rgbInvert: true,
  })
}

/**
 * Dispose a (possibly null) processed texture and the render target backing a
 * channel-extracted one (stashed on `userData.__channelRenderTarget` by the
 * shared extractor), so neither the texture nor its GPU target leaks.
 */
function disposeExtractedTexture(texture: THREE.Texture | null): void {
  if (!texture) return
  const rt = (
    texture.userData as { __channelRenderTarget?: { dispose(): void } }
  )?.__channelRenderTarget
  if (rt) rt.dispose()
  else texture.dispose()
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
  renderer: Renderer | null,
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

    const handleLoaded = async (
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
          loadedTextures[slotName] = await invertTexture(
            loadedTexture,
            renderer
          )
          loadedTexture.dispose()
        } else {
          loadedTextures[slotName] = loadedTexture
        }
      } else {
        loadedTextures[slotName] = await extractChannel(
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
            .then(async loadedTexture => {
              await handleLoaded(slotName, config, loadedTexture)
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
          async loadedTexture => {
            await handleLoaded(slotName, config, loadedTexture)
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
        Object.values(loadedTextures).forEach(disposeExtractedTexture)
        return
      }
      setTextures(loadedTextures)
    })

    // Cleanup on unmount or config change
    return () => {
      cancelled = true
      Object.values(loadedTextures).forEach(disposeExtractedTexture)
    }
  }, [configKey, renderer, textureConfigs, flipY])

  return textures
}

/**
 * Re-exported from the shared cross-runtime module (the worker thumbnail uses the
 * same channel numbering). Kept under the original name for external use/tests.
 */
export { getChannelUniformIndex as getChannelIndex }
