import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'

import { config } from '../config.js'
import { ThumbnailApiService } from '../thumbnailApiService.js'

// Silence the service's logger
vi.mock('../logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  },
}))

const originalRendering = { ...config.rendering }

let tmpDir
let webpPath
let pngPath
let posterPath

beforeEach(() => {
  Object.assign(config.rendering, originalRendering)

  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'thumb-test-'))
  webpPath = path.join(tmpDir, 'thumbnail.webp')
  pngPath = path.join(tmpDir, 'thumbnail.png')
  posterPath = path.join(tmpDir, 'poster.jpg')
  // Real files so the existsSync gate in uploadMultipleThumbnails passes
  fs.writeFileSync(webpPath, Buffer.from([0x52, 0x49, 0x46, 0x46]))
  fs.writeFileSync(pngPath, Buffer.from([0x89, 0x50, 0x4e, 0x47]))
  fs.writeFileSync(posterPath, Buffer.from([0xff, 0xd8, 0xff, 0xe0]))
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

/**
 * Replace the two single-file upload methods on a service instance with spies
 * so we can capture the metadata each call would have sent to the API. The
 * fan-out method `uploadMultipleThumbnails` is what we're testing here.
 */
function spyOnUploads(service) {
  const webpSpy = vi.fn().mockResolvedValue({ success: true, data: {} })
  const pngSpy = vi.fn().mockResolvedValue({ success: true, data: {} })
  service.uploadThumbnail = webpSpy
  service.uploadPngThumbnail = pngSpy
  return { webpSpy, pngSpy }
}

describe('ThumbnailApiService.uploadMultipleThumbnails metadata', () => {
  it('passes live config.rendering size as width/height for webp upload', async () => {
    config.rendering.outputWidth = 1024
    config.rendering.outputHeight = 1024

    const service = new ThumbnailApiService()
    const { webpSpy } = spyOnUploads(service)

    await service.uploadMultipleThumbnails(7, { webpPath, pngPath }, 11)

    expect(webpSpy).toHaveBeenCalledTimes(1)
    const [, , metadata] = webpSpy.mock.calls[0]
    expect(metadata).toEqual({ width: 1024, height: 1024 })
  })

  it('passes live config.rendering size as width/height for png upload', async () => {
    config.rendering.outputWidth = 2048
    config.rendering.outputHeight = 2048

    const service = new ThumbnailApiService()
    const { pngSpy } = spyOnUploads(service)

    await service.uploadMultipleThumbnails(7, { webpPath, pngPath }, 11)

    expect(pngSpy).toHaveBeenCalledTimes(1)
    const [, , metadata] = pngSpy.mock.calls[0]
    expect(metadata).toEqual({ width: 2048, height: 2048 })
  })

  it('falls back to poster upload (with config size) when png upload fails', async () => {
    config.rendering.outputWidth = 512
    config.rendering.outputHeight = 512

    const service = new ThumbnailApiService()
    const webpSpy = vi.fn().mockResolvedValue({ success: true, data: {} })
    const pngSpy = vi.fn().mockResolvedValue({ success: false })
    service.uploadThumbnail = webpSpy
    service.uploadPngThumbnail = pngSpy

    await service.uploadMultipleThumbnails(
      7,
      { webpPath, pngPath, posterPath },
      11
    )

    // Two webp-shaped upload calls: 1 for the actual webp, 1 for the poster
    expect(webpSpy).toHaveBeenCalledTimes(2)
    const posterCall = webpSpy.mock.calls[1]
    const [, posterFilePath, posterMetadata] = posterCall
    expect(posterFilePath).toBe(posterPath)
    expect(posterMetadata).toEqual({ width: 512, height: 512 })
  })

  it('reflects a size change between calls — i.e. reads config live, not at construction time', async () => {
    const service = new ThumbnailApiService()
    const { webpSpy } = spyOnUploads(service)

    config.rendering.outputWidth = 128
    config.rendering.outputHeight = 128
    await service.uploadMultipleThumbnails(7, { webpPath, pngPath }, 11)

    config.rendering.outputWidth = 2048
    config.rendering.outputHeight = 2048
    await service.uploadMultipleThumbnails(7, { webpPath, pngPath }, 11)

    expect(webpSpy.mock.calls[0][2]).toEqual({ width: 128, height: 128 })
    expect(webpSpy.mock.calls[1][2]).toEqual({ width: 2048, height: 2048 })
  })

  it('does NOT hardcode 256 — guards against the regression we just fixed', async () => {
    config.rendering.outputWidth = 64
    config.rendering.outputHeight = 64

    const service = new ThumbnailApiService()
    const { webpSpy, pngSpy } = spyOnUploads(service)

    await service.uploadMultipleThumbnails(7, { webpPath, pngPath }, 11)

    for (const spy of [webpSpy, pngSpy]) {
      for (const call of spy.mock.calls) {
        expect(call[2].width).toBe(64)
        expect(call[2].height).toBe(64)
        expect(call[2].width).not.toBe(256)
      }
    }
  })
})
