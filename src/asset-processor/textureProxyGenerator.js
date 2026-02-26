import sharp from 'sharp'
import path from 'path'
import fs from 'fs'
import os from 'os'
import FormData from 'form-data'
import logger from './logger.js'
import { config } from './config.js'

/**
 * Texture type classification for processing rules.
 * Maps TextureType enum values to processing categories.
 */
const TEXTURE_TYPE_CATEGORY = {
  1: 'srgb', // Albedo
  2: 'normal', // Normal
  3: 'linear', // Height
  4: 'linear', // AO
  5: 'linear', // Roughness
  6: 'linear', // Metallic
  9: 'srgb', // Emissive
  10: 'linear', // Bump
  11: 'linear', // Alpha
  12: 'linear', // Displacement
}

/**
 * Returns the processing category for a texture type.
 * @param {number} textureType - TextureType enum value
 * @returns {'srgb'|'normal'|'linear'} Processing category
 */
function getTextureCategory(textureType) {
  return TEXTURE_TYPE_CATEGORY[textureType] || 'linear'
}

/**
 * Re-normalizes a normal map after resizing.
 *
 * When a normal map is resized with any interpolation algorithm (bilinear, Lanczos),
 * the averaged normal vectors lose unit length (||v|| < 1.0), which flattens
 * surface detail in the rendered result. This function restores unit-length normals.
 *
 * Algorithm:
 *   1. Extract raw RGB pixel buffer (3 channels, no alpha)
 *   2. For each pixel:
 *      a. Remap RGB [0,255] → XYZ [-1,1]
 *      b. Compute length = sqrt(x² + y² + z²)
 *      c. If length > 0: normalize x/=length, y/=length, z/=length
 *      d. Remap XYZ [-1,1] → RGB [0,255]
 *   3. Return corrected buffer
 *
 * @param {Buffer} pixelBuffer - Raw RGB pixel data (3 bytes per pixel)
 * @param {number} width - Image width
 * @param {number} height - Image height
 * @returns {Buffer} Re-normalized pixel buffer
 */
function renormalizeNormalMap(pixelBuffer, width, height) {
  const pixelCount = width * height
  const buf = Buffer.from(pixelBuffer) // work on a copy

  for (let i = 0; i < pixelCount; i++) {
    const offset = i * 3

    // Remap [0, 255] → [-1, 1]
    let x = (buf[offset] / 255) * 2 - 1
    let y = (buf[offset + 1] / 255) * 2 - 1
    let z = (buf[offset + 2] / 255) * 2 - 1

    // Compute length
    const length = Math.sqrt(x * x + y * y + z * z)

    // Normalize (guard against degenerate zero-length vectors)
    if (length > 1e-6) {
      x /= length
      y /= length
      z /= length
    } else {
      // Default to pointing straight up (0, 0, 1) in tangent space
      x = 0
      y = 0
      z = 1
    }

    // Remap [-1, 1] → [0, 255]
    buf[offset] = Math.round((x + 1) / 2 * 255)
    buf[offset + 1] = Math.round((y + 1) / 2 * 255)
    buf[offset + 2] = Math.round((z + 1) / 2 * 255)
  }

  return buf
}

/**
 * Generates a resized proxy for a single texture file.
 *
 * Processing rules by texture category:
 * - sRGB (Albedo, Emissive): Standard Lanczos3 resize → WebP (quality 80)
 * - Linear (Roughness, Metallic, AO, Height, etc.): Linear-space resize → WebP (quality 90)
 * - Normal: Linear-space resize → re-normalization → PNG (lossless)
 *
 * @param {string} inputPath - Path to the original texture file
 * @param {number} textureType - TextureType enum value
 * @param {number} size - Target square side length (e.g. 512)
 * @param {string} outputDir - Directory to write the proxy file
 * @param {number} sourceChannel - Source channel: 0/5=RGB (full), 1=R, 2=G, 3=B, 4=A
 * @returns {Promise<{outputPath: string, fileName: string}>} Path and filename of generated proxy
 */
async function generateProxy(inputPath, textureType, size, outputDir, sourceChannel = 0) {
  const category = getTextureCategory(textureType)
  const baseName = path.basename(inputPath, path.extname(inputPath))
  // Append channel suffix to filename for split-channel textures to avoid collisions
  const channelSuffixes = { 1: '_R', 2: '_G', 3: '_B', 4: '_A' }
  const effectiveName = sourceChannel > 0 && sourceChannel <= 4
    ? `${baseName}${channelSuffixes[sourceChannel]}`
    : baseName

  if (category === 'normal') {
    return await generateNormalMapProxy(inputPath, size, outputDir, effectiveName, sourceChannel)
  } else if (category === 'linear') {
    return await generateLinearProxy(inputPath, size, outputDir, effectiveName, sourceChannel)
  } else {
    return await generateSrgbProxy(inputPath, size, outputDir, effectiveName, sourceChannel)
  }
}

/**
 * Generates a proxy for sRGB textures (Albedo, Emissive).
 * Standard Lanczos3 resize, saved as compressed WebP.
 * For split-channel textures, extracts the specific channel first.
 */
async function generateSrgbProxy(inputPath, size, outputDir, baseName, sourceChannel = 0) {
  const fileName = `${baseName}_proxy_${size}.webp`
  const outputPath = path.join(outputDir, fileName)

  let pipeline = sharp(inputPath)
    .resize(size, size, {
      fit: 'cover',
      kernel: sharp.kernel.lanczos3,
    })

  if (sourceChannel > 0 && sourceChannel <= 4) {
    // Extract specific channel for packed textures
    // sourceChannel: 1=R, 2=G, 3=B, 4=A → sharp extractChannel: 0,1,2,3
    pipeline = pipeline.extractChannel(sourceChannel - 1)
    await pipeline.webp({ lossless: true }).toFile(outputPath)
  } else {
    await pipeline.webp({ quality: 80 }).toFile(outputPath)
  }

  return { outputPath, fileName }
}

/**
 * Generates a proxy for linear data maps (Roughness, Metallic, AO, Height, etc.).
 * Uses lossless WebP to preserve exact data values — lossy compression shifts
 * pixel values (e.g. pure white 255 → 250) which is visible on data maps.
 * For split-channel textures (sourceChannel > 0), extracts the specific channel
 * instead of converting to grayscale, which would incorrectly blend all channels.
 */
async function generateLinearProxy(inputPath, size, outputDir, baseName, sourceChannel = 0) {
  const fileName = `${baseName}_proxy_${size}.webp`
  const outputPath = path.join(outputDir, fileName)

  let pipeline = sharp(inputPath)
    .resize(size, size, {
      fit: 'cover',
      kernel: sharp.kernel.lanczos3,
    })

  if (sourceChannel > 0 && sourceChannel <= 4) {
    // Extract the specific channel for packed textures (e.g., ARM map)
    // sourceChannel: 1=R, 2=G, 3=B, 4=A → sharp extractChannel: 0,1,2,3
    pipeline = pipeline.extractChannel(sourceChannel - 1)
  } else {
    // Full RGB texture → convert to grayscale (safe when R=G=B)
    pipeline = pipeline.removeAlpha().toColourspace('b-w')
  }

  await pipeline.webp({ lossless: true }).toFile(outputPath)

  return { outputPath, fileName }
}

/**
 * Generates a proxy for normal maps with re-normalization.
 *
 * Pipeline:
 *   1. Resize with Lanczos3 to target size
 *   2. Extract raw RGB pixel buffer
 *   3. Re-normalize all normal vectors to unit length
 *   4. Write back from raw buffer
 *   5. Save as PNG (lossless — lossy compression introduces block artifacts
 *      in normal vectors causing visible shading errors)
 */
async function generateNormalMapProxy(inputPath, size, outputDir, baseName, sourceChannel = 0) {
  // Normal maps with a specific source channel shouldn't be re-normalized;
  // fall back to linear proxy which just extracts the channel.
  if (sourceChannel > 0 && sourceChannel <= 4) {
    return await generateLinearProxy(inputPath, size, outputDir, baseName, sourceChannel)
  }

  const fileName = `${baseName}_proxy_${size}.png`
  const outputPath = path.join(outputDir, fileName)

  // Step 1: Resize to target size, force 3-channel RGB (no alpha)
  const resized = await sharp(inputPath)
    .resize(size, size, {
      fit: 'cover',
      kernel: sharp.kernel.lanczos3,
    })
    .removeAlpha()
    .toColourspace('srgb') // ensure 3 channels
    .raw()
    .toBuffer({ resolveWithObject: true })

  // Step 2-3: Re-normalize the normal vectors
  const { data: pixelBuffer, info } = resized
  const normalizedBuffer = renormalizeNormalMap(pixelBuffer, info.width, info.height)

  // Step 4-5: Write the re-normalized buffer to PNG
  await sharp(normalizedBuffer, {
    raw: {
      width: info.width,
      height: info.height,
      channels: 3,
    },
  })
    .png({ compressionLevel: 9 })
    .toFile(outputPath)

  return { outputPath, fileName }
}

/**
 * Generates web proxies for all textures in a texture set and uploads them to the API.
 *
 * @param {Object} textureSet - TextureSet data from the API
 * @param {Object} texturePaths - Map of textureType → {filePath, sourceChannel, textureId}
 * @param {number} size - Target proxy size (256, 512, 1024, 2048)
 * @param {import('axios').AxiosInstance} apiClient - Authenticated API client
 * @param {Object} jobLogger - Logger with job context
 * @returns {Promise<{generated: number, failed: number, skipped: number}>}
 */
export async function generateTextureProxies(
  textureSet,
  texturePaths,
  size,
  apiClient,
  jobLogger
) {
  const stats = { generated: 0, failed: 0, skipped: 0 }
  const workingDir = path.join(
    os.tmpdir(),
    `texture-proxy-${textureSet.id}-${Date.now()}`
  )
  fs.mkdirSync(workingDir, { recursive: true })

  try {
    for (const [textureType, textureInfo] of Object.entries(texturePaths)) {
      const { filePath, textureId, sourceChannel } = textureInfo

      if (!filePath || !fs.existsSync(filePath)) {
        jobLogger.warn('Texture file missing, skipping proxy generation', {
          textureType,
          textureId,
        })
        stats.skipped++
        continue
      }

      try {
        // Check if this is an EXR file — skip proxy generation for HDR formats
        const ext = path.extname(filePath).toLowerCase()
        if (ext === '.exr' || ext === '.hdr') {
          jobLogger.info('Skipping proxy for HDR format', {
            textureType,
            ext,
            textureId,
          })
          stats.skipped++
          continue
        }

        // Get the numeric texture type from the string key
        const numericType = parseInt(textureType, 10)
        if (isNaN(numericType)) {
          jobLogger.warn('Cannot parse texture type, skipping', {
            textureType,
            textureId,
          })
          stats.skipped++
          continue
        }

        jobLogger.info('Generating proxy', {
          textureType: numericType,
          textureId,
          size,
          sourceChannel: sourceChannel ?? 0,
          category: getTextureCategory(numericType),
        })

        // Generate the proxy — pass sourceChannel for split-channel extraction
        const { outputPath, fileName } = await generateProxy(
          filePath,
          numericType,
          size,
          workingDir,
          sourceChannel ?? 0
        )

        // Upload the proxy to the API
        const formData = new FormData()
        formData.append('file', fs.createReadStream(outputPath), {
          filename: fileName,
          contentType: fileName.endsWith('.png') ? 'image/png' : 'image/webp',
        })

        const uploadUrl = `/texture-sets/${textureSet.id}/textures/${textureId}/web-proxy?size=${size}`

        const response = await apiClient.put(uploadUrl, formData, {
          headers: {
            ...formData.getHeaders(),
          },
          timeout: 60000,
        })

        jobLogger.info('Proxy uploaded', {
          textureId,
          size,
          proxyFileId: response.data.fileId,
        })

        stats.generated++
      } catch (error) {
        jobLogger.error('Failed to generate/upload proxy', {
          textureType,
          textureId,
          error: error.message,
        })
        stats.failed++
      }
    }

    return stats
  } finally {
    // Clean up working directory
    try {
      fs.rmSync(workingDir, { recursive: true, force: true })
    } catch (_) {}
  }
}
