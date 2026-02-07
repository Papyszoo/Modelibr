import { ThumbnailJobService } from './thumbnailJobService.js'
import { SignalRQueueService } from './signalrQueueService.js'
import { ModelFileService } from './modelFileService.js'
import { SoundFileService } from './soundFileService.js'
import { WaveformGeneratorService } from './waveformGeneratorService.js'
import { ModelDataService } from './modelDataService.js'
import { PuppeteerRenderer } from './puppeteerRenderer.js'
import { FrameEncoderService } from './frameEncoderService.js'
import { ThumbnailStorageService } from './thumbnailStorageService.js'
import { JobEventService } from './jobEventService.js'
import { ClassificationRenderer } from './classificationRenderer.js'
import { getTaggerInstance } from './imageTagger/huggingfaceTagger.js'
import { TagAggregator } from './imageTagger/tagAggregator.js'
import { ThumbnailApiService } from './thumbnailApiService.js'
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
    this.soundFileService = new SoundFileService()
    this.waveformGenerator = new WaveformGeneratorService()
    this.modelDataService = new ModelDataService()
    this.thumbnailStorage = new ThumbnailStorageService()
    this.jobEventService = new JobEventService()
    this.thumbnailApiService = new ThumbnailApiService()
    this.puppeteerRenderer = null // Will be initialized when needed
    this.frameEncoder = null // Will be initialized when needed
    this.classificationRenderer = null // Will be initialized when needed
    this.imageTagger = getTaggerInstance() // Singleton image tagger
    this.isShuttingDown = false
    this.activeJobs = new Map()
    this.jobQueue = [] // Local queue for sequential processing
    this.isProcessingQueue = false // Flag to prevent concurrent queue processing
    this.isPollingForJobs = false
    this.pollIntervalHandle = null
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

    // Poll for any existing pending jobs on startup
    logger.info('Checking for existing pending jobs on startup')
    await this.pollForExistingJobs()

    // Start periodic polling as a fallback in case SignalR notifications are missed
    this.startPeriodicPolling()
  }

  /**
   * Start periodic polling for pending jobs as a fallback mechanism.
   */
  startPeriodicPolling() {
    if (this.pollIntervalHandle) {
      return
    }

    const pollIntervalMs = 10000
    this.pollIntervalHandle = setInterval(async () => {
      if (this.isShuttingDown || this.isPollingForJobs) {
        return
      }

      // Only poll when queue is empty to avoid competing with active processing
      if (this.jobQueue.length > 0 || this.isProcessingQueue) {
        return
      }

      this.isPollingForJobs = true
      try {
        await this.pollForExistingJobs()
      } finally {
        this.isPollingForJobs = false
      }
    }, pollIntervalMs)
  }

  /**
   * Poll for existing pending jobs on startup
   * @private
   */
  async pollForExistingJobs() {
    try {
      let jobsProcessed = 0
      let job = null

      // Keep polling until no more jobs are available
      do {
        job = await this.jobService.pollForJob()
        if (job) {
          jobsProcessed++
          logger.info('Found existing pending job on startup', {
            jobId: job.id,
            assetType: job.assetType,
            modelId: job.modelId,
            soundId: job.soundId,
          })

          // Add job to queue for sequential processing
          this.jobQueue.push({
            job: job,
            processor:
              job.assetType === 'Sound'
                ? this.processSoundJobAsync.bind(this)
                : this.processModelJobAsync.bind(this),
          })
        }
      } while (job !== null && jobsProcessed < 100) // Safety limit

      if (jobsProcessed > 0) {
        logger.info('Startup job polling complete', {
          jobsFound: jobsProcessed,
        })
        // Start processing the queue
        this.processQueue()
      } else {
        logger.info('No pending jobs found on startup')
      }
    } catch (error) {
      logger.error('Error during startup job polling', {
        error: error.message,
        stack: error.stack,
      })
    }
  }

  /**
   * Handle a job notification from SignalR
   * @param {Object} job - The job notification
   */
  async handleJobNotification(job) {
    try {
      // Check if we can accept more jobs (queue size limit)
      if (this.jobQueue.length >= 50) {
        logger.debug('Job queue is full, ignoring job notification', {
          jobId: job.id,
          queueSize: this.jobQueue.length,
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

        // Add job to queue for sequential processing
        this.jobQueue.push({
          job: claimedJob,
          processor:
            claimedJob.assetType === 'Sound'
              ? this.processSoundJobAsync.bind(this)
              : this.processModelJobAsync.bind(this),
        })
        logger.debug('Job added to queue', {
          jobId: claimedJob.id,
          assetType: claimedJob.assetType,
          queuePosition: this.jobQueue.length,
        })

        // Start processing queue if not already processing
        this.processQueue()
      } else if (claimedJob) {
        logger.debug('Claimed a different job than notified', {
          notifiedJobId: job.id,
          claimedJobId: claimedJob.id,
        })

        // Still add the claimed job to queue
        this.jobQueue.push({
          job: claimedJob,
          processor:
            claimedJob.assetType === 'Sound'
              ? this.processSoundJobAsync.bind(this)
              : this.processModelJobAsync.bind(this),
        })
        this.processQueue()
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
   * Process jobs from the queue sequentially
   */
  async processQueue() {
    // Prevent concurrent queue processing
    if (this.isProcessingQueue) {
      return
    }

    this.isProcessingQueue = true

    try {
      while (this.jobQueue.length > 0 && !this.isShuttingDown) {
        const { job, processor } = this.jobQueue.shift()
        logger.info('Processing job from queue', {
          jobId: job.id,
          remainingInQueue: this.jobQueue.length,
        })

        const timeoutMs = config.jobTimeout || 300000
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(
            () =>
              reject(
                new Error(`Job processing timed out after ${timeoutMs}ms`)
              ),
            timeoutMs
          )
        )

        try {
          await Promise.race([processor(job), timeoutPromise])
        } catch (error) {
          if (error.message.includes('timed out')) {
            logger.error(`Job ${job.id} timed out after ${timeoutMs}ms`, {
              jobId: job.id,
              timeoutMs,
            })
            try {
              await this.jobService.markJobFailed(job.id, error.message)
            } catch (markFailedError) {
              logger.error('Failed to mark timed-out job as failed', {
                jobId: job.id,
                error: markFailedError.message,
              })
            }
            this.activeJobs.delete(job.id)
          }
        }
      }
    } finally {
      this.isProcessingQueue = false
    }
  }

  /**
   * Process a model thumbnail job asynchronously
   * @param {Object} job - The job to process
   */
  async processModelJobAsync(job) {
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

      // Process the model
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
   * Process a sound waveform job asynchronously
   * @param {Object} job - The job to process
   */
  async processSoundJobAsync(job) {
    const jobLogger = withJobContext(job.id, job.soundId)
    this.activeJobs.set(job.id, job)

    try {
      jobLogger.info('Starting waveform generation')

      // Log job started event
      await this.jobEventService.logJobStarted(
        job.id,
        job.soundId,
        job.soundHash
      )

      // Process the sound
      const thumbnailMetadata = await this.processSound(job, jobLogger)

      await this.jobService.finishSoundJob(job.id, true, thumbnailMetadata)

      // Log job completed event
      await this.jobEventService.logJobCompleted(job.id, thumbnailMetadata)

      jobLogger.info(
        'Waveform generation completed successfully',
        thumbnailMetadata
      )
    } catch (error) {
      jobLogger.error('Waveform generation failed', {
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
        await this.jobService.finishSoundJob(job.id, false, {}, error.message)
      } catch (markFailedError) {
        jobLogger.error('Failed to mark sound job as failed', {
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
    let texturePaths = null

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

      const fileInfo = await this.modelFileService.fetchModelFile(
        job.modelId,
        job.modelVersionId
      )
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

      // Step 3: Initialize Puppeteer renderer and load model
      jobLogger.info('Initializing Puppeteer renderer and loading model')
      await this.jobEventService.logModelLoadingStarted(
        job.id,
        fileInfo.fileType
      )

      // Initialize Puppeteer renderer if not already done
      if (!this.puppeteerRenderer) {
        this.puppeteerRenderer = new PuppeteerRenderer()
        await this.puppeteerRenderer.initialize()
      }

      // Load model in browser
      const polygonCount = await this.puppeteerRenderer.loadModel(
        fileInfo.filePath,
        fileInfo.fileType
      )

      jobLogger.info('Model loaded successfully in browser', {
        polygonCount,
        fileType: fileInfo.fileType,
      })

      await this.jobEventService.logModelLoaded(
        job.id,
        polygonCount,
        fileInfo.fileType
      )

      // Step 3.5: Fetch and apply textures if default texture set is configured
      try {
        // Use defaultTextureSetId from job (version-specific)
        if (job.defaultTextureSetId) {
          jobLogger.info('Model version has default texture set configured', {
            defaultTextureSetId: job.defaultTextureSetId,
            modelVersionId: job.modelVersionId,
          })

          await this.jobEventService.logEvent(
            job.id,
            'TextureFetchStarted',
            `Fetching texture set ${job.defaultTextureSetId} for version ${job.modelVersionId}`
          )

          const textureSet = await this.modelDataService.getTextureSet(
            job.defaultTextureSetId
          )

          if (
            textureSet &&
            textureSet.textures &&
            textureSet.textures.length > 0
          ) {
            jobLogger.info('Downloading texture files', {
              textureSetId: textureSet.id,
              textureSetName: textureSet.name,
              textureCount: textureSet.textures.length,
            })

            texturePaths =
              await this.modelDataService.downloadTextureSetFiles(textureSet)

            if (Object.keys(texturePaths).length > 0) {
              jobLogger.info('Applying textures to model', {
                textureTypes: Object.keys(texturePaths),
              })

              const texturesApplied =
                await this.puppeteerRenderer.applyTextures(
                  texturePaths,
                  fileInfo.fileType
                )

              if (texturesApplied) {
                await this.jobEventService.logEvent(
                  job.id,
                  'TexturesApplied',
                  `Applied ${Object.keys(texturePaths).length} textures to model`
                )
                jobLogger.info('Textures applied successfully')
              } else {
                jobLogger.warn(
                  'Failed to apply textures, continuing without them'
                )
              }
            } else {
              jobLogger.warn('No texture files could be downloaded')
            }
          } else {
            jobLogger.info(
              'Texture set has no textures or could not be fetched'
            )
          }
        } else {
          jobLogger.debug('No default texture set configured for this model')
        }
      } catch (textureError) {
        jobLogger.warn(
          'Failed to fetch or apply textures, continuing without them',
          {
            error: textureError.message,
          }
        )
        // Don't fail the job if textures can't be applied, continue with rendering
      }

      // Step 4: Generate orbit frames using Puppeteer renderer
      if (config.orbit.enabled) {
        jobLogger.info('Starting orbit frame rendering with Puppeteer')

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
        const renderStartTime = Date.now()
        const frames = await this.puppeteerRenderer.renderOrbitFrames(jobLogger)

        // Log memory statistics
        const memoryStats = this.puppeteerRenderer.getMemoryStats(frames)
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

        const renderTime = Date.now() - renderStartTime
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
              encodingResult.pngPath,
              job.modelId, // Pass model ID for API upload
              job.modelVersionId // Pass model version ID for version-specific upload
            )

            jobLogger.info('Thumbnail API upload completed', {
              stored: storageResult.stored,
              webpStored: storageResult.webpStored,
              posterStored: storageResult.posterStored,
              pngStored: storageResult.pngStored,
              uploadResults: storageResult.uploadResults?.length || 0,
              allSuccessful: storageResult.apiResponse?.allSuccessful,
            })

            await this.jobEventService.logThumbnailUploadCompleted(
              job.id,
              storageResult.uploadResults
            )

            // Step 7: Run image classification on model views (if enabled)
            if (config.imageClassification.enabled) {
              try {
                jobLogger.info('Starting image classification on model views')

                // Initialize classification renderer if not already done
                if (!this.classificationRenderer) {
                  this.classificationRenderer = new ClassificationRenderer(
                    this.puppeteerRenderer
                  )
                }

                // Render classification views
                const viewImages =
                  await this.classificationRenderer.renderClassificationViews(
                    jobLogger
                  )

                // Initialize image tagger
                await this.imageTagger.initialize()

                // Get storage path for debug images (use thumbnailStorage path or a fallback)
                const storagePath =
                  config.thumbnailStorage?.basePath || '/tmp/modelibr'

                // Classify each view image and save debug images
                const allPredictions = []
                for (let i = 0; i < viewImages.length; i++) {
                  const { buffer, view } = viewImages[i]

                  // Save debug image for frontend display
                  await this.imageTagger.saveDebugImage(
                    buffer,
                    job.modelId,
                    view,
                    storagePath
                  )

                  // Classify the image with view information
                  const predictions = await this.imageTagger.describeImage(
                    buffer,
                    config.imageClassification.topKPerImage,
                    view
                  )
                  allPredictions.push(predictions)
                  jobLogger.debug('Classified view image', {
                    view: view.name,
                    azimuth: view.azimuth,
                    elevation: view.elevation,
                    topPrediction: predictions[0]?.className,
                    confidence: predictions[0]?.probability,
                  })
                }

                // Aggregate tags from all predictions
                const { tags, description } = TagAggregator.aggregateTags(
                  allPredictions,
                  {
                    minConfidence: config.imageClassification.minConfidence,
                    maxTags: config.imageClassification.maxTags,
                  }
                )

                jobLogger.info('Image classification completed', {
                  tags,
                  description,
                })

                // Update model tags via API
                const updateResult =
                  await this.thumbnailApiService.updateModelTags(
                    job.modelId,
                    tags,
                    description
                  )

                if (updateResult.success) {
                  jobLogger.info('Model tags updated successfully')
                } else {
                  jobLogger.warn(
                    'Failed to update model tags, continuing anyway',
                    {
                      error: updateResult.error,
                    }
                  )
                }
              } catch (classificationError) {
                // Don't fail the entire job if classification fails
                jobLogger.warn(
                  'Image classification failed, continuing with thumbnail completion',
                  {
                    error: classificationError.message,
                    stack: classificationError.stack,
                  }
                )
              }
            } else {
              jobLogger.info('Image classification is disabled, skipping')
            }

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

      // Clean up temporary texture files
      if (texturePaths) {
        await this.modelDataService.cleanupTextureFiles(texturePaths)
      }
    }
  }

  /**
   * Process a sound for waveform thumbnail generation
   * @param {Object} job - The job being processed
   * @param {Object} jobLogger - Logger with job context
   */
  async processSound(job, jobLogger) {
    let tempFilePath = null

    try {
      jobLogger.info('Starting sound waveform processing', {
        soundId: job.soundId,
        soundHash: job.soundHash,
      })

      // Step 1: Fetch the sound file
      jobLogger.info('Fetching sound file from API')

      const fileInfo = await this.soundFileService.fetchSoundFile(job.soundId)
      tempFilePath = fileInfo.filePath

      jobLogger.info('Sound file fetched successfully', {
        originalFileName: fileInfo.originalFileName,
        fileType: fileInfo.fileType,
        filePath: fileInfo.filePath,
      })

      // Step 2: Generate waveform PNG
      jobLogger.info('Generating waveform thumbnail')

      const tempOutputPath = `${tempFilePath}.waveform.png`
      const { peaks, duration } = await this.waveformGenerator.generateWaveform(
        tempFilePath,
        tempOutputPath,
        {
          width: 800,
          height: 150,
          peakCount: 200,
          color: '#3b82f6',
        }
      )

      jobLogger.info('Waveform thumbnail generated', {
        outputPath: tempOutputPath,
        duration,
        peakCount: peaks.length,
      })

      // Step 3: Upload waveform thumbnail to backend API
      jobLogger.info('Uploading waveform thumbnail to backend')

      const uploadResult = await this.thumbnailApiService.uploadSoundWaveform(
        job.soundId,
        tempOutputPath,
        job.soundHash
      )

      if (!uploadResult.success) {
        throw new Error(
          `Failed to upload waveform thumbnail: ${uploadResult.error}`
        )
      }

      jobLogger.info('Waveform thumbnail uploaded successfully', {
        storagePath: uploadResult.storagePath,
        sizeBytes: uploadResult.sizeBytes,
      })

      return {
        waveformPath: uploadResult.storagePath,
        sizeBytes: uploadResult.sizeBytes,
      }
    } catch (error) {
      jobLogger.error('Sound waveform generation failed', {
        error: error.message,
        stack: error.stack,
      })
      throw error
    } finally {
      // Clean up temporary files
      if (tempFilePath) {
        this.soundFileService.cleanupFile(tempFilePath)

        // Also cleanup the waveform output file
        const tempOutputPath = `${tempFilePath}.waveform.png`
        this.soundFileService.cleanupFile(tempOutputPath)
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

            // Clean up old texture files
            await this.modelDataService.cleanupOldTextureFiles()

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

    // Stop periodic polling
    if (this.pollIntervalHandle) {
      clearInterval(this.pollIntervalHandle)
      this.pollIntervalHandle = null
    }

    // Log remaining jobs in queue
    if (this.jobQueue.length > 0) {
      logger.warn('Jobs remaining in queue during shutdown', {
        queueSize: this.jobQueue.length,
        jobIds: this.jobQueue.map(j => j.id),
      })
      this.jobQueue = [] // Clear the queue
    }

    // Dispose of Puppeteer renderer resources
    if (this.puppeteerRenderer) {
      await this.puppeteerRenderer.dispose()
      this.puppeteerRenderer = null
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
      (this.activeJobs.size > 0 || this.isProcessingQueue) &&
      Date.now() - startTime < shutdownTimeout
    ) {
      logger.info('Waiting for active jobs to complete', {
        activeJobs: this.activeJobs.size,
        isProcessingQueue: this.isProcessingQueue,
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
      queueSize: this.jobQueue.length,
      isProcessingQueue: this.isProcessingQueue,
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
