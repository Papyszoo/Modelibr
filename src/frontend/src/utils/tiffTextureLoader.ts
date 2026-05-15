import * as THREE from 'three'
import * as UTIF from 'utif2'

import { decodeTiff } from '../../../asset-processor/lib/tiffDecode.js'

/**
 * Decode a TIFF ArrayBuffer to an ImageBitmap.
 *
 * By default the bitmap is in the TIFF's natural top-down orientation —
 * Three.js' `texture.flipY` then controls how the bitmap is uploaded.
 *
 * Pass `{ flipY: true }` to bake a vertical flip into the bitmap itself,
 * matching the convention used by `createImageBitmap(blob, { imageOrientation:
 * 'flipY' })`. This is what the texture-set sphere preview uses, so callers
 * that mix TIFF with that path should pass `flipY: true` for consistency.
 *
 * Hook callers that drive `texture.flipY` themselves (e.g. the model viewer's
 * `useChannelExtractedTextures`) should leave `flipY: false` so the
 * format-aware flip in Three.js works correctly — otherwise GLTF models
 * (which use `flipY = false`) render TIFFs upside-down.
 */
export async function decodeTiffBufferToBitmap(
  buffer: ArrayBuffer,
  options: { flipY?: boolean } = {}
): Promise<ImageBitmap> {
  const { width, height, rgba } = decodeTiff(buffer, { UTIF })
  const imageData = new ImageData(new Uint8ClampedArray(rgba), width, height)
  return createImageBitmap(
    imageData,
    options.flipY ? { imageOrientation: 'flipY' } : undefined
  )
}

export async function decodeTiffBlobToBitmap(
  blob: Blob,
  options: { flipY?: boolean } = {}
): Promise<ImageBitmap> {
  return decodeTiffBufferToBitmap(await blob.arrayBuffer(), options)
}

/**
 * Fetch a TIFF URL and return a Three.js Texture in natural orientation.
 * The caller owns `texture.flipY` — leave it as the per-model-format default
 * (Three.js default is `true`, GLTFLoader sets `false`).
 */
export async function loadTiffTextureFromUrl(
  url: string,
  signal?: AbortSignal
): Promise<THREE.Texture> {
  const response = await fetch(url, { signal })
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`)
  const bitmap = await decodeTiffBlobToBitmap(await response.blob())
  const texture = new THREE.Texture(bitmap)
  texture.needsUpdate = true
  return texture
}
