/**
 * Material pixel statistics — deterministic image analysis for reusable material
 * sets (NOT model-bound textures). Pure functions over raw pixel buffers (as
 * produced by `sharp(...).raw().toBuffer({ resolveWithObject: true })`), so they
 * run in the worker and are fully unit-testable without decoding a file.
 *
 * These stats are the searchable signal an agent needs to place a material —
 * above all tileability ("does this wrap?") and detail frequency ("how big is
 * one tile?"). Channel-assignment validation (prompt 22) is advisory and lives
 * elsewhere; this module only measures.
 *
 * Convention: `image = { data: Uint8Array|Buffer, width, height, channels }`
 * with 8-bit samples, channels ∈ {1,3,4} (grey / RGB / RGBA).
 */

export const MATERIAL_STATS_VERSION = 1

function round(value, decimals = 4) {
  if (!Number.isFinite(value)) return null
  const f = 10 ** decimals
  const r = Math.round(value * f) / f
  return r === 0 ? 0 : r
}

function sampleAt(image, x, y, channel) {
  const { data, width, channels } = image
  return data[(y * width + x) * channels + channel]
}

/** Mean and variance (0..255 scale) of one channel. */
export function channelStats(image, channel = 0) {
  const { width, height } = image
  const n = width * height
  if (n === 0) return { mean: null, variance: null }

  let sum = 0
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      sum += sampleAt(image, x, y, channel)
    }
  }
  const mean = sum / n

  let sqSum = 0
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const d = sampleAt(image, x, y, channel) - mean
      sqSum += d * d
    }
  }
  return { mean: round(mean), variance: round(sqSum / n) }
}

/**
 * Tileability via edge-wrap difference: how well opposite edges match when the
 * texture is repeated. Returns normalised seam errors in 0..1 (0 = seamless).
 * The single most important boolean for a tiling material derives from
 * `seamScore` against a threshold (calibrated later, prompt 26).
 */
export function tileability(image) {
  const { width, height, channels } = image
  if (width < 2 || height < 2) {
    return { horizontal: null, vertical: null, seamScore: null }
  }
  const compareChannels = Math.min(channels, 3)

  let hSum = 0
  for (let y = 0; y < height; y++) {
    for (let c = 0; c < compareChannels; c++) {
      hSum += Math.abs(
        sampleAt(image, 0, y, c) - sampleAt(image, width - 1, y, c)
      )
    }
  }
  const horizontal = hSum / (height * compareChannels * 255)

  let vSum = 0
  for (let x = 0; x < width; x++) {
    for (let c = 0; c < compareChannels; c++) {
      vSum += Math.abs(
        sampleAt(image, x, 0, c) - sampleAt(image, x, height - 1, c)
      )
    }
  }
  const vertical = vSum / (width * compareChannels * 255)

  return {
    horizontal: round(horizontal),
    vertical: round(vertical),
    seamScore: round(Math.max(horizontal, vertical)),
  }
}

/**
 * Detail frequency: mean absolute difference between horizontally/vertically
 * adjacent pixels, normalised 0..1. The best deterministic proxy for tiling
 * scale — fine noise (high) tiles convincingly small, large features (low) need
 * a bigger tile. Nothing else in the system answers "how big is one tile".
 */
export function detailFrequency(image) {
  const { width, height, channels } = image
  if (width < 2 || height < 2) return null
  const compareChannels = Math.min(channels, 3)

  let sum = 0
  let count = 0
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      for (let c = 0; c < compareChannels; c++) {
        const here = sampleAt(image, x, y, c)
        if (x + 1 < width) {
          sum += Math.abs(here - sampleAt(image, x + 1, y, c))
          count++
        }
        if (y + 1 < height) {
          sum += Math.abs(here - sampleAt(image, x, y + 1, c))
          count++
        }
      }
    }
  }
  return count === 0 ? null : round(sum / (count * 255))
}

/** Mean RGB colour (0..255 per channel). Grey images repeat the single channel. */
export function meanColor(image) {
  const { channels } = image
  if (channels >= 3) {
    return [
      channelStats(image, 0).mean,
      channelStats(image, 1).mean,
      channelStats(image, 2).mean,
    ]
  }
  const g = channelStats(image, 0).mean
  return [g, g, g]
}

/**
 * Placeholder detection: an all-constant map (every sample identical) is almost
 * always a stand-in (flat black/white/grey). Returns null when not a placeholder,
 * else a label.
 */
export function placeholderKind(image) {
  const { data, width, height, channels } = image
  const n = width * height
  if (n === 0) return 'empty'

  const first = data[0]
  for (let i = 0; i < n * channels; i++) {
    if (data[i] !== first) return null
  }
  if (first === 0) return 'black'
  if (first === 255) return 'white'
  return 'constant'
}

/** Compute the full deterministic stat block for one material image. */
export function computeMaterialStats(image) {
  const placeholder = placeholderKind(image)
  return {
    version: MATERIAL_STATS_VERSION,
    width: image.width,
    height: image.height,
    channels: image.channels,
    placeholder,
    tileability: tileability(image),
    detailFrequency: detailFrequency(image),
    meanColor: meanColor(image),
    roughness: channelStats(image, 0),
  }
}
