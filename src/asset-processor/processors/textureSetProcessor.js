import { BaseProcessor } from './baseProcessor.js'
import { ModelDataService } from '../modelDataService.js'
import { PuppeteerRenderer } from '../puppeteerRenderer.js'
import { TextureSetApiService } from '../textureSetApiService.js'
import { FrameEncoderService } from '../frameEncoderService.js'
import { generateTextureProxies } from '../textureProxyGenerator.js'

/**
 * Processor for generating texture set preview thumbnails.
 * Renders textures applied to geometry, producing an animated WebP orbit swing.
 *
 * Pipeline: fetch texture set → download textures → create geometry → apply textures
 *           → render swing animation → encode animated WebP → upload via texture-set thumbnail endpoints
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

      // Step 3: Initialize renderer and load the preview geometry
      if (!this.puppeteerRenderer) {
        this.puppeteerRenderer = new PuppeteerRenderer()
        await this.puppeteerRenderer.initialize()
      }

      // Use the stored preview geometry type (defaults to plane)
      const geometryType = textureSet.previewGeometryType || 'plane'
      const polygonCount =
        await this.puppeteerRenderer.loadPrimitive(geometryType)
      jobLogger.info('Primitive loaded', { polygonCount, geometryType })

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

      // Step 5: Render swing animation frames
      // Camera swings from 45° top-left to -30° bottom-right, then back
      const cameraDistance =
        await this.puppeteerRenderer.calculateOptimalCameraDistance()

      const swingFrames = await this._renderSwingFrames(
        cameraDistance,
        geometryType,
        jobLogger
      )

      jobLogger.info('Swing animation rendered for texture set', {
        frameCount: swingFrames.length,
        cameraDistance,
      })

      // Step 6: Encode frames as animated WebP + PNG poster
      const encodingResult = await this._encodeAnimatedFrames(
        job,
        jobLogger,
        swingFrames
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

        // Step 8: Generate texture web proxies (non-blocking — failure here does not fail the job)
        try {
          await this._generateWebProxies(
            textureSet,
            texturePaths,
            jobLogger,
            job.proxySize
          )
        } catch (proxyError) {
          jobLogger.warn('Texture proxy generation failed (non-blocking)', {
            error: proxyError.message,
          })
        }

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
   * Render swing animation frames.
   * Camera swings from top-left (azimuth -45°, elevation 30°) to bottom-right
   * (azimuth 30°, elevation -20°) and back, creating a smooth looping animation.
   * Plane geometry gets a gentler swing since it faces the camera.
   * @private
   */
  async _renderSwingFrames(cameraDistance, geometryType, jobLogger) {
    const isPlane = geometryType === 'plane'

    // Swing parameters — gentler for planes
    const startAzimuth = isPlane ? -15 : -45
    const endAzimuth = isPlane ? 15 : 30
    const startElevation = isPlane ? 10 : 30
    const endElevation = isPlane ? -10 : -20
    const forwardFrameCount = 15

    // For plane geometry the auto-calculated camera distance is capped at the
    // baseDistance (5 units) which puts the flat plane too far away. Bring the
    // camera closer so the texture fills most of the frame.
    const effectiveCameraDistance = isPlane
      ? cameraDistance * 0.7
      : cameraDistance

    const frames = []

    // Forward swing: top-left → bottom-right
    for (let i = 0; i < forwardFrameCount; i++) {
      const t = i / (forwardFrameCount - 1) // 0..1
      const azimuth = startAzimuth + (endAzimuth - startAzimuth) * t
      const elevation = startElevation + (endElevation - startElevation) * t

      const frameData = await this.puppeteerRenderer.renderFrame(
        azimuth,
        effectiveCameraDistance,
        frames.length,
        elevation
      )
      frames.push(frameData)
    }

    // Reverse swing: bottom-right → top-left (skip first and last to avoid duplicate frames at turnaround)
    for (let i = forwardFrameCount - 2; i >= 1; i--) {
      const t = i / (forwardFrameCount - 1)
      const azimuth = startAzimuth + (endAzimuth - startAzimuth) * t
      const elevation = startElevation + (endElevation - startElevation) * t

      const frameData = await this.puppeteerRenderer.renderFrame(
        azimuth,
        effectiveCameraDistance,
        frames.length,
        elevation
      )
      frames.push(frameData)
    }

    jobLogger.info('Swing frames rendered', {
      totalFrames: frames.length,
      azimuthRange: `${startAzimuth}° → ${endAzimuth}°`,
      elevationRange: `${startElevation}° → ${endElevation}°`,
      effectiveCameraDistance,
    })

    return frames
  }

  /**
   * Encode rendered frames into animated WebP + static PNG.
   * Uses FrameEncoderService for animated WebP creation.
   * @private
   */
  async _encodeAnimatedFrames(job, jobLogger, frames) {
    if (!this.frameEncoder) {
      this.frameEncoder = new FrameEncoderService()
    }

    const encodingResult = await this.frameEncoder.encodeFrames(
      frames,
      jobLogger
    )

    jobLogger.info('Animated encoding completed', {
      webpPath: encodingResult.webpPath,
      pngPath: encodingResult.pngPath,
      encodeTimeMs: encodingResult.encodeTimeMs,
    })

    return encodingResult
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
   * Generate and upload web proxy textures for all textures in the set.
   * Fetches the configured proxy size from settings (or uses job-level override),
   * then uses the proxy generator.
   * @private
   */
  async _generateWebProxies(textureSet, texturePaths, jobLogger, overrideSize) {
    jobLogger.info('Starting texture web proxy generation', {
      textureSetId: textureSet.id,
    })

    let proxySize = overrideSize || 512 // use override or default

    if (!overrideSize) {
      // Fetch the configured proxy size from settings API
      try {
        const settingsResponse =
          await this.textureSetApiService.client.get('/settings')
        if (settingsResponse.data?.textureProxySize) {
          proxySize = settingsResponse.data.textureProxySize
        }
        jobLogger.info('Proxy size from settings', { proxySize })
      } catch (settingsError) {
        jobLogger.warn(
          'Could not fetch settings, using default proxy size 512',
          {
            error: settingsError.message,
          }
        )
      }
    } else {
      jobLogger.info('Using job-level proxy size override', { proxySize })
    }

    const stats = await generateTextureProxies(
      textureSet,
      texturePaths,
      proxySize,
      this.textureSetApiService.client,
      jobLogger
    )

    jobLogger.info('Texture web proxy generation completed', {
      textureSetId: textureSet.id,
      ...stats,
    })

    return stats
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
    if (this.frameEncoder) {
      await this.frameEncoder.cleanupOldFiles(0)
      this.frameEncoder = null
    }
  }
}
