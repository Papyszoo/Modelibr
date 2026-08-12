import sharp from 'sharp'
import fs from 'fs'
import crypto from 'crypto'
import {
  computeMaterialStats,
  MATERIAL_STATS_VERSION,
} from './lib/materialStats.js'
import { config } from './config.js'
import logger from './logger.js'

/**
 * Texture-set extraction: deterministic pixel statistics for a reusable material
 * set, ready to upsert into the extraction substrate (AssetType="TextureSet").
 *
 * The heavy lifting (seam/detail/channel maths) lives in the pure, cross-runtime
 * `lib/materialStats.js`; this worker-only module does the file IO sharp needs
 * (decode + fixed-size resize) and the channel-assignment *validation* the prompt
 * asks for - advisory warnings only, never a hard reject, because stylised
 * materials legitimately break the rules.
 *
 * Determinism: every image is resized to a fixed working square before stats, so
 * the numbers depend on the material, not on the source resolution.
 */

/** sourceChannel 1=R,2=G,3=B,4=A → sharp extractChannel index (0-based); 0 = whole RGB. */
function extractChannelIndex(sourceChannel) {
  return sourceChannel >= 1 && sourceChannel <= 4 ? sourceChannel - 1 : null
}

/** SHA-256 of a file's bytes - the per-file half of the set-level invalidation key. */
async function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256')
    const stream = fs.createReadStream(filePath)
    stream.on('error', reject)
    stream.on('data', chunk => hash.update(chunk))
    stream.on('end', () => resolve(hash.digest('hex')))
  })
}

/**
 * Load one texture as a fixed-size raw pixel buffer for stats.
 * @returns {Promise<{data: Buffer, width: number, height: number, channels: number}>}
 */
async function loadRaw(filePath, sourceChannel, sampleSize) {
  let pipeline = sharp(filePath).resize(sampleSize, sampleSize, {
    fit: 'fill',
    kernel: sharp.kernel.lanczos3,
  })

  const channelIndex = extractChannelIndex(sourceChannel)
  if (channelIndex !== null) {
    pipeline = pipeline.extractChannel(channelIndex)
  }

  const { data, info } = await pipeline
    .raw()
    .toBuffer({ resolveWithObject: true })
  return {
    data,
    width: info.width,
    height: info.height,
    channels: info.channels,
  }
}

/**
 * Advisory channel-assignment checks. Returns warning strings (empty = clean).
 * Deliberately conservative - only flags the clear-cut cases.
 */
function validateAssignments(textureType, stats) {
  const warnings = []
  const type = String(textureType || '').toLowerCase()

  if (stats.placeholder) {
    warnings.push(
      `${textureType}: image is a ${stats.placeholder} placeholder (constant pixels)`
    )
  }

  // A tangent-space normal map is dominated by blue with R/G near mid-grey.
  if (type.includes('normal') && stats.placeholder === null) {
    const [r, g, b] = stats.meanColor
    const looksNormal =
      b !== null && b >= 180 && r !== null && r < 200 && g !== null && g < 200
    if (!looksNormal) {
      warnings.push(
        `${textureType}: assigned as a normal map but mean colour ${JSON.stringify(stats.meanColor)} does not look tangent-space (expected blue-dominant)`
      )
    }
  }

  return warnings
}

/**
 * Compute the full texture-set extraction from downloaded texture paths.
 *
 * @param {Object} texturePaths - map of textureType → { filePath, sourceChannel }
 *   as produced by ModelDataService.downloadTextureSetFiles.
 * @param {Object} [options]
 * @param {number} [options.sampleSize] - working square size (defaults to config).
 * @returns {Promise<{fileSha256: string, payload: Object, warnings: string[]}|null>}
 *   null when nothing could be analysed.
 */
export async function computeTextureSetExtraction(texturePaths, options = {}) {
  const sampleSize = options.sampleSize || config.extraction.materialSampleSize
  const entries = Object.entries(texturePaths || {})
  if (entries.length === 0) return null

  const channels = {}
  const warnings = []
  const hashParts = []

  for (const [textureType, info] of entries) {
    if (!info?.filePath) continue
    try {
      const sourceChannel = info.sourceChannel ?? 0
      const [fileSha, image] = await Promise.all([
        sha256File(info.filePath),
        loadRaw(info.filePath, sourceChannel, sampleSize),
      ])
      hashParts.push(`${textureType}:${sourceChannel}:${fileSha}`)

      const stats = computeMaterialStats(image)
      channels[textureType] = { sourceChannel, ...stats }
      warnings.push(...validateAssignments(textureType, stats))
    } catch (error) {
      warnings.push(`${textureType}: analysis skipped (${error.message})`)
      logger.warn('Texture stat extraction skipped for one channel', {
        textureType,
        error: error.message,
      })
    }
  }

  if (Object.keys(channels).length === 0) return null

  // Set-level invalidation key: any texture byte change (or channel reassignment)
  // changes the hash, so re-extraction upserts in place.
  const fileSha256 = crypto
    .createHash('sha256')
    .update(hashParts.sort().join('|'))
    .digest('hex')

  const payload = {
    version: MATERIAL_STATS_VERSION,
    sampleSize,
    channelCount: Object.keys(channels).length,
    channels,
  }

  return { fileSha256, payload, warnings }
}

export const TEXTURE_SET_EXTRACTOR_VERSION = MATERIAL_STATS_VERSION
