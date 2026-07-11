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
   * @param {AbortSignal} [signal] - Aborted by the job queue when this job's
   *   timeout fires. Threaded through to process() so cancellable awaits can
   *   stop early; also used here to avoid double-reporting a job's outcome
   *   to the backend (which has no guard against being finished twice) once
   *   the queue's timeout handler has already reported it as failed.
   * @returns {Promise<void>}
   */
  async execute(job, signal) {
    const assetId =
      job.modelId ||
      job.soundId ||
      job.textureSetId ||
      job.environmentMapId ||
      job.id
    const jobLogger = withJobContext(job.id, assetId)

    try {
      jobLogger.info(`Starting ${this.processorType} processing`)

      await this.jobEventService.logJobStarted(
        job.id,
        assetId,
        job.modelHash || job.soundHash
      )

      const result = await this.process(job, jobLogger, signal)

      if (signal?.aborted) {
        // The job queue already timed this job out and reported it failed
        // while we were still running. Discard this late result instead of
        // double-finishing the job — a different worker may have already
        // reclaimed it for retry.
        jobLogger.warn(
          `${this.processorType} processing finished after the job had already timed out — discarding stale result`
        )
        return
      }

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

      if (signal?.aborted) {
        jobLogger.warn(
          'Skipping markFailed — job was already finished by the timeout handler'
        )
      } else {
        try {
          await this.markFailed(job, error.message)
        } catch (markFailedError) {
          jobLogger.error('Failed to mark job as failed', {
            markFailedError: markFailedError.message,
          })
        }
      }

      throw error
    }
  }

  /**
   * Process the job. Must be overridden by subclasses.
   * @param {Object} job - The job to process.
   * @param {Object} jobLogger - Logger with job context.
   * @param {AbortSignal} [signal] - Set when the job queue times this job
   *   out. Renderer-backed processors should listen for 'abort' and hand
   *   their held renderer to `_armRendererAbort()` so the pool slot is
   *   force-reinitialized instead of left hung.
   * @returns {Promise<Object>} Result metadata.
   */
  // eslint-disable-next-line no-unused-vars
  async process(job, jobLogger, signal) {
    throw new Error('Subclass must implement process()')
  }

  /**
   * Arm an abort listener that force-reinitializes a RendererPool slot when
   * the job holding it times out. Puppeteer's in-flight page.evaluate()
   * calls reject once the page is torn down, which unwinds the processor's
   * own try/finally and returns the slot via the normal `rendererPool
   * .release()` path — but with a fresh, usable page instead of a hung one.
   * @param {AbortSignal|undefined} signal
   * @param {import('../rendererPool.js').RendererPool} rendererPool
   * @param {*} renderer - The renderer this job currently holds.
   * @param {Object} jobLogger
   * @returns {() => void} Disarm function — call it once the renderer has
   *   been released normally so a later abort (there shouldn't be one) is
   *   a no-op.
   */
  _armRendererAbort(signal, rendererPool, renderer, jobLogger) {
    if (!signal || !renderer) {
      return () => {}
    }

    const onAbort = () => {
      jobLogger.warn('Job aborted — force-reinitializing renderer pool slot')
      rendererPool.forceReinit(renderer).catch(reinitError => {
        jobLogger.error('Failed to force-reinitialize renderer after abort', {
          error: reinitError.message,
        })
      })
    }

    signal.addEventListener('abort', onAbort)
    return () => signal.removeEventListener('abort', onAbort)
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
