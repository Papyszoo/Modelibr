/**
 * Utility for generating lightweight image previews.
 * Converts EXR files to PNG via Three.js EXRLoader + sharp,
 * and resizes large standard images to a browser-friendly size.
 */
import sharp from 'sharp'
import fs from 'fs'
import path from 'path'
import logger from './logger.js'

// Lazy-loaded EXRLoader (avoid import cost on every startup)
let EXRLoaderCtor = null
async function getEXRLoader() {
  if (!EXRLoaderCtor) {
    const mod = await import('three/examples/jsm/loaders/EXRLoader.js')
    EXRLoaderCtor = mod.EXRLoader
  }
  return new EXRLoaderCtor()
}

/**
 * Reinhard tone-mapping for HDR → LDR conversion.
 * Clamps negative values to 0, outputs 0-255.
 *
 * NOTE: This function is duplicated in src/frontend/src/features/texture-set/components/TexturePreview.tsx
 * (TypeScript version for the browser). Keep both implementations in sync.
 */
function toneMapReinhard(value) {
  if (value <= 0) return 0
  const mapped = value / (1 + value)
  const srgb = Math.pow(mapped, 1 / 2.2)
  return Math.min(255, Math.round(srgb * 255))
}

/**
 * Check whether a file path points to an EXR file.
 *
 * NOTE: A browser-compatible version exists in src/frontend/src/utils/fileUtils.ts.
 * Keep the detection logic in sync.
 */
export function isExrFile(filePath) {
  return path.extname(filePath).toLowerCase() === '.exr'
}

/**
 * Check whether a file is a browser-compatible image (PNG, JPEG, WebP, etc.).
 */
export function isBrowserImage(filePath) {
  const ext = path.extname(filePath).toLowerCase()
  return ['.png', '.jpg', '.jpeg', '.webp', '.bmp', '.gif', '.tga'].includes(
    ext
  )
}

/**
 * Convert an EXR file to a PNG buffer using Three.js EXRLoader.
 * Applies Reinhard tone mapping for HDR → LDR conversion.
 * @param {string} exrFilePath - Path to the EXR file
 * @param {number} maxSize - Maximum dimension (width or height)
 * @returns {Promise<Buffer>} PNG buffer
 */
export async function convertExrToPng(exrFilePath, maxSize = 2048) {
  const loader = await getEXRLoader()
  const fileBuffer = fs.readFileSync(exrFilePath)
  const arrayBuffer = fileBuffer.buffer.slice(
    fileBuffer.byteOffset,
    fileBuffer.byteOffset + fileBuffer.byteLength
  )

  const exrData = loader.parse(arrayBuffer)
  const { width, height, data, format } = exrData
  const isRGBA = format === 1023 // THREE.RGBAFormat
  const pixelStride = isRGBA ? 4 : 1

  // Convert float data to uint8 with tone mapping
  const pixels = Buffer.alloc(width * height * 4) // RGBA uint8

  for (let i = 0; i < width * height; i++) {
    const srcIdx = i * pixelStride
    const dstIdx = i * 4

    if (isRGBA) {
      pixels[dstIdx] = toneMapReinhard(data[srcIdx])
      pixels[dstIdx + 1] = toneMapReinhard(data[srcIdx + 1])
      pixels[dstIdx + 2] = toneMapReinhard(data[srcIdx + 2])
      pixels[dstIdx + 3] = 255
    } else {
      const val = toneMapReinhard(data[srcIdx])
      pixels[dstIdx] = val
      pixels[dstIdx + 1] = val
      pixels[dstIdx + 2] = val
      pixels[dstIdx + 3] = 255
    }
  }

  // Use sharp to create PNG from raw pixel data, resize if needed
  let pipeline = sharp(pixels, {
    raw: { width, height, channels: 4 },
  })

  if (width > maxSize || height > maxSize) {
    pipeline = pipeline.resize(maxSize, maxSize, {
      fit: 'inside',
      withoutEnlargement: true,
    })
  }

  return pipeline.png().toBuffer()
}

/**
 * Create a lightweight preview of a standard image file (PNG, JPEG, etc.).
 * Returns the resized image as a PNG buffer.
 * @param {string} imagePath - Path to the image file
 * @param {number} maxSize - Maximum dimension
 * @returns {Promise<Buffer>} PNG buffer
 */
export async function createImagePreview(imagePath, maxSize = 512) {
  return sharp(imagePath)
    .resize(maxSize, maxSize, {
      fit: 'inside',
      withoutEnlargement: true,
    })
    .png()
    .toBuffer()
}

/**
 * Generate a lightweight preview for any image file.
 * Handles EXR (via EXRLoader + tone-map) and standard formats (via sharp).
 * @param {string} filePath - Path to the image file
 * @param {number} maxSize - Max dimension for the preview
 * @returns {Promise<Buffer>} PNG buffer of the preview
 */
export async function generateFilePreview(filePath, maxSize = 512) {
  const ext = path.extname(filePath).toLowerCase()

  if (ext === '.exr') {
    return convertExrToPng(filePath, maxSize)
  }

  if (isBrowserImage(filePath)) {
    return createImagePreview(filePath, maxSize)
  }

  throw new Error(`Unsupported image format: ${ext}`)
}
