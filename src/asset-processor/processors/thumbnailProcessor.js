import { BaseProcessor } from './baseProcessor.js'
import { ModelFileService } from '../modelFileService.js'
import { ModelDataService } from '../modelDataService.js'
import { PuppeteerRenderer } from '../puppeteerRenderer.js'
import { FrameEncoderService } from '../frameEncoderService.js'
import { ThumbnailStorageService } from '../thumbnailStorageService.js'
import { ThumbnailApiService } from '../thumbnailApiService.js'
import { config } from '../config.js'

/**
 * Processor for generating 3D model thumbnails.
 * Handles: file download → 3D rendering → frame encoding → storage → image classification.
 */
export class ThumbnailProcessor extends BaseProcessor {
  constructor() {
    super()
    this.modelFileService = new ModelFileService()
    this.modelDataService = new ModelDataService()
    this.thumbnailStorage = new ThumbnailStorageService()
    this.thumbnailApiService = new ThumbnailApiService()
    this.puppeteerRenderer = null
    this.frameEncoder = null
  }

  get processorType() {
    return 'thumbnail'
  }

  /**
   * Process a model thumbnail job.
   * @param {Object} job - The job to process.
   * @param {Object} jobLogger - Logger with job context.
   * @returns {Promise<Object>} Thumbnail metadata { thumbnailPath, sizeBytes, width, height }.
   */
  async process(job, jobLogger) {
    let tempFilePath = null
    let texturePaths = null

    try {
      jobLogger.info('Starting model processing', {
        modelId: job.modelId,
        modelHash: job.modelHash,
      })

      // Step 1: Check for existing thumbnails (hash deduplication)
      const existingThumbnails =
        await this.thumbnailStorage.checkThumbnailsExist(job.modelHash)

      if (existingThumbnails.skipRendering) {
        jobLogger.info('Thumbnails already exist, skipping rendering', {
          modelHash: job.modelHash,
        })
        return {
          thumbnailPath: existingThumbnails.paths?.webpPath || '/default/path',
          sizeBytes: 0,
          width: 256,
          height: 256,
        }
      }

      // Step 2: Fetch model file
      jobLogger.info('Fetching model file from API')
      await this.jobEventService.logModelDownloadStarted(job.id, job.modelId)

      const fileInfo = await this.modelFileService.fetchModelFile(
        job.modelId,
        job.modelVersionId
      )
      tempFilePath = fileInfo.filePath

      jobLogger.info('Model file fetched', {
        originalFileName: fileInfo.originalFileName,
        fileType: fileInfo.fileType,
      })

      await this.jobEventService.logModelDownloaded(
        job.id,
        job.modelId,
        fileInfo.fileType,
        fileInfo.filePath
      )

      // Step 3: Initialize renderer and load model
      await this.jobEventService.logModelLoadingStarted(
        job.id,
        fileInfo.fileType
      )

      if (!this.puppeteerRenderer) {
        this.puppeteerRenderer = new PuppeteerRenderer()
        await this.puppeteerRenderer.initialize()
      }

      const polygonCount = await this.puppeteerRenderer.loadModel(
        fileInfo.filePath,
        fileInfo.fileType
      )

      jobLogger.info('Model loaded in browser', { polygonCount })
      await this.jobEventService.logModelLoaded(
        job.id,
        polygonCount,
        fileInfo.fileType
      )

      // Step 3.5: Apply textures if configured
      texturePaths = await this._applyTextures(job, jobLogger)

      // Step 4: Render orbit frames
      if (!config.orbit.enabled) {
        throw new Error(
          'Orbit rendering is disabled — cannot generate thumbnails'
        )
      }

      const frames = await this._renderOrbitFrames(job, jobLogger, polygonCount)

      // Step 5: Encode frames
      if (!config.encoding.enabled) {
        throw new Error(
          'Frame encoding is disabled — cannot generate thumbnails'
        )
      }

      const encodingResult = await this._encodeFrames(job, jobLogger, frames)

      // Step 6: Upload thumbnails
      if (!this.thumbnailStorage.enabled) {
        throw new Error('Thumbnail storage is disabled — cannot complete job')
      }

      const storageResult = await this._storeThumbnails(
        job,
        jobLogger,
        encodingResult
      )

      // Extract metadata from upload result
      if (storageResult.stored && storageResult.uploadResults?.length > 0) {
        const successfulUpload = storageResult.uploadResults.find(
          upload => upload.success && upload.data
        )
        if (successfulUpload?.data) {
          return {
            thumbnailPath: successfulUpload.data.thumbnailPath,
            sizeBytes: successfulUpload.data.sizeBytes,
            width: successfulUpload.data.width,
            height: successfulUpload.data.height,
          }
        }
      }

      throw new Error(
        'Thumbnail upload failed — no valid thumbnail data available'
      )
    } finally {
      if (tempFilePath) {
        await this.modelFileService.cleanupFile(tempFilePath)
      }
      if (texturePaths) {
        await this.modelDataService.cleanupTextureFiles(texturePaths)
      }
    }
  }

  /**
   * Apply textures if a default texture set is configured.
   * @private
   */
  async _applyTextures(job, jobLogger) {
    if (!job.defaultTextureSetId) {
      jobLogger.debug('No default texture set configured')
      return null
    }

    try {
      jobLogger.info('Fetching texture set', {
        defaultTextureSetId: job.defaultTextureSetId,
      })

      await this.jobEventService.logEvent(
        job.id,
        'TextureFetchStarted',
        `Fetching texture set ${job.defaultTextureSetId}`
      )

      const textureSet = await this.modelDataService.getTextureSet(
        job.defaultTextureSetId
      )

      if (!textureSet?.textures?.length) {
        jobLogger.info('No textures in texture set')
        return null
      }

      const texturePaths =
        await this.modelDataService.downloadTextureSetFiles(textureSet)

      if (Object.keys(texturePaths).length > 0) {
        const applied = await this.puppeteerRenderer.applyTextures(texturePaths)
        if (applied) {
          await this.jobEventService.logEvent(
            job.id,
            'TexturesApplied',
            `Applied ${Object.keys(texturePaths).length} textures`
          )
        }
        return texturePaths
      }
    } catch (error) {
      jobLogger.warn('Failed to apply textures, continuing without them', {
        error: error.message,
      })
    }

    return null
  }

  /**
   * Render orbit animation frames.
   * @private
   */
  async _renderOrbitFrames(job, jobLogger, polygonCount) {
    const angleRange = config.orbit.endAngle - config.orbit.startAngle
    const frameCount = Math.ceil(angleRange / config.orbit.angleStep)

    await this.jobEventService.logFrameRenderingStarted(job.id, frameCount, {
      outputWidth: config.rendering.outputWidth,
      outputHeight: config.rendering.outputHeight,
      orbitAngleStep: config.orbit.angleStep,
    })

    const renderStartTime = Date.now()
    const frames = await this.puppeteerRenderer.renderOrbitFrames(jobLogger)
    const renderTime = Date.now() - renderStartTime

    const memoryStats = this.puppeteerRenderer.getMemoryStats(frames)
    jobLogger.info('Orbit frames rendered', {
      polygonCount,
      ...memoryStats,
      renderTimeMs: renderTime,
    })

    await this.jobEventService.logFrameRenderingCompleted(
      job.id,
      frames.length,
      renderTime
    )

    return frames
  }

  /**
   * Encode rendered frames into WebP animation and poster.
   * @private
   */
  async _encodeFrames(job, jobLogger, frames) {
    await this.jobEventService.logEncodingStarted(job.id, frames.length)

    if (!this.frameEncoder) {
      this.frameEncoder = new FrameEncoderService()
    }

    const encodingResult = await this.frameEncoder.encodeFrames(
      frames,
      jobLogger
    )

    jobLogger.info('Encoding completed', {
      webpPath: encodingResult.webpPath,
      posterPath: encodingResult.posterPath,
      encodeTimeMs: encodingResult.encodeTimeMs,
    })

    await this.jobEventService.logEncodingCompleted(
      job.id,
      encodingResult.webpPath,
      encodingResult.posterPath,
      encodingResult.encodeTimeMs
    )

    return encodingResult
  }

  /**
   * Store encoded thumbnails via API upload.
   * @private
   */
  async _storeThumbnails(job, jobLogger, encodingResult) {
    await this.jobEventService.logThumbnailUploadStarted(job.id, job.modelHash)

    const storageResult = await this.thumbnailStorage.storeThumbnails(
      job.modelHash,
      encodingResult.webpPath,
      encodingResult.posterPath,
      encodingResult.pngPath,
      job.modelId,
      job.modelVersionId
    )

    jobLogger.info('Thumbnails uploaded', {
      stored: storageResult.stored,
      allSuccessful: storageResult.apiResponse?.allSuccessful,
    })

    await this.jobEventService.logThumbnailUploadCompleted(
      job.id,
      storageResult.uploadResults
    )

    return storageResult
  }

  async cleanup() {
    if (this.puppeteerRenderer) {
      await this.puppeteerRenderer.dispose()
      this.puppeteerRenderer = null
    }
    if (this.frameEncoder) {
      await this.frameEncoder.cleanupOldFiles(0)
      this.frameEncoder = null
    }
  }
}
