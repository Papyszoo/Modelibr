import { BaseProcessor } from './baseProcessor.js'
import { ModelDataService } from '../modelDataService.js'
import { PuppeteerRenderer } from '../puppeteerRenderer.js'
import { TextureSetApiService } from '../textureSetApiService.js'
import { config } from '../config.js'
import sharp from 'sharp'
import path from 'path'
import fs from 'fs'
import os from 'os'

/**
 * Processor for generating texture set preview thumbnails.
 * Renders textures applied to a sphere, producing a single static WebP + PNG image.
 *
 * Pipeline: fetch texture set → download textures → create sphere → apply textures
 *           → render single frame → encode static images → upload via texture-set thumbnail endpoints
 */
export class TextureSetProcessor extends BaseProcessor {
  constructor() {
    super()
    this.modelDataService = new ModelDataService()
    this.textureSetApiService = new TextureSetApiService()
    this.puppeteerRenderer = null
  }

  get processorType() {
    return 'texture-set'
  }

  /**
   * Process a texture set thumbnail job.
   * @param {Object} job - The dequeued job object (must have textureSetId).
   * @param {Object} jobLogger - Logger with job context.
   * @returns {Promise<Object>} Thumbnail metadata.
   */
  async process(job, jobLogger) {
    let texturePaths = null

    try {
      const textureSetId = job.textureSetId
      if (!textureSetId) {
        throw new Error('Job is missing textureSetId')
      }

      jobLogger.info('Starting texture set thumbnail generation', {
        textureSetId,
      })

      // Step 1: Fetch texture set metadata from API
      jobLogger.info('Fetching texture set data')
      const textureSet = await this.modelDataService.getTextureSet(textureSetId)

      if (!textureSet) {
        throw new Error(`Texture set ${textureSetId} not found`)
      }

      if (!textureSet.textures || textureSet.textures.length === 0) {
        throw new Error(`Texture set ${textureSetId} has no textures`)
      }

      jobLogger.info('Texture set fetched', {
        textureSetId,
        name: textureSet.name,
        textureCount: textureSet.textures.length,
      })

      // Step 2: Download texture files
      jobLogger.info('Downloading texture files')
      texturePaths =
        await this.modelDataService.downloadTextureSetFiles(textureSet)

      if (!texturePaths || Object.keys(texturePaths).length === 0) {
        throw new Error('No texture files could be downloaded')
      }

      jobLogger.info('Textures downloaded', {
        downloadedCount: Object.keys(texturePaths).length,
        types: Object.keys(texturePaths),
      })

      // Step 3: Initialize renderer and create a sphere
      if (!this.puppeteerRenderer) {
        this.puppeteerRenderer = new PuppeteerRenderer()
        await this.puppeteerRenderer.initialize()
      }

      const polygonCount = await this.puppeteerRenderer.loadSphere(5)
      jobLogger.info('Sphere loaded', { polygonCount })

      // Step 4: Apply textures to the sphere
      // Use 'obj' fileType so flipY is true (sphere is not glTF)
      // Use uvScale directly as texture repeat multiplier
      const uvScale = textureSet.uvScale ?? 1
      const tilingScale = { x: uvScale, y: uvScale }

      jobLogger.info('UV scale applied', { uvScale, tilingScale })

      const applied = await this.puppeteerRenderer.applyTextures(
        texturePaths,
        'obj',
        tilingScale
      )

      if (!applied) {
        jobLogger.warn(
          'Texture application returned false, continuing with untextured sphere'
        )
      } else {
        jobLogger.info('Textures applied to sphere')
      }

      // Step 5: Render a single frame at a good angle
      const cameraDistance =
        await this.puppeteerRenderer.calculateOptimalCameraDistance()
      const cameraAngle = 30 // Slightly angled view for 3D appearance

      const frameData = await this.puppeteerRenderer.renderFrame(
        cameraAngle,
        cameraDistance,
        0
      )

      jobLogger.info('Single frame rendered for texture set', {
        angle: cameraAngle,
        cameraDistance,
      })

      // Step 6: Encode frame as static WebP + PNG
      const encodingResult = await this._encodeSingleFrame(
        job,
        jobLogger,
        frameData
      )

      // Step 7: Upload thumbnails via texture-set-specific endpoints
      const uploadResult = await this._uploadThumbnails(
        textureSetId,
        jobLogger,
        encodingResult
      )

      if (uploadResult.allSuccessful && uploadResult.uploads.length > 0) {
        const successfulUpload = uploadResult.uploads.find(
          u => u.success && u.data
        )
        if (successfulUpload?.data) {
          return {
            thumbnailPath: successfulUpload.data.thumbnailPath,
            sizeBytes: successfulUpload.data.sizeBytes,
            width: 256,
            height: 256,
          }
        }
      }

      throw new Error(
        'Thumbnail upload failed — no valid thumbnail data available'
      )
    } finally {
      if (texturePaths) {
        await this.modelDataService.cleanupTextureFiles(texturePaths)
      }
    }
  }

  /**
   * Encode a single rendered frame into static WebP + PNG files.
   * @private
   */
  async _encodeSingleFrame(job, jobLogger, frameData) {
    const jobId = Date.now().toString(36) + Math.random().toString(36).substr(2)
    const workingDir = path.join(os.tmpdir(), `textureset-${jobId}`)
    fs.mkdirSync(workingDir, { recursive: true })

    const startTime = Date.now()

    try {
      const inputBuffer = frameData.pixels
      const width = config.rendering.outputWidth
      const height = config.rendering.outputHeight

      // Create static WebP from frame
      const webpPath = path.join(workingDir, 'thumbnail.webp')
      await sharp(inputBuffer)
        .resize(width, height, { fit: 'cover' })
        .webp({ quality: 85 })
        .toFile(webpPath)

      // Create PNG from frame
      const pngPath = path.join(workingDir, 'thumbnail.png')
      await sharp(inputBuffer)
        .resize(width, height, { fit: 'cover' })
        .png()
        .toFile(pngPath)

      const encodeTime = Date.now() - startTime

      jobLogger.info('Single frame encoding completed', {
        webpPath,
        pngPath,
        encodeTimeMs: encodeTime,
      })

      return { webpPath, pngPath, encodeTimeMs: encodeTime }
    } catch (error) {
      jobLogger.error('Single frame encoding failed', {
        error: error.message,
      })
      // Cleanup working dir on failure
      try {
        fs.rmSync(workingDir, { recursive: true, force: true })
      } catch (_) {}
      throw error
    }
  }

  /**
   * Upload encoded thumbnails to texture-set-specific endpoints.
   * @private
   */
  async _uploadThumbnails(textureSetId, jobLogger, encodingResult) {
    jobLogger.info('Uploading texture set thumbnails', { textureSetId })

    const result = await this.textureSetApiService.uploadMultipleThumbnails(
      textureSetId,
      {
        webpPath: encodingResult.webpPath,
        pngPath: encodingResult.pngPath,
      }
    )

    jobLogger.info('Thumbnails uploaded', {
      textureSetId,
      allSuccessful: result.allSuccessful,
      uploads: result.uploads.length,
    })

    return result
  }

  /**
   * Override completion to use texture-set-specific API endpoint.
   */
  async markCompleted(job, result) {
    await this.jobService.finishTextureSetJob(job.id, true, result)
  }

  /**
   * Override failure to use texture-set-specific API endpoint.
   */
  async markFailed(job, errorMessage) {
    await this.jobService.finishTextureSetJob(job.id, false, {}, errorMessage)
  }

  async cleanup() {
    if (this.puppeteerRenderer) {
      await this.puppeteerRenderer.dispose()
      this.puppeteerRenderer = null
    }
  }
}
