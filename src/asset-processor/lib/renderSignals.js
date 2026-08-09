/**
 * Deterministic signals that fall out of the frozen turntable render for free
 * (prompt 25): a dominant colour palette and a hollow-shell heuristic. Pure
 * functions over a raw RGBA pixel buffer (as produced by
 * `sharp(frame).ensureAlpha().raw().toBuffer({ resolveWithObject: true })`), so
 * they run in the worker and are unit-testable without rendering.
 *
 * Convention: `image = { data, width, height, channels }`, channels ∈ {3,4},
 * 8-bit samples. Fully-transparent pixels (alpha 0) are treated as background and
 * ignored so the neutral render backdrop never dominates the palette.
 */

export const RENDER_SIGNALS_VERSION = 1

function sampleAlpha(data, idx, channels) {
  return channels >= 4 ? data[idx + 3] : 255
}

/**
 * Dominant palette by coarse colour quantisation (default 4 bits/channel → 4096
 * buckets). Returns up to `k` colours as { color: [r,g,b], weight } sorted by
 * weight desc. Deterministic: fixed bucketing + a stable tie-break on bucket key.
 */
export function dominantPalette(image, k = 5, bits = 4) {
  const { data, width, height, channels } = image
  const shift = 8 - bits
  const buckets = new Map()
  let counted = 0

  for (let p = 0; p < width * height; p++) {
    const idx = p * channels
    if (sampleAlpha(data, idx, channels) === 0) continue
    const r = data[idx] >> shift
    const g = data[idx + 1] >> shift
    const b = data[idx + 2] >> shift
    const key = (r << (2 * bits)) | (g << bits) | b
    const bucket = buckets.get(key)
    if (bucket) {
      bucket.count++
      bucket.r += data[idx]
      bucket.g += data[idx + 1]
      bucket.b += data[idx + 2]
    } else {
      buckets.set(key, {
        count: 1,
        r: data[idx],
        g: data[idx + 1],
        b: data[idx + 2],
      })
    }
    counted++
  }

  if (counted === 0) return []

  return [...buckets.entries()]
    .sort((a, b) => b[1].count - a[1].count || a[0] - b[0])
    .slice(0, k)
    .map(([, v]) => ({
      color: [
        Math.round(v.r / v.count),
        Math.round(v.g / v.count),
        Math.round(v.b / v.count),
      ],
      weight: Math.round((v.count / counted) * 10000) / 10000,
    }))
}

/**
 * Opaque coverage: fraction of pixels that are not background (alpha > 0). A cheap
 * shared input for framing checks and the hollow-shell heuristic.
 */
export function opaqueCoverage(image) {
  const { data, width, height, channels } = image
  const n = width * height
  if (n === 0) return 0
  let opaque = 0
  for (let p = 0; p < n; p++) {
    if (sampleAlpha(data, p * channels, channels) > 0) opaque++
  }
  return Math.round((opaque / n) * 10000) / 10000
}
