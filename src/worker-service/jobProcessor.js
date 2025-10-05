import { ThumbnailJobService } from './thumbnailJobService.js'
import { SignalRQueueService } from './signalrQueueService.js'
import { ModelFileService } from './modelFileService.js'
import { ModelLoaderService } from './modelLoaderService.js'
import { OrbitFrameRenderer } from './orbitFrameRenderer.js'
import { FrameEncoderService } from './frameEncoderService.js'
import { ThumbnailStorageService } from './thumbnailStorageService.js'
import { JobEventService } from './jobEventService.js'
import { config } from './config.js'
import logger, { withJobContext } from './logger.js'

/**
 * Job processor that handles thumbnail generation using SignalR real-time queue
 */
export class JobProcessor {
  constructor() {
    this.jobService = new ThumbnailJobService()
    this.signalrQueueService = new SignalRQueueService()
    this.modelFileService = new ModelFileService()
    this.modelLoaderService = new ModelLoaderService()
    this.thumbnailStorage = new ThumbnailStorageService()
    this.jobEventService = new JobEventService()
    this.orbitRenderer = null // Will be initialized when needed
    this.frameEncoder = null // Will be initialized when needed
    this.isShuttingDown = false
    this.activeJobs = new Map()
  }

  /**
   * Start the job processing system
   */
  async start() {
    logger.info('Starting SignalR-based job processor', {
      workerId: config.workerId,
      maxConcurrentJobs: config.maxConcurrentJobs,
      modelProcessing: config.modelProcessing,
    })

    // Test API connection before starting
    const isConnected = await this.jobService.testConnection()
    if (!isConnected) {
      logger.warn('API connection test failed, but continuing anyway')
    }

    // Start periodic cleanup of old temporary files
    this.startPeriodicCleanup()

    // Start SignalR-based job processing
    await this.startSignalRMode()
  }

  /**
   * Start SignalR-based job processing (real-time queue)
   */
  async startSignalRMode() {
    logger.info('Starting SignalR-based job processing')

    // Set up the job received callback
    this.signalrQueueService.onJobReceived(async job => {
      await this.handleJobNotification(job)
    })

    // Connect to SignalR hub
    const connected = await this.signalrQueueService.start()
    if (!connected) {
      logger.error('Failed to connect to SignalR hub')
      throw new Error('SignalR connection failed')
    }

    logger.info('SignalR job processor started successfully')
  }

  /**
   * Handle a job notification from SignalR
   * @param {Object} job - The job notification
   */
  async handleJobNotification(job) {
    try {
      // Check if we can accept more jobs
      if (this.activeJobs.size >= config.maxConcurrentJobs) {
        logger.debug('Max concurrent jobs reached, ignoring job notification', {
          jobId: job.id,
          activeJobs: this.activeJobs.size,
          maxConcurrentJobs: config.maxConcurrentJobs,
        })
        return
      }

      // Try to claim the job through the API
      const claimedJob = await this.jobService.pollForJob()

      if (claimedJob && claimedJob.id === job.id) {
        logger.info('Successfully claimed job from SignalR notification', {
          jobId: claimedJob.id,
          modelId: claimedJob.modelId,
          modelHash: claimedJob.modelHash,
          attemptCount: claimedJob.attemptCount,
        })

        // Acknowledge job processing to other workers
        await this.signalrQueueService.acknowledgeJob(
          claimedJob.id,
          config.workerId
        )

        // Process job asynchronously
        this.processJobAsync(claimedJob)
      } else if (claimedJob) {
        logger.debug('Claimed a different job than notified', {
          notifiedJobId: job.id,
          claimedJobId: claimedJob.id,
        })

        // Still process the claimed job
        this.processJobAsync(claimedJob)
      } else {
        logger.debug('Job was already claimed by another worker', {
          jobId: job.id,
        })
      }
    } catch (error) {
      logger.error('Error handling job notification', {
        jobId: job.id,
        error: error.message,
        stack: error.stack,
      })
    }
  }

  /**
   * Process a job asynchronously
   * @param {Object} job - The job to process
   */
  async processJobAsync(job) {
    const jobLogger = withJobContext(job.id, job.modelId)
    this.activeJobs.set(job.id, job)

    try {
      jobLogger.info('Starting thumbnail generation')

      // Log job started event
      await this.jobEventService.logJobStarted(
        job.id,
        job.modelId,
        job.modelHash
      )

      // Process the model and get thumbnail metadata
      const thumbnailMetadata = await this.processModel(job, jobLogger)

      await this.jobService.markJobCompleted(job.id, thumbnailMetadata)

      // Log job completed event
      await this.jobEventService.logJobCompleted(job.id, thumbnailMetadata)

      jobLogger.info('Thumbnail generation completed successfully')
    } catch (error) {
      jobLogger.error('Thumbnail generation failed', {
        error: error.message,
        stack: error.stack,
      })

      // Log job failed event
      await this.jobEventService.logJobFailed(
        job.id,
        error.message,
        error.stack
      )

      try {
        await this.jobService.markJobFailed(job.id, error.message)
      } catch (markFailedError) {
        jobLogger.error('Failed to mark job as failed', {
          markFailedError: markFailedError.message,
        })
      }
    } finally {
      this.activeJobs.delete(job.id)
    }
  }

  /**
   * Process a model for thumbnail generation
   * @param {Object} job - The job being processed
   * @param {Object} jobLogger - Logger with job context
   */
  async processModel(job, jobLogger) {
    let tempFilePath = null

    try {
      jobLogger.info('Starting model processing', {
        modelId: job.modelId,
        modelHash: job.modelHash,
      })

      // Step 1: Check if thumbnails already exist for this model hash
      jobLogger.info('Checking for existing thumbnails', {
        modelHash: job.modelHash,
      })
      const existingThumbnails =
        await this.thumbnailStorage.checkThumbnailsExist(job.modelHash)

      if (existingThumbnails.skipRendering) {
        jobLogger.info('Thumbnails already exist, skipping rendering', {
          modelHash: job.modelHash,
          webpExists: existingThumbnails.webpExists,
          posterExists: existingThumbnails.posterExists,
          webpPath: existingThumbnails.paths?.webpPath,
          posterPath: existingThumbnails.paths?.posterPath,
        })

        // Update thumbnail metadata if needed (thumbnails exist but job was still created)
        // This can happen in edge cases where job was queued before thumbnails were stored
        // For existing thumbnails, we need to provide default metadata since we can't complete without it
        jobLogger.warn(
          'Thumbnails already exist, providing default metadata for job completion'
        )
        return {
          thumbnailPath: existingThumbnails.paths?.webpPath || '/default/path',
          sizeBytes: 0,
          width: 256,
          height: 256,
        }
      }

      // Step 2: Fetch the model file
      jobLogger.info('Fetching model file from API')
      await this.jobEventService.logModelDownloadStarted(job.id, job.modelId)

      const fileInfo = await this.modelFileService.fetchModelFile(job.modelId)
      tempFilePath = fileInfo.filePath

      jobLogger.info('Model file fetched successfully', {
        originalFileName: fileInfo.originalFileName,
        fileType: fileInfo.fileType,
        filePath: fileInfo.filePath,
      })

      await this.jobEventService.logModelDownloaded(
        job.id,
        job.modelId,
        fileInfo.fileType,
        fileInfo.filePath
      )

      // Step 3: Load and normalize the model
      jobLogger.info('Loading and normalizing model')
      await this.jobEventService.logModelLoadingStarted(
        job.id,
        fileInfo.fileType
      )

      const model = await this.modelLoaderService.loadModel(
        fileInfo.filePath,
        fileInfo.fileType
      )

      const polygonCount = this.modelLoaderService.countPolygons(model)
      jobLogger.info('Model loaded and normalized successfully', {
        polygonCount,
        fileType: fileInfo.fileType,
      })

      await this.jobEventService.logModelLoaded(
        job.id,
        polygonCount,
        fileInfo.fileType
      )

      // Step 4: Generate orbit frames using three.js renderer
      if (config.orbit.enabled) {
        jobLogger.info('Starting orbit frame rendering')

        // Initialize orbit renderer if not already done
        if (!this.orbitRenderer) {
          this.orbitRenderer = new OrbitFrameRenderer()
        }

        // Calculate frame count for logging
        const angleRange = config.orbit.endAngle - config.orbit.startAngle
        const frameCount = Math.ceil(angleRange / config.orbit.angleStep)

        await this.jobEventService.logFrameRenderingStarted(
          job.id,
          frameCount,
          {
            outputWidth: config.rendering.outputWidth,
            outputHeight: config.rendering.outputHeight,
            orbitAngleStep: config.orbit.angleStep,
            orbitStartAngle: config.orbit.startAngle,
            orbitEndAngle: config.orbit.endAngle,
          }
        )

        // Render orbit frames
        const frames = await this.orbitRenderer.renderOrbitFrames(
          model,
          jobLogger
        )

        // Log memory statistics
        const memoryStats = this.orbitRenderer.getMemoryStats(frames)
        jobLogger.info('Orbit frame rendering completed successfully', {
          polygonCount,
          ...memoryStats,
          processingConfig: {
            outputWidth: config.rendering.outputWidth,
            outputHeight: config.rendering.outputHeight,
            outputFormat: config.rendering.outputFormat,
            orbitAngleStep: config.orbit.angleStep,
            orbitStartAngle: config.orbit.startAngle,
            orbitEndAngle: config.orbit.endAngle,
            cameraDistance: config.rendering.cameraDistance,
            maxPolygonCount: config.modelProcessing.maxPolygonCount,
            normalizedScale: config.modelProcessing.normalizedScale,
          },
        })

        const renderTime = Date.now() - Date.now() // Approximate
        await this.jobEventService.logFrameRenderingCompleted(
          job.id,
          frames.length,
          renderTime
        )

        // Note: Frames are stored in memory for processing
        jobLogger.info('Frames stored in memory for processing', {
          frameCount: frames.length,
          memoryUsageMB: memoryStats.totalSizeMB,
        })

        // Step 5: Encode frames into animated WebP and poster if enabled
        if (config.encoding.enabled) {
          jobLogger.info('Starting frame encoding')
          await this.jobEventService.logEncodingStarted(job.id, frames.length)

          // Initialize frame encoder if not already done
          if (!this.frameEncoder) {
            this.frameEncoder = new FrameEncoderService()
          }

          // Encode frames to WebP and poster
          const encodingResult = await this.frameEncoder.encodeFrames(
            frames,
            jobLogger
          )

          jobLogger.info('Frame encoding completed successfully', {
            webpPath: encodingResult.webpPath,
            posterPath: encodingResult.posterPath,
            encodeTimeMs: encodingResult.encodeTimeMs,
            frameCount: encodingResult.frameCount,
          })

          await this.jobEventService.logEncodingCompleted(
            job.id,
            encodingResult.webpPath,
            encodingResult.posterPath,
            encodingResult.encodeTimeMs
          )

          // Step 6: Store thumbnails via API upload
          if (this.thumbnailStorage.enabled) {
            jobLogger.info('Uploading thumbnails to API')
            await this.jobEventService.logThumbnailUploadStarted(
              job.id,
              job.modelHash
            )

            const storageResult = await this.thumbnailStorage.storeThumbnails(
              job.modelHash,
              encodingResult.webpPath,
              encodingResult.posterPath,
              job.modelId // Pass model ID for API upload
            )

            jobLogger.info('Thumbnail API upload completed', {
              stored: storageResult.stored,
              webpStored: storageResult.webpStored,
              posterStored: storageResult.posterStored,
              uploadResults: storageResult.uploadResults?.length || 0,
              allSuccessful: storageResult.apiResponse?.allSuccessful,
            })

            await this.jobEventService.logThumbnailUploadCompleted(
              job.id,
              storageResult.uploadResults
            )

            // Extract thumbnail metadata from successful upload for job completion
            if (
              storageResult.stored &&
              storageResult.uploadResults?.length > 0
            ) {
              const successfulUpload = storageResult.uploadResults.find(
                upload => upload.success && upload.data
              )
              if (successfulUpload && successfulUpload.data) {
                const thumbnailData = successfulUpload.data
                jobLogger.info(
                  'Extracted thumbnail metadata for job completion',
                  {
                    thumbnailPath: thumbnailData.thumbnailPath,
                    sizeBytes: thumbnailData.sizeBytes,
                    width: thumbnailData.width,
                    height: thumbnailData.height,
                  }
                )

                return {
                  thumbnailPath: thumbnailData.thumbnailPath,
                  sizeBytes: thumbnailData.sizeBytes,
                  width: thumbnailData.width,
                  height: thumbnailData.height,
                }
              }
            }

            // If upload failed, throw error instead of returning default metadata
            const errorMsg =
              'Thumbnail upload failed - no valid thumbnail data available'
            jobLogger.error(errorMsg)
            await this.jobEventService.logError(
              job.id,
              'ThumbnailUploadFailed',
              errorMsg,
              new Error(errorMsg)
            )
            throw new Error(errorMsg)
          } else {
            const errorMsg =
              'Persistent thumbnail storage is disabled - cannot complete job'
            jobLogger.error(errorMsg)
            await this.jobEventService.logError(
              job.id,
              'StorageDisabled',
              errorMsg,
              new Error(errorMsg)
            )
            throw new Error(errorMsg)
          }

          // Clean up temporary files if configured
          if (config.encoding.cleanupTempFiles) {
            await this.frameEncoder.cleanupEncodingResult(encodingResult)
            jobLogger.info('Temporary encoding files cleaned up')
          } else {
            jobLogger.info('Temporary encoding files preserved', {
              workingDir: encodingResult.workingDir,
            })
          }
        } else {
          const errorMsg =
            'Frame encoding is disabled - cannot generate thumbnails'
          jobLogger.error(errorMsg)
          await this.jobEventService.logError(
            job.id,
            'EncodingDisabled',
            errorMsg,
            new Error(errorMsg)
          )
          throw new Error(errorMsg)
        }
      } else {
        const errorMsg =
          'Orbit rendering is disabled - cannot generate thumbnails'
        jobLogger.error(errorMsg)
        await this.jobEventService.logError(
          job.id,
          'RenderingDisabled',
          errorMsg,
          new Error(errorMsg)
        )
        throw new Error(errorMsg)
      }
    } catch (error) {
      jobLogger.error('Model processing failed', {
        error: error.message,
        modelId: job.modelId,
      })
      throw error
    } finally {
      // Clean up temporary file
      if (tempFilePath) {
        await this.modelFileService.cleanupFile(tempFilePath)
      }
    }
  }

  /**
   * Simulate processing for the skeleton implementation
   * @param {Object} job - The job being processed
   * @param {Object} jobLogger - Logger with job context
   */
  async simulateProcessing(job, jobLogger) {
    jobLogger.info('Simulating thumbnail generation', {
      renderWidth: config.rendering.outputWidth,
      renderHeight: config.rendering.outputHeight,
      outputFormat: config.rendering.outputFormat,
    })

    // Simulate variable processing time (1-5 seconds)
    const processingTime = Math.random() * 4000 + 1000
    await this.sleep(processingTime)

    // Randomly simulate failures for testing error handling
    if (Math.random() < 0.1) {
      // 10% failure rate
      throw new Error('Simulated processing failure for testing')
    }

    jobLogger.info('Thumbnail generation simulation completed', {
      processingTimeMs: Math.round(processingTime),
    })
  }

  /**
   * Start periodic cleanup of temporary files
   */
  startPeriodicCleanup() {
    // Clean up old files every 30 minutes
    this.cleanupInterval = setInterval(
      async () => {
        if (!this.isShuttingDown) {
          try {
            await this.modelFileService.cleanupOldFiles()

            // Also cleanup old frame encoder files if encoder is initialized
            if (this.frameEncoder) {
              await this.frameEncoder.cleanupOldFiles()
            }
          } catch (error) {
            logger.warn('Periodic cleanup failed', { error: error.message })
          }
        }
      },
      30 * 60 * 1000
    ) // 30 minutes

    logger.debug('Started periodic cleanup of temporary files')
  }

  /**
   * Gracefully shutdown the processor
   */
  async shutdown() {
    logger.info('Shutting down job processor')
    this.isShuttingDown = true

    // Stop SignalR connection
    await this.signalrQueueService.stop()

    // Stop periodic cleanup
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
      this.cleanupInterval = null
    }

    // Dispose of orbit renderer resources
    if (this.orbitRenderer) {
      this.orbitRenderer.dispose()
      this.orbitRenderer = null
    }

    // Clean up frame encoder resources
    if (this.frameEncoder) {
      await this.frameEncoder.cleanupOldFiles(0) // Clean all files immediately
      this.frameEncoder = null
    }

    // Wait for active jobs to complete (with timeout)
    const shutdownTimeout = 30000 // 30 seconds
    const startTime = Date.now()

    while (
      this.activeJobs.size > 0 &&
      Date.now() - startTime < shutdownTimeout
    ) {
      logger.info('Waiting for active jobs to complete', {
        activeJobs: this.activeJobs.size,
        remainingTimeoutMs: shutdownTimeout - (Date.now() - startTime),
      })
      await this.sleep(1000)
    }

    if (this.activeJobs.size > 0) {
      logger.warn(
        'Shutdown timeout reached, some jobs may not have completed',
        {
          activeJobs: Array.from(this.activeJobs.keys()),
        }
      )
    }

    logger.info('Job processor shutdown complete')
  }

  /**
   * Get current processor status
   */
  getStatus() {
    return {
      isShuttingDown: this.isShuttingDown,
      activeJobs: this.activeJobs.size,
      maxConcurrentJobs: config.maxConcurrentJobs,
      workerId: config.workerId,
      signalrConnected: this.signalrQueueService.connected,
    }
  }

  /**
   * Sleep utility
   * @param {number} ms - Milliseconds to sleep
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}
