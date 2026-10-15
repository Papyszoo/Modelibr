import fs from 'fs'

import sharp from 'sharp'
import webpmux from 'node-webpmux'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { FrameEncoderService } from '../frameEncoderService.js'

const jobLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }

async function frame(shade) {
  const pixels = await sharp({
    create: {
      width: 16,
      height: 16,
      channels: 3,
      background: { r: shade, g: shade, b: shade },
    },
  })
    .png()
    .toBuffer()
  return { pixels, width: 16, height: 16 }
}

describe('FrameEncoderService', () => {
  const encoder = new FrameEncoderService()
  let workingDir

  afterEach(() => {
    if (workingDir) fs.rmSync(workingDir, { recursive: true, force: true })
    workingDir = undefined
  })

  async function frameDelays(webpPath) {
    const image = new webpmux.Image()
    await image.load(webpPath)
    return image.frames.map(entry => entry.delay)
  }

  // Regression: every encoded clip was held at the global 5 fps. A vfx loop's frames
  // are spaced by the effect's own length, so it needs its own delay to play at the
  // effect's real speed.
  it('holds each frame for the requested delay instead of the global framerate', async () => {
    const result = await encoder.encodeFrames(
      [await frame(10), await frame(120), await frame(240)],
      jobLogger,
      { frameDelayMs: 667, animatedOnly: true }
    )
    workingDir = result.webpPath.replace(/[\\/][^\\/]+$/, '')

    expect(await frameDelays(result.webpPath)).toEqual([667, 667, 667])
  })

  it('skips the poster and still when only the animation is wanted', async () => {
    const result = await encoder.encodeFrames(
      [await frame(10), await frame(240)],
      jobLogger,
      { animatedOnly: true }
    )
    workingDir = result.webpPath.replace(/[\\/][^\\/]+$/, '')

    expect(result.posterPath).toBeNull()
    expect(result.pngPath).toBeNull()
    expect(fs.existsSync(result.webpPath)).toBe(true)
  })

  it('still produces the poster and still by default, as model thumbnails expect', async () => {
    const result = await encoder.encodeFrames(
      [await frame(10), await frame(240)],
      jobLogger
    )
    workingDir = result.webpPath.replace(/[\\/][^\\/]+$/, '')

    expect(fs.existsSync(result.posterPath)).toBe(true)
    expect(fs.existsSync(result.pngPath)).toBe(true)
  })
})
