import { BaseProcessor } from './baseProcessor.js'
import { EnvironmentMapFileService } from '../environmentMapFileService.js'
import { EnvironmentMapStorageService } from '../environmentMapStorageService.js'
import { RendererPool } from '../rendererPool.js'
import { FrameEncoderService } from '../frameEncoderService.js'
import { config } from '../config.js'

export class EnvironmentMapProcessor extends BaseProcessor {
  constructor() {
    super()
    this.environmentMapFileService = new EnvironmentMapFileService()
    this.environmentMapStorageService = new EnvironmentMapStorageService()
    this.rendererPool = null
    this.frameEncoder = null
  }

  get processorType() {
    return 'environment-map'
  }

  async process(job, jobLogger) {
    let renderer = null
    let source = null

    try {
      const environmentMapId = job.environmentMapId
      if (!environmentMapId) {
        throw new Error('Job is missing environmentMapId')
      }

      const environmentMap =
        await this.environmentMapFileService.getEnvironmentMap(environmentMapId)

      const preferredVariantId =
        job.environmentMapVariantId || job.variantId || job.previewVariantId
      const variant = this.environmentMapFileService.selectVariant(
        environmentMap,
        preferredVariantId
      )

      source =
        await this.environmentMapFileService.downloadVariantSource(variant)

      if (!this.rendererPool) {
        this.rendererPool = new RendererPool()
        await this.rendererPool.initialize()
      }

      renderer = await this.rendererPool.acquire()

      await renderer.loadEnvironmentPreview(source, config.environmentMaps)

      if (!config.orbit.enabled) {
        throw new Error(
          'Orbit rendering is disabled — cannot generate environment map thumbnails'
        )
      }

      const frames = await this._renderOrbitFrames(job, jobLogger, renderer)

      if (!config.encoding.enabled) {
        throw new Error(
          'Frame encoding is disabled — cannot generate environment map thumbnails'
        )
      }

      const encodingResult = await this._encodeFrames(job.id, jobLogger, frames)
      const storageResult = await this._storeThumbnail(
        job.id,
        environmentMapId,
        variant.id,
        jobLogger,
        encodingResult
      )

      return storageResult
    } finally {
      if (renderer) {
        this.rendererPool.release(renderer)
      }
      if (source) {
        await this.environmentMapFileService.cleanupSource(source)
      }
    }
  }

  async _renderOrbitFrames(job, jobLogger, renderer) {
    const baseDistance = await renderer.calculateOptimalCameraDistance()
    const cameraDistance =
      baseDistance * config.environmentMaps.cameraDistanceMultiplier
    const angleRange = config.orbit.endAngle - config.orbit.startAngle
    const frameCount = Math.ceil(angleRange / config.orbit.angleStep)

    await this.jobEventService.logFrameRenderingStarted(job.id, frameCount, {
      outputWidth: config.rendering.outputWidth,
      outputHeight: config.rendering.outputHeight,
      orbitAngleStep: config.orbit.angleStep,
      cameraDistance,
      cameraHeight: config.environmentMaps.cameraHeight,
    })

    const frames = []
    const renderStartTime = Date.now()

    for (let index = 0; index < frameCount; index++) {
      const angle = config.orbit.startAngle + index * config.orbit.angleStep
      const frame = await renderer.renderFrame(
        angle,
        cameraDistance,
        index,
        config.environmentMaps.cameraHeight
      )
      frames.push(frame)
    }

    const renderTime = Date.now() - renderStartTime
    await this.jobEventService.logFrameRenderingCompleted(
      job.id,
      frames.length,
      renderTime
    )

    jobLogger.info('Environment map orbit rendered', {
      frameCount: frames.length,
      cameraDistance,
      renderTimeMs: renderTime,
    })

    return frames
  }

  async _encodeFrames(jobId, jobLogger, frames) {
    await this.jobEventService.logEncodingStarted(jobId, frames.length)
    if (!this.frameEncoder) {
      this.frameEncoder = new FrameEncoderService()
    }

    const encodingResult = await this.frameEncoder.encodeFrames(
      frames,
      jobLogger
    )

    await this.jobEventService.logEncodingCompleted(
      jobId,
      encodingResult.webpPath,
      encodingResult.posterPath,
      encodingResult.encodeTimeMs
    )

    return encodingResult
  }

  async _storeThumbnail(
    jobId,
    environmentMapId,
    variantId,
    jobLogger,
    encodingResult
  ) {
    await this.jobEventService.logThumbnailUploadStarted(
      jobId,
      environmentMapId
    )

    const result = await this.environmentMapStorageService.storeThumbnail(
      environmentMapId,
      variantId,
      encodingResult
    )

    jobLogger.info('Environment map thumbnail stored', {
      environmentMapId,
      variantId,
      thumbnailPath: result.thumbnailPath,
      sizeBytes: result.sizeBytes,
    })

    await this.jobEventService.logThumbnailUploadCompleted(jobId, [
      {
        type: 'webp',
        success: true,
        path: result.thumbnailPath,
        size: result.sizeBytes,
      },
    ])

    return result
  }

  async markCompleted(job, result) {
    await this.jobService.finishEnvironmentMapJob(job.id, true, result)
  }

  async markFailed(job, errorMessage) {
    await this.jobService.finishEnvironmentMapJob(
      job.id,
      false,
      {},
      errorMessage
    )
  }

  async cleanup() {
    if (this.rendererPool) {
      await this.rendererPool.dispose()
      this.rendererPool = null
    }
    if (this.frameEncoder) {
      await this.frameEncoder.cleanupOldFiles(0)
      this.frameEncoder = null
    }
  }
}
