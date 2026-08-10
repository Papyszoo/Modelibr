import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import sharp from 'sharp'

import {
  computeTextureSetExtraction,
  TEXTURE_SET_EXTRACTOR_VERSION,
} from '../textureSetExtractor.js'

vi.mock('../logger.js', () => ({
  default: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}))

describe('computeTextureSetExtraction', () => {
  let tmpDir

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tex-set-'))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  // Write a raw RGB image (per-pixel fn) to a PNG file and return its path.
  async function writeImage(name, width, height, fn) {
    const data = Buffer.alloc(width * height * 3)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const [r, g, b] = fn(x, y)
        const i = (y * width + x) * 3
        data[i] = r
        data[i + 1] = g
        data[i + 2] = b
      }
    }
    const filePath = path.join(tmpDir, name)
    await sharp(data, { raw: { width, height, channels: 3 } })
      .png()
      .toFile(filePath)
    return filePath
  }

  it('returns null when there are no textures', async () => {
    expect(await computeTextureSetExtraction({})).toBeNull()
  })

  it('computes per-channel stats keyed by texture type', async () => {
    const albedo = await writeImage('albedo.png', 32, 32, (x, y) => [
      (x * 8) % 256,
      (y * 8) % 256,
      64,
    ])

    const result = await computeTextureSetExtraction(
      { Albedo: { filePath: albedo, sourceChannel: 0 } },
      { sampleSize: 32 }
    )

    expect(result).not.toBeNull()
    expect(result.payload.version).toBe(TEXTURE_SET_EXTRACTOR_VERSION)
    expect(result.payload.channelCount).toBe(1)
    expect(result.payload.channels.Albedo).toBeDefined()
    expect(result.payload.channels.Albedo.tileability).toBeDefined()
    expect(result.payload.channels.Albedo.detailFrequency).not.toBeNull()
    // 64-char hex invalidation key.
    expect(result.fileSha256).toMatch(/^[0-9a-f]{64}$/)
  })

  it('distinguishes a seamless tiling image from a non-tiling one', async () => {
    // Seamless: constant colour → opposite edges match exactly (seamScore 0).
    const tiling = await writeImage('tiling.png', 32, 32, () => [120, 120, 120])
    // Non-tiling: strong left→right ramp → opposite edges differ maximally.
    const nonTiling = await writeImage('ramp.png', 32, 32, x => [
      Math.round((x / 31) * 255),
      0,
      0,
    ])

    const tilingResult = await computeTextureSetExtraction(
      { Albedo: { filePath: tiling, sourceChannel: 0 } },
      { sampleSize: 32 }
    )
    const rampResult = await computeTextureSetExtraction(
      { Albedo: { filePath: nonTiling, sourceChannel: 0 } },
      { sampleSize: 32 }
    )

    const tilingSeam =
      tilingResult.payload.channels.Albedo.tileability.seamScore
    const rampSeam = rampResult.payload.channels.Albedo.tileability.seamScore
    expect(tilingSeam).toBe(0)
    // The ramp's R channel jumps 0→255 across the seam; averaged over RGB that is
    // ~0.33, and it must clearly exceed the seamless image's zero.
    expect(rampSeam).toBeGreaterThan(0.2)
    expect(rampSeam).toBeGreaterThan(tilingSeam)
  })

  it('warns (advisory) when a normal map is not blue-dominant', async () => {
    // Assigned as Normal but actually a reddish albedo → should warn, not throw.
    const fakeNormal = await writeImage('normal.png', 16, 16, () => [
      200, 40, 40,
    ])

    const result = await computeTextureSetExtraction(
      { Normal: { filePath: fakeNormal, sourceChannel: 0 } },
      { sampleSize: 16 }
    )

    expect(result.warnings.some(w => /normal map/i.test(w))).toBe(true)
  })

  it('does not warn for a proper tangent-space normal map', async () => {
    const realNormal = await writeImage('good-normal.png', 16, 16, () => [
      128, 128, 255,
    ])

    const result = await computeTextureSetExtraction(
      { Normal: { filePath: realNormal, sourceChannel: 0 } },
      { sampleSize: 16 }
    )

    // The flat normal is a "constant" placeholder, so that warning is allowed,
    // but the "does not look tangent-space" one must NOT appear.
    expect(result.warnings.some(w => /tangent-space/i.test(w))).toBe(false)
  })

  it('flags an all-black placeholder', async () => {
    const black = await writeImage('black.png', 16, 16, () => [0, 0, 0])

    const result = await computeTextureSetExtraction(
      { Roughness: { filePath: black, sourceChannel: 0 } },
      { sampleSize: 16 }
    )

    expect(result.payload.channels.Roughness.placeholder).toBe('black')
    expect(result.warnings.some(w => /placeholder/i.test(w))).toBe(true)
  })

  it('is idempotent: identical inputs yield the same invalidation hash', async () => {
    const albedo = await writeImage('a.png', 16, 16, (x, y) => [
      x * 4,
      y * 4,
      10,
    ])

    const first = await computeTextureSetExtraction(
      { Albedo: { filePath: albedo, sourceChannel: 0 } },
      { sampleSize: 16 }
    )
    const second = await computeTextureSetExtraction(
      { Albedo: { filePath: albedo, sourceChannel: 0 } },
      { sampleSize: 16 }
    )

    expect(first.fileSha256).toBe(second.fileSha256)
    expect(first.payload).toEqual(second.payload)
  })
})
