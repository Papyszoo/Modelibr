import path from 'path'

import { BaseProcessor } from './baseProcessor.js'
import { VfxRenderer } from '../vfxRenderer.js'
import { VfxApiService } from '../vfxApiService.js'
import { FrameEncoderService } from '../frameEncoderService.js'

/**
 * Renders the animated thumbnail of a visual effect.
 *
 * Pipeline: photograph the app's own VFX page at evenly spaced instants across
 * the whole effect (vfxRenderer.js) -> encode the stills as one looping animated
 * WebP -> upload it -> close the job. Nothing here knows what a particle is; the
 * app draws, this class is the queue side of it.
 */
export class VfxProcessor extends BaseProcessor {
  constructor() {
    super()
    this.vfxRenderer = null
    this.frameEncoder = null
    this.vfxApiService = new VfxApiService()
  }

  get processorType() {
    return 'vfx'
  }

  /**
   * @param {Object} job - Queue job; needs vfxId.
   * @param {Object} jobLogger - Logger with job context.
   * @param {AbortSignal} [signal] - Set when the queue times this job out.
   */
  async process(job, jobLogger, signal) {
    const vfxId = job.vfxId
    if (!vfxId) {
      throw new Error('Job is missing vfxId')
    }

    if (!this.vfxRenderer) {
      this.vfxRenderer = new VfxRenderer()
      await this.vfxRenderer.initialize()
    }
    if (!this.frameEncoder) {
      this.frameEncoder = new FrameEncoderService()
    }

    const { frames, windowSeconds, frameDelayMs } =
      await this.vfxRenderer.render({ vfxId }, jobLogger, signal)

    if (signal?.aborted) {
      // The queue gave up on this job; storing a picture now would race a
      // retry that another worker may already hold.
      throw new Error('Vfx render aborted by job timeout')
    }

    const encoded = await this.frameEncoder.encodeFrames(frames, jobLogger, {
      frameDelayMs,
      animatedOnly: true,
    })

    try {
      const upload = await this.vfxApiService.uploadThumbnail(
        vfxId,
        encoded.webpPath
      )
      if (!upload.success) {
        throw new Error(`Failed to store vfx thumbnail: ${upload.error}`)
      }

      jobLogger.info('Vfx thumbnail stored', {
        vfxId,
        frameCount: frames.length,
        windowSeconds,
        frameDelayMs,
      })

      return {
        vfxId,
        frameCount: frames.length,
        windowSeconds,
        frameDelayMs,
        sizeBytes: upload.data?.sizeBytes,
      }
    } finally {
      await this.frameEncoder.cleanupDirectory(path.dirname(encoded.webpPath))
    }
  }

  /**
   * Vfx jobs finish through their own endpoint. The default one resolves a
   * Thumbnail for a model version, which an effect does not have.
   */
  async markCompleted(job) {
    await this.vfxApiService.finishJob(job.id, true)
  }

  async markFailed(job, errorMessage) {
    await this.vfxApiService.finishJob(job.id, false, errorMessage)
  }

  async cleanup() {
    if (this.vfxRenderer) {
      await this.vfxRenderer.dispose()
      this.vfxRenderer = null
    }
    if (this.frameEncoder) {
      await this.frameEncoder.cleanupOldFiles(0)
      this.frameEncoder = null
    }
  }
}
