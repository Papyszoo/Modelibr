import { useEffect, useState, useMemo } from 'react'
import * as THREE from 'three'
import { TextureChannel } from '@/types'

/**
 * Vertex shader - simple passthrough
 */
const vertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position, 1.0);
  }
`

/**
 * Fragment shader - extracts a single channel and converts to grayscale
 */
const fragmentShader = `
  uniform sampler2D uTexture;
  uniform int uChannel; // 0=R, 1=G, 2=B, 3=A
  varying vec2 vUv;
  
  void main() {
    vec4 texColor = texture2D(uTexture, vUv);
    float channelValue;
    
    if (uChannel == 0) channelValue = texColor.r;
    else if (uChannel == 1) channelValue = texColor.g;
    else if (uChannel == 2) channelValue = texColor.b;
    else channelValue = texColor.a;
    
    gl_FragColor = vec4(channelValue, channelValue, channelValue, 1.0);
  }
`

/**
 * Get channel index for shader uniform
 */
function getChannelIndex(channel: TextureChannel): number {
  switch (channel) {
    case TextureChannel.R:
      return 0
    case TextureChannel.G:
      return 1
    case TextureChannel.B:
      return 2
    case TextureChannel.A:
      return 3
    default:
      return 0
  }
}

/**
 * Extract a single channel from a texture using WebGL rendering.
 * Returns a new texture with the extracted channel as grayscale.
 */
function extractChannel(
  sourceTexture: THREE.Texture,
  channel: TextureChannel,
  renderer: THREE.WebGLRenderer
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
    vertexShader,
    fragmentShader,
    uniforms: {
      uTexture: { value: sourceTexture },
      uChannel: { value: getChannelIndex(channel) },
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

export interface TextureConfig {
  url: string
  sourceChannel: TextureChannel
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
        .map(([key, config]) => `${key}:${config.url}:${config.sourceChannel}`)
        .join('|') + `:flipY=${flipY}`
    )
  }, [textureConfigs, flipY])

  useEffect(() => {
    if (!renderer) return

    const loader = new THREE.TextureLoader()
    const loadedTextures: ChannelExtractedTextures = {}
    const loadPromises: Promise<void>[] = []

    Object.entries(textureConfigs).forEach(([slotName, config]) => {
      if (!config.url) {
        loadedTextures[slotName] = null
        return
      }

      const promise = new Promise<void>(resolve => {
        loader.load(
          config.url,
          loadedTexture => {
            // Configure texture wrapping and flip
            loadedTexture.wrapS = THREE.RepeatWrapping
            loadedTexture.wrapT = THREE.RepeatWrapping
            loadedTexture.flipY = flipY

            if (config.sourceChannel === TextureChannel.RGB) {
              // RGB: use texture as-is
              loadedTextures[slotName] = loadedTexture
            } else {
              // Single channel: extract and convert to grayscale
              loadedTextures[slotName] = extractChannel(
                loadedTexture,
                config.sourceChannel,
                renderer
              )
              // Dispose original since we created a new one
              loadedTexture.dispose()
            }
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
      setTextures(loadedTextures)
    })

    // Cleanup on unmount or config change
    return () => {
      Object.values(loadedTextures).forEach(texture => {
        if (texture) texture.dispose()
      })
    }
  }, [configKey, renderer, textureConfigs, flipY])

  return textures
}

/**
 * Utility to get channel index for external use (e.g., testing)
 */
export { getChannelIndex }
