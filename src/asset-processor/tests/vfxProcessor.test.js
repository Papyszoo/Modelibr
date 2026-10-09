import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { VfxProcessor } from '../processors/vfxProcessor.js'

/**
 * The processor is the queue side of an animated vfx thumbnail: claim, render,
 * encode, upload, close the job. Each step is somewhere a job can be left open or
 * a picture stored against the wrong thing.
 */
describe('VfxProcessor', () => {
  let processor
  let jobLogger

  const frames = [
    { pixels: Buffer.from('a'), width: 256, height: 256 },
    { pixels: Buffer.from('b'), width: 256, height: 256 },
  ]

  beforeEach(() => {
    processor = new VfxProcessor()
    jobLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }

    processor.vfxRenderer = {
      render: vi.fn().mockResolvedValue({
        frames,
        windowSeconds: 2,
        frameDelayMs: 1000,
      }),
      dispose: vi.fn(),
    }
    processor.frameEncoder = {
      encodeFrames: vi
        .fn()
        .mockResolvedValue({ webpPath: '/tmp/job-x/thumbnail.webp' }),
      cleanupDirectory: vi.fn().mockResolvedValue(undefined),
      cleanupOldFiles: vi.fn().mockResolvedValue(undefined),
    }
    processor.vfxApiService = {
      uploadThumbnail: vi
        .fn()
        .mockResolvedValue({ success: true, data: { sizeBytes: 321 } }),
      finishJob: vi.fn().mockResolvedValue(undefined),
    }
    processor.jobEventService = {
      logJobStarted: vi.fn().mockResolvedValue(undefined),
      logJobCompleted: vi.fn().mockResolvedValue(undefined),
      logJobFailed: vi.fn().mockResolvedValue(undefined),
    }
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders the effect the job names and uploads the encoded loop against it', async () => {
    const result = await processor.process({ id: 5, vfxId: 12 }, jobLogger)

    expect(processor.vfxRenderer.render).toHaveBeenCalledWith(
      { vfxId: 12 },
      jobLogger,
      undefined
    )
    expect(processor.vfxApiService.uploadThumbnail).toHaveBeenCalledWith(
      12,
      '/tmp/job-x/thumbnail.webp'
    )
    expect(result).toMatchObject({
      vfxId: 12,
      frameCount: 2,
      windowSeconds: 2,
      frameDelayMs: 1000,
      sizeBytes: 321,
    })
  })

  // Regression: the loop must play at the effect's real speed. The encoder's global
  // framerate would hold every frame 200 ms regardless of how far apart the instants
  // are, so a long effect would play several times too fast.
  it('hands the renderer-computed frame delay to the encoder, animated only', async () => {
    await processor.process({ id: 5, vfxId: 12 }, jobLogger)

    expect(processor.frameEncoder.encodeFrames).toHaveBeenCalledWith(
      frames,
      jobLogger,
      { frameDelayMs: 1000, animatedOnly: true }
    )
  })

  it('removes its temporary encoding directory after the upload', async () => {
    await processor.process({ id: 5, vfxId: 12 }, jobLogger)

    expect(processor.frameEncoder.cleanupDirectory).toHaveBeenCalledWith(
      '/tmp/job-x'
    )
  })

  it('fails the job when the thumbnail cannot be stored', async () => {
    // A swallowed upload failure would complete the job and leave the effect on its
    // placeholder with nothing to retry.
    processor.vfxApiService.uploadThumbnail.mockResolvedValue({
      success: false,
      error: 'disk full',
    })

    await expect(
      processor.process({ id: 5, vfxId: 12 }, jobLogger)
    ).rejects.toThrow(/disk full/)
    expect(processor.frameEncoder.cleanupDirectory).toHaveBeenCalled()
  })

  it('stores nothing for a job the queue has already timed out', async () => {
    await expect(
      processor.process({ id: 5, vfxId: 12 }, jobLogger, { aborted: true })
    ).rejects.toThrow(/aborted/)

    expect(processor.frameEncoder.encodeFrames).not.toHaveBeenCalled()
    expect(processor.vfxApiService.uploadThumbnail).not.toHaveBeenCalled()
  })

  it('refuses a job with no effect to render', async () => {
    await expect(processor.process({ id: 5 }, jobLogger)).rejects.toThrow(
      /vfxId/
    )
  })

  it('finishes vfx jobs through the vfx endpoint, not the model one', async () => {
    await processor.markCompleted({ id: 5 })
    expect(processor.vfxApiService.finishJob).toHaveBeenCalledWith(5, true)

    await processor.markFailed({ id: 5 }, 'boom')
    expect(processor.vfxApiService.finishJob).toHaveBeenCalledWith(
      5,
      false,
      'boom'
    )
  })

  it('marks the job failed with the render error when the page never becomes ready', async () => {
    const message =
      'Vfx 12 did not become render-ready within 60000ms; no frames were captured'
    processor.vfxRenderer.render.mockRejectedValueOnce(new Error(message))

    await expect(processor.execute({ id: 5, vfxId: 12 })).rejects.toThrow(
      message
    )

    expect(processor.vfxApiService.uploadThumbnail).not.toHaveBeenCalled()
    expect(processor.vfxApiService.finishJob).toHaveBeenCalledWith(
      5,
      false,
      message
    )
  })
})
