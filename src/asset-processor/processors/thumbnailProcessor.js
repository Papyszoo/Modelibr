import { BaseProcessor } from './baseProcessor.js'
import { ModelFileService } from '../modelFileService.js'
import { ModelDataService } from '../modelDataService.js'
import { RendererPool } from '../rendererPool.js'
import { FrameEncoderService } from '../frameEncoderService.js'
import { ThumbnailStorageService } from '../thumbnailStorageService.js'
import { ThumbnailApiService } from '../thumbnailApiService.js'
import { config, getBlenderPath } from '../config.js'
import { execFileSync } from 'child_process'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

/**
 * Processor for generating 3D model thumbnails.
 * Handles: file download → 3D rendering → frame encoding → storage → image classification.
 *
 * Uses a RendererPool so concurrent jobs each get their own WebGL context
 * and never interfere with each other's scenes.
 */
export class ThumbnailProcessor extends BaseProcessor {
  constructor() {
    super()
    this.modelFileService = new ModelFileService()
    this.modelDataService = new ModelDataService()
    this.thumbnailStorage = new ThumbnailStorageService()
    this.thumbnailApiService = new ThumbnailApiService()
    this.rendererPool = null
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
    let glbConvertedPath = null
    let texturePaths = null
    let renderer = null

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

      // Step 2.5: Convert .blend to .glb via headless Blender if needed
      if (fileInfo.fileType === 'blend') {
        if (!config.blender.enabled) {
          throw new Error(
            'Cannot process .blend file: Blender is not installed. Install a Blender version via Settings.'
          )
        }
        jobLogger.info('Detected .blend file, converting to .glb via Blender')

        const blenderPath = getBlenderPath()
        const __dirname = path.dirname(fileURLToPath(import.meta.url))
        const scriptPath = path.resolve(__dirname, '..', 'export_glb.py')
        const candidateGlbPath = fileInfo.filePath.replace(/\.blend$/i, '.glb')

        try {
          execFileSync(
            blenderPath,
            ['-b', fileInfo.filePath, '-P', scriptPath, '--', candidateGlbPath],
            { timeout: 120000, stdio: ['pipe', 'pipe', 'pipe'] }
          )
        } catch (blenderError) {
          const stderr = blenderError.stderr?.toString() || ''
          const stdout = blenderError.stdout?.toString() || ''
          const output = stderr || stdout // Blender often writes errors to stdout
          jobLogger.error('Blender GLB export failed', {
            exitCode: blenderError.status,
            stderr: stderr.slice(-2000),
            stdout: stdout.slice(-2000),
          })
          throw new Error(
            `Blender GLB export failed (exit ${blenderError.status}): ${output.slice(-500)}`
          )
        }

        if (!fs.existsSync(candidateGlbPath)) {
          throw new Error('Blender GLB export failed — output file not found')
        }

        glbConvertedPath = candidateGlbPath
        jobLogger.info('.blend converted to .glb', { glbConvertedPath })

        // Upload the converted .glb back to the model version
        const baseName = path.basename(
          fileInfo.originalFileName,
          path.extname(fileInfo.originalFileName)
        )
        const glbFileName = `${baseName}.glb`
        await this.jobService.uploadRenderableFile(
          job.modelId,
          job.modelVersionId,
          glbConvertedPath,
          glbFileName
        )
        jobLogger.info('Uploaded converted .glb to model version')

        // Switch to the .glb for the rest of the pipeline
        fileInfo.filePath = glbConvertedPath
        fileInfo.fileType = 'glb'
      }

      // Step 3: Acquire an exclusive renderer from the pool and load model
      await this.jobEventService.logModelLoadingStarted(
        job.id,
        fileInfo.fileType
      )

      if (!this.rendererPool) {
        this.rendererPool = new RendererPool()
        await this.rendererPool.initialize()
      }

      renderer = await this.rendererPool.acquire()

      const polygonCount = await renderer.loadModel(
        fileInfo.filePath,
        fileInfo.fileType
      )

      jobLogger.info('Model loaded in browser', { polygonCount })
      await this.jobEventService.logModelLoaded(
        job.id,
        polygonCount,
        fileInfo.fileType
      )

      // Step 3.2: Extract and save technical metadata from the loaded model
      try {
        const technicalMetadata = await renderer.extractTechnicalMetadata()
        if (technicalMetadata) {
          await this.modelDataService.saveTechnicalMetadata(
            job.modelVersionId,
            technicalMetadata
          )
        } else {
          jobLogger.warn('Skipping technical metadata save — extraction returned no data')
        }
      } catch (matError) {
        jobLogger.warn(
          'Failed to extract/save technical metadata, continuing',
          {
            error: matError.message,
          }
        )
      }

      // Step 3.5: Apply textures if configured
      texturePaths = await this._applyTextures(
        job,
        jobLogger,
        fileInfo.fileType,
        renderer
      )

      // Step 4: Render orbit frames
      if (!config.orbit.enabled) {
        throw new Error(
          'Orbit rendering is disabled — cannot generate thumbnails'
        )
      }

      const frames = await this._renderOrbitFrames(
        job,
        jobLogger,
        polygonCount,
        renderer
      )

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
      if (renderer) {
        this.rendererPool.release(renderer)
      }
      if (tempFilePath) {
        await this.modelFileService.cleanupFile(tempFilePath)
      }
      if (glbConvertedPath) {
        await this.modelFileService.cleanupFile(glbConvertedPath)
      }
      if (texturePaths) {
        await this.modelDataService.cleanupTextureFiles(texturePaths)
      }
    }
  }

  /**
   * Apply textures using per-material texture mappings from the main variant.
   * Falls back to single defaultTextureSetId if no mappings exist.
   * @private
   */
  async _applyTextures(job, jobLogger, fileType = 'gltf', renderer = null) {
    const textureMappings = job.textureMappings || []
    const mainVariant = job.mainVariantName || ''

    // "__embedded__" means use the model's original materials — skip all texture application
    if (mainVariant === '__embedded__') {
      this.jobLogger.info(
        'Main variant is __embedded__, preserving original model materials'
      )
      return null
    }

    // Filter mappings to the main variant (exact match only)
    let variantMappings = textureMappings.filter(
      m => m.variantName === mainVariant
    )

    // Fallback 1: if main variant has no mappings, try the Default variant ("")
    if (variantMappings.length === 0 && mainVariant !== '') {
      variantMappings = textureMappings.filter(m => m.variantName === '')
      if (variantMappings.length > 0) {
        jobLogger.info(
          'Main variant has no mappings, falling back to Default variant',
          {
            mainVariant,
            mappingCount: variantMappings.length,
          }
        )
      }
    }

    // Fallback 2: if mainVariant is empty and no default-variant mappings exist,
    // use the first available named variant's mappings
    if (
      variantMappings.length === 0 &&
      mainVariant === '' &&
      textureMappings.length > 0
    ) {
      const firstVariant = textureMappings.find(
        m => m.variantName !== ''
      )?.variantName
      if (firstVariant) {
        variantMappings = textureMappings.filter(
          m => m.variantName === firstVariant
        )
        jobLogger.info(
          'MainVariantName not set, falling back to first named variant',
          {
            fallbackVariant: firstVariant,
            mappingCount: variantMappings.length,
          }
        )
      }
    }

    // If we have per-material mappings, apply textures per-material
    if (variantMappings.length > 0) {
      jobLogger.info('Applying per-material textures', {
        mainVariant,
        mappingCount: variantMappings.length,
      })

      const allTexturePaths = []

      // Group by textureSetId to avoid fetching the same set multiple times
      const textureSetIds = [
        ...new Set(variantMappings.map(m => m.textureSetId)),
      ]

      const textureSetCache = new Map()
      for (const tsId of textureSetIds) {
        try {
          const ts = await this.modelDataService.getTextureSet(tsId)
          if (ts?.textures?.length) {
            textureSetCache.set(tsId, ts)
          }
        } catch (err) {
          jobLogger.warn(`Failed to fetch texture set ${tsId}`, {
            error: err.message,
          })
        }
      }

      const downloadedFilesCache = new Map()
      for (const mapping of variantMappings) {
        const ts = textureSetCache.get(mapping.textureSetId)
        if (!ts) continue

        try {
          let texturePaths = downloadedFilesCache.get(mapping.textureSetId)
          if (!texturePaths) {
            texturePaths =
              await this.modelDataService.downloadTextureSetFiles(ts)
            downloadedFilesCache.set(mapping.textureSetId, texturePaths)
          }
          if (Object.keys(texturePaths).length > 0) {
            const applied = await renderer.applyTextures(
              texturePaths,
              fileType,
              undefined,
              mapping.materialName || null
            )
            if (applied) {
              jobLogger.info(
                `Applied textures for material "${mapping.materialName}"`,
                {
                  textureSetId: mapping.textureSetId,
                }
              )
            }
            allTexturePaths.push(texturePaths)
          }
        } catch (err) {
          jobLogger.warn(
            `Failed to apply textures for material "${mapping.materialName}"`,
            {
              error: err.message,
            }
          )
        }
      }

      // Return all texture paths for cleanup
      if (allTexturePaths.length > 0) {
        // Merge all texture paths into one object for cleanup
        const merged = {}
        for (const paths of allTexturePaths) {
          Object.assign(merged, paths)
        }
        return merged
      }
      return null
    }

    // Fallback: use single defaultTextureSetId (legacy behavior)
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
        const applied = await renderer.applyTextures(texturePaths, fileType)
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
  async _renderOrbitFrames(job, jobLogger, polygonCount, renderer = null) {
    const angleRange = config.orbit.endAngle - config.orbit.startAngle
    const frameCount = Math.ceil(angleRange / config.orbit.angleStep)

    await this.jobEventService.logFrameRenderingStarted(job.id, frameCount, {
      outputWidth: config.rendering.outputWidth,
      outputHeight: config.rendering.outputHeight,
      orbitAngleStep: config.orbit.angleStep,
    })

    const renderStartTime = Date.now()
    const frames = await renderer.renderOrbitFrames(jobLogger)
    const renderTime = Date.now() - renderStartTime

    const memoryStats = renderer.getMemoryStats(frames)
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
