import { withJobContext } from '../logger.js'
import { JobEventService } from '../jobEventService.js'
import { JobApiClient } from '../jobApiClient.js'

/**
 * Base class for all asset processors.
 * Provides common infrastructure: logging, event reporting, job status updates.
 *
 * Subclasses must implement:
 *   - get processorType() → string
 *   - async process(job, jobLogger) → object (result metadata)
 *   - async cleanup() → void (optional, for releasing resources)
 */
export class BaseProcessor {
  constructor() {
    this.jobService = new JobApiClient()
    this.jobEventService = new JobEventService()
  }

  /**
   * Processor type identifier (e.g., 'thumbnail', 'sound', 'mesh-analysis').
   * Must be overridden by subclasses.
   * @returns {string}
   */
  get processorType() {
    throw new Error('Subclass must implement get processorType()')
  }

  /**
   * Execute the full job lifecycle: start → process → complete/fail.
   * @param {Object} job - The dequeued job object from the API.
   * @returns {Promise<void>}
   */
  async execute(job) {
    const assetId = job.modelId || job.soundId || job.id
    const jobLogger = withJobContext(job.id, assetId)

    try {
      jobLogger.info(`Starting ${this.processorType} processing`)

      await this.jobEventService.logJobStarted(
        job.id,
        assetId,
        job.modelHash || job.soundHash
      )

      const result = await this.process(job, jobLogger)

      await this.markCompleted(job, result)

      await this.jobEventService.logJobCompleted(job.id, result)

      jobLogger.info(`${this.processorType} processing completed successfully`)
    } catch (error) {
      jobLogger.error(`${this.processorType} processing failed`, {
        error: error.message,
        stack: error.stack,
      })

      await this.jobEventService.logJobFailed(
        job.id,
        error.message,
        error.stack
      )

      try {
        await this.markFailed(job, error.message)
      } catch (markFailedError) {
        jobLogger.error('Failed to mark job as failed', {
          markFailedError: markFailedError.message,
        })
      }

      throw error
    }
  }

  /**
   * Process the job. Must be overridden by subclasses.
   * @param {Object} job - The job to process.
   * @param {Object} jobLogger - Logger with job context.
   * @returns {Promise<Object>} Result metadata.
   */
  // eslint-disable-next-line no-unused-vars
  async process(job, jobLogger) {
    throw new Error('Subclass must implement process()')
  }

  /**
   * Mark job as completed. Can be overridden by subclasses for custom completion logic.
   * @param {Object} job - The job.
   * @param {Object} result - The result metadata.
   */
  async markCompleted(job, result) {
    await this.jobService.markJobCompleted(job.id, result)
  }

  /**
   * Mark job as failed. Can be overridden by subclasses for custom failure logic.
   * @param {Object} job - The job.
   * @param {string} errorMessage - The error message.
   */
  async markFailed(job, errorMessage) {
    await this.jobService.markJobFailed(job.id, errorMessage)
  }

  /**
   * Release resources held by this processor. Override in subclasses.
   * Called during graceful shutdown.
   */
  async cleanup() {
    // Default: no-op. Subclasses override as needed.
  }
}
