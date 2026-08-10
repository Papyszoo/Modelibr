import { describe, it, expect } from 'vitest'
import {
  dominantPalette,
  opaqueCoverage,
  RENDER_SIGNALS_VERSION,
} from '../lib/renderSignals.js'

// Build an RGBA image from a per-pixel fn returning [r,g,b,a].
function makeImage(width, height, fn) {
  const data = new Uint8Array(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = fn(x, y)
      const i = (y * width + x) * 4
      data[i] = r
      data[i + 1] = g
      data[i + 2] = b
      data[i + 3] = a
    }
  }
  return { data, width, height, channels: 4 }
}

describe('dominantPalette', () => {
  it('finds the most common colour first and ignores transparent background', () => {
    // 3/4 red, 1/4 blue, on a transparent border row that must be ignored.
    const img = makeImage(4, 4, (x, y) => {
      if (y === 0) return [0, 255, 0, 0] // transparent → ignored
      return x < 3 ? [200, 0, 0, 255] : [0, 0, 200, 255]
    })
    const palette = dominantPalette(img, 5)
    expect(palette[0].color).toEqual([200, 0, 0])
    expect(palette[0].weight).toBeGreaterThan(palette[1].weight)
    // Green (transparent) never appears.
    expect(palette.some(p => p.color[1] === 255)).toBe(false)
  })

  it('is deterministic across runs', () => {
    const img = makeImage(8, 8, (x, y) => [x * 30, y * 30, 100, 255])
    expect(dominantPalette(img)).toEqual(dominantPalette(img))
  })

  it('returns empty for a fully transparent image', () => {
    const img = makeImage(4, 4, () => [10, 20, 30, 0])
    expect(dominantPalette(img)).toEqual([])
  })
})

describe('opaqueCoverage', () => {
  it('measures the non-background fraction', () => {
    const img = makeImage(2, 2, (x, y) =>
      x === 0 && y === 0 ? [1, 1, 1, 255] : [0, 0, 0, 0]
    )
    expect(opaqueCoverage(img)).toBe(0.25)
  })
})

describe('version', () => {
  it('is exported', () => {
    expect(RENDER_SIGNALS_VERSION).toBe(1)
  })
})
