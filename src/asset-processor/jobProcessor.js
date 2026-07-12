import { JobApiClient } from './jobApiClient.js'
import { SignalRQueueService } from './signalrQueueService.js'
import { ModelFileService } from './modelFileService.js'
import { ModelDataService } from './modelDataService.js'
import { ProcessorRegistry } from './processors/processorRegistry.js'
import {
  config,
  refreshBlenderConfigFromApi,
  refreshThumbnailRenderConfigFromApi,
} from './config.js'
import logger from './logger.js'

/**
 * Job processor that handles thumbnail generation using SignalR real-time queue.
 * Dispatch goes exclusively through ProcessorRegistry (see processors/) —
 * this class owns queueing, concurrency, timeouts and lifecycle only.
 */
export class JobProcessor {
  constructor() {
    this.jobService = new JobApiClient()
    this.signalrQueueService = new SignalRQueueService()
    this.modelFileService = new ModelFileService()
    this.modelDataService = new ModelDataService()
    this.isShuttingDown = false
    this.activeJobs = new Map()
    this.jobQueue = [] // Local queue for sequential processing
    this.isProcessingQueue = false // Flag to prevent concurrent queue processing
    this.isPollingForJobs = false
    this.pollIntervalHandle = null
    this.processorRegistry = new ProcessorRegistry()
  }

  /**
   * Start the job processing system
   */
  async start() {
    logger.info('Starting SignalR-based job processor', {
      workerId: config.workerId,
      modelProcessing: config.modelProcessing,
    })

    // Test API connection before starting
    const isConnected = await this.jobService.testConnection()
    if (!isConnected) {
      logger.warn('API connection test failed, but continuing anyway')
    }

    // Refresh blender + thumbnail render config from API settings
    await refreshBlenderConfigFromApi(this.jobService)
    await refreshThumbnailRenderConfigFromApi(this.jobService)

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

    const pollIntervalMs = parseInt(process.env.POLL_INTERVAL_MS) || 5000
    logger.info('Starting periodic polling', { pollIntervalMs })
    this.pollIntervalHandle = setInterval(async () => {
      if (this.isShuttingDown || this.isPollingForJobs) {
        return
      }

      // Don't poll if queue already has plenty of items waiting
      if (this.jobQueue.length >= 50) {
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
          logger.info('Found pending job during polling', {
            jobId: job.id,
            assetType: job.assetType,
            modelId: job.modelId,
            soundId: job.soundId,
          })

          // Add job to queue for sequential processing
          const processor = this.processorRegistry.getProcessor(job)
          if (processor) {
            this.jobQueue.push({
              job: job,
              processor: processor.execute.bind(processor),
            })
          } else {
            logger.warn('No processor found for job, skipping', {
              jobId: job.id,
              assetType: job.assetType,
            })
          }
        }
      } while (job !== null && jobsProcessed < 100) // Safety limit

      if (jobsProcessed > 0) {
        logger.info('Job polling complete', {
          jobsFound: jobsProcessed,
        })
        // Start processing the queue
        this.processQueue()
      } else {
        logger.debug('No pending jobs found during polling')
      }
    } catch (error) {
      logger.error('Error during job polling', {
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
        const processor = this.processorRegistry.getProcessor(claimedJob)
        if (processor) {
          this.jobQueue.push({
            job: claimedJob,
            processor: processor.execute.bind(processor),
          })
        } else {
          logger.warn('No processor found for job, skipping', {
            jobId: claimedJob.id,
            assetType: claimedJob.assetType,
          })
        }
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
        const proc = this.processorRegistry.getProcessor(claimedJob)
        if (proc) {
          this.jobQueue.push({
            job: claimedJob,
            processor: proc.execute.bind(proc),
          })
        } else {
          logger.warn('No processor found for job, skipping', {
            jobId: claimedJob.id,
            assetType: claimedJob.assetType,
          })
        }
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
   * Process jobs from the queue with parallel execution
   */
  async processQueue() {
    // Prevent concurrent queue processing loops
    if (this.isProcessingQueue) {
      return
    }

    this.isProcessingQueue = true
    const maxConcurrent = config.maxConcurrentJobs || 3

    try {
      const activePromises = new Set()

      // MUST be synchronous — shift from queue and add to activePromises immediately
      // so the while-loop conditions update on each iteration without yielding.
      const startNextJob = () => {
        if (this.jobQueue.length === 0 || this.isShuttingDown) return

        const { job, processor } = this.jobQueue.shift()
        logger.info('Processing job from queue', {
          jobId: job.id,
          remainingInQueue: this.jobQueue.length,
          activeJobs: activePromises.size,
        })

        this.activeJobs.set(job.id, job)

        const timeoutMs = config.jobTimeout || 300000
        const abortController = new AbortController()
        let timeoutHandle
        let processorInvoked = false

        const jobPromise = (async () => {
          try {
            await refreshBlenderConfigFromApi(this.jobService)
            await refreshThumbnailRenderConfigFromApi(this.jobService)

            const timeoutPromise = new Promise((_, reject) => {
              timeoutHandle = setTimeout(() => {
                reject(
                  new Error(`Job processing timed out after ${timeoutMs}ms`)
                )
              }, timeoutMs)
            })

            // Pass an abort signal through to the processor so cancellable
            // awaits (and, for renderer-backed processors, the RendererPool
            // slot they're holding) can be torn down instead of hanging
            // forever once the timeout below fires.
            processorInvoked = true
            await Promise.race([
              processor(job, abortController.signal),
              timeoutPromise,
            ])
            clearTimeout(timeoutHandle)
          } catch (error) {
            clearTimeout(timeoutHandle)

            if (error.message.includes('timed out')) {
              logger.error(`Job ${job.id} timed out after ${timeoutMs}ms`, {
                jobId: job.id,
                timeoutMs,
              })
              // Abort the abandoned work. Renderer-backed processors react
              // to this by force-reinitializing the pool slot they hold —
              // without it a hung Puppeteer page keeps that slot forever
              // and every concurrent job eventually deadlocks the worker
              // while /health keeps reporting healthy.
              abortController.abort()
              try {
                await this.jobService.markJobFailed(job.id, error.message)
              } catch (markFailedError) {
                logger.error('Failed to mark timed-out job as failed', {
                  jobId: job.id,
                  error: markFailedError.message,
                })
              }
            } else if (!processorInvoked) {
              // Failed before the processor ever ran (e.g. a config
              // refresh error) — nothing else has reported this job's
              // outcome, so without this it would sit as "Processing"
              // until the backend's lock timeout eventually expires.
              logger.error('Job failed before processing started', {
                jobId: job.id,
                error: error.message,
              })
              try {
                await this.jobService.markJobFailed(job.id, error.message)
              } catch (markFailedError) {
                logger.error('Failed to mark job as failed', {
                  jobId: job.id,
                  error: markFailedError.message,
                })
              }
            } else {
              // BaseProcessor.execute() already reported this job's
              // outcome to the backend — or deliberately skipped doing so
              // because it was aborted by the timeout branch above. The
              // backend has no guard against a job being finished twice,
              // so don't call markJobFailed again here: a duplicate call
              // could clobber a job a different worker has since
              // reclaimed.
              logger.error('Job processing failed', {
                jobId: job.id,
                error: error.message,
                aborted: abortController.signal.aborted,
              })
            }
          }
        })()

        activePromises.add(jobPromise)
        jobPromise.finally(() => {
          activePromises.delete(jobPromise)
          this.activeJobs.delete(job.id)
        })
      }

      // Fill initial slots up to maxConcurrent
      while (
        activePromises.size < maxConcurrent &&
        this.jobQueue.length > 0 &&
        !this.isShuttingDown
      ) {
        startNextJob()
      }

      // Process remaining jobs as slots free up
      while (
        (activePromises.size > 0 || this.jobQueue.length > 0) &&
        !this.isShuttingDown
      ) {
        if (activePromises.size === 0) break

        // Wait for any job to finish
        await Promise.race([...activePromises])

        // Fill available slots
        while (
          activePromises.size < maxConcurrent &&
          this.jobQueue.length > 0 &&
          !this.isShuttingDown
        ) {
          startNextJob()
        }
      }

      // Wait for all remaining active jobs to complete
      if (activePromises.size > 0) {
        await Promise.allSettled([...activePromises])
      }
    } finally {
      this.isProcessingQueue = false
    }
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

    // Clean up all registered processors (each owns its own RendererPool /
    // FrameEncoderService and releases them here)
    if (this.processorRegistry) {
      await this.processorRegistry.cleanupAll()
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
