import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import sharp from 'sharp'

import { extractTextureDimensions } from '../textureProxyGenerator.js'
import { JobApiClient } from '../jobApiClient.js'

vi.mock('../logger.js', () => ({
  default: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}))

const jobLogger = { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() }

describe('extractTextureDimensions', () => {
  let tmpDir

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tex-dims-'))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('reads pixel dimensions and format from real image files', async () => {
    const filePath = path.join(tmpDir, 'albedo.png')
    await sharp({
      create: {
        width: 256,
        height: 128,
        channels: 3,
        background: { r: 10, g: 20, b: 30 },
      },
    })
      .png()
      .toFile(filePath)

    const items = await extractTextureDimensions(
      { 1: { filePath, textureId: 42, sourceChannel: 0 } },
      jobLogger
    )

    expect(items).toEqual([
      { textureId: 42, width: 256, height: 128, format: 'png' },
    ])
  })

  it('skips entries whose file is missing or undecodable', async () => {
    const items = await extractTextureDimensions(
      {
        1: { filePath: path.join(tmpDir, 'nope.png'), textureId: 1 },
        2: { filePath: undefined, textureId: 2 },
      },
      jobLogger
    )

    expect(items).toEqual([])
  })
})

describe('JobApiClient.finishSoundJob', () => {
  it('forwards the extracted audio metadata in the request body', async () => {
    const client = new JobApiClient()
    const post = vi.fn().mockResolvedValue({ status: 200, data: {} })
    client.apiClient = { post }

    await client.finishSoundJob(7, true, {
      waveformPath: 'waveforms/abc/waveform.png',
      sizeBytes: 1234,
      duration: 12.5,
      sampleRate: 48000,
      channels: 2,
      format: 'wav',
    })

    expect(post).toHaveBeenCalledTimes(1)
    const [url, body] = post.mock.calls[0]
    expect(url).toBe('/thumbnail-jobs/sounds/7/finish')
    expect(body).toMatchObject({
      success: true,
      waveformPath: 'waveforms/abc/waveform.png',
      sizeBytes: 1234,
      duration: 12.5,
      sampleRate: 48000,
      channels: 2,
      format: 'wav',
    })
  })

  it('sends nulls for audio metadata when not provided', async () => {
    const client = new JobApiClient()
    const post = vi.fn().mockResolvedValue({ status: 200, data: {} })
    client.apiClient = { post }

    await client.finishSoundJob(8, false, {}, 'boom')

    const [, body] = post.mock.calls[0]
    expect(body).toMatchObject({
      success: false,
      duration: null,
      sampleRate: null,
      channels: null,
      format: null,
      errorMessage: 'boom',
    })
  })
})
