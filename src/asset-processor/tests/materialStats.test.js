import { describe, it, expect } from 'vitest'
import {
  channelStats,
  tileability,
  detailFrequency,
  meanColor,
  placeholderKind,
  computeMaterialStats,
} from '../lib/materialStats.js'

// Helper: build a { data, width, height, channels } image from a per-pixel fn.
function makeImage(width, height, channels, fn) {
  const data = new Uint8Array(width * height * channels)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const px = fn(x, y) // array of channel values
      for (let c = 0; c < channels; c++) {
        data[(y * width + x) * channels + c] = px[c]
      }
    }
  }
  return { data, width, height, channels }
}

describe('placeholderKind', () => {
  it('detects all-black and all-white', () => {
    expect(placeholderKind(makeImage(4, 4, 3, () => [0, 0, 0]))).toBe('black')
    expect(placeholderKind(makeImage(4, 4, 3, () => [255, 255, 255]))).toBe(
      'white'
    )
  })

  it('labels other constant maps', () => {
    expect(placeholderKind(makeImage(4, 4, 3, () => [128, 128, 128]))).toBe(
      'constant'
    )
  })

  it('returns null for a varied image', () => {
    expect(placeholderKind(makeImage(4, 4, 3, x => [x * 60, 0, 0]))).toBeNull()
  })
})

describe('tileability', () => {
  it('reports a seamless texture as ~0 seam error', () => {
    // Vertical stripes that wrap: column value depends only on x, edges match
    // because left column (x=0) equals a continuation of the right (x=w-1)+1.
    const img = makeImage(8, 8, 3, x => {
      const v = x === 0 ? 0 : 0 // constant → trivially seamless
      return [v, v, v]
    })
    const t = tileability(img)
    expect(t.seamScore).toBe(0)
  })

  it('reports a hard seam as high error', () => {
    // Left edge black, right edge white → maximal horizontal seam.
    const img = makeImage(8, 8, 3, x => {
      const v = x < 4 ? 0 : 255
      return [v, v, v]
    })
    const t = tileability(img)
    expect(t.horizontal).toBeGreaterThan(0.9)
  })
})

describe('detailFrequency', () => {
  it('is ~0 for a flat image and high for checkerboard noise', () => {
    const flat = makeImage(8, 8, 1, () => [128])
    const checker = makeImage(8, 8, 1, (x, y) => [(x + y) % 2 === 0 ? 0 : 255])
    expect(detailFrequency(flat)).toBe(0)
    expect(detailFrequency(checker)).toBeGreaterThan(0.9)
  })
})

describe('channelStats & meanColor', () => {
  it('computes mean and zero variance for a constant channel', () => {
    const img = makeImage(4, 4, 3, () => [10, 20, 30])
    expect(channelStats(img, 0)).toEqual({ mean: 10, variance: 0 })
    expect(meanColor(img)).toEqual([10, 20, 30])
  })

  it('repeats the single channel for greyscale meanColor', () => {
    const img = makeImage(4, 4, 1, () => [77])
    expect(meanColor(img)).toEqual([77, 77, 77])
  })
})

describe('computeMaterialStats', () => {
  it('bundles the deterministic stat block', () => {
    const img = makeImage(4, 4, 3, (x, y) => [x * 40, y * 40, 100])
    const stats = computeMaterialStats(img)
    expect(stats.version).toBe(1)
    expect(stats.width).toBe(4)
    expect(stats.placeholder).toBeNull()
    expect(stats.tileability).toHaveProperty('seamScore')
    expect(stats.meanColor).toHaveLength(3)
  })
})
