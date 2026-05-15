import * as THREE from 'three'
import * as UTIF from 'utif2'

export async function decodeTiffBufferToBitmap(
  buffer: ArrayBuffer
): Promise<ImageBitmap> {
  const ifds = UTIF.decode(buffer)
  if (ifds.length === 0) {
    throw new Error('TIFF contains no image directories')
  }
  const ifd = ifds[0]
  UTIF.decodeImage(buffer, ifd)
  const rgba = UTIF.toRGBA8(ifd)
  const imageData = new ImageData(
    new Uint8ClampedArray(rgba),
    ifd.width,
    ifd.height
  )
  return createImageBitmap(imageData, { imageOrientation: 'flipY' })
}

export async function decodeTiffBlobToBitmap(
  blob: Blob
): Promise<ImageBitmap> {
  return decodeTiffBufferToBitmap(await blob.arrayBuffer())
}

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
