import { ThumbnailJobService } from './thumbnailJobService.js';
import { config } from './config.js';
import logger, { withJobContext } from './logger.js';

/**
 * Job processor that handles thumbnail generation
 */
export class JobProcessor {
  constructor() {
    this.jobService = new ThumbnailJobService();
    this.isShuttingDown = false;
    this.activeJobs = new Map();
  }

  /**
   * Start the job polling loop
   */
  async start() {
    logger.info('Starting job processor', {
      workerId: config.workerId,
      pollInterval: config.pollIntervalMs,
      maxConcurrentJobs: config.maxConcurrentJobs
    });

    // Test API connection before starting
    const isConnected = await this.jobService.testConnection();
    if (!isConnected) {
      logger.warn('API connection test failed, but continuing anyway');
    }

    this.pollLoop();
  }

  /**
   * Main polling loop
   */
  async pollLoop() {
    while (!this.isShuttingDown) {
      try {
        // Check if we can accept more jobs
        if (this.activeJobs.size >= config.maxConcurrentJobs) {
          logger.debug('Max concurrent jobs reached, waiting', {
            activeJobs: this.activeJobs.size,
            maxConcurrentJobs: config.maxConcurrentJobs
          });
          await this.sleep(config.pollIntervalMs);
          continue;
        }

        // Poll for next job
        const job = await this.jobService.pollForJob();
        
        if (job) {
          logger.info('Received thumbnail job', {
            jobId: job.id,
            modelId: job.modelId,
            modelHash: job.modelHash,
            attemptCount: job.attemptCount
          });

          // Process job asynchronously
          this.processJobAsync(job);
        } else {
          // No jobs available, wait before polling again
          await this.sleep(config.pollIntervalMs);
        }
      } catch (error) {
        logger.error('Error in polling loop', {
          error: error.message,
          stack: error.stack
        });
        
        // Wait before retrying to avoid tight error loops
        await this.sleep(Math.min(config.pollIntervalMs * 2, 30000));
      }
    }

    logger.info('Job processor stopped');
  }

  /**
   * Process a job asynchronously
   * @param {Object} job - The job to process
   */
  async processJobAsync(job) {
    const jobLogger = withJobContext(job.id, job.modelId);
    this.activeJobs.set(job.id, job);

    try {
      jobLogger.info('Starting thumbnail generation');
      
      // TODO: This is where the actual three.js rendering will be implemented
      // For now, we'll simulate processing time and mark as completed
      await this.simulateProcessing(job, jobLogger);
      
      await this.jobService.markJobCompleted(job.id);
      jobLogger.info('Thumbnail generation completed successfully');
      
    } catch (error) {
      jobLogger.error('Thumbnail generation failed', {
        error: error.message,
        stack: error.stack
      });
      
      try {
        await this.jobService.markJobFailed(job.id, error.message);
      } catch (markFailedError) {
        jobLogger.error('Failed to mark job as failed', {
          markFailedError: markFailedError.message
        });
      }
    } finally {
      this.activeJobs.delete(job.id);
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
      outputFormat: config.rendering.outputFormat
    });

    // Simulate variable processing time (1-5 seconds)
    const processingTime = Math.random() * 4000 + 1000;
    await this.sleep(processingTime);

    // Randomly simulate failures for testing error handling
    if (Math.random() < 0.1) { // 10% failure rate
      throw new Error('Simulated processing failure for testing');
    }

    jobLogger.info('Thumbnail generation simulation completed', {
      processingTimeMs: Math.round(processingTime)
    });
  }

  /**
   * Gracefully shutdown the processor
   */
  async shutdown() {
    logger.info('Shutting down job processor');
    this.isShuttingDown = true;

    // Wait for active jobs to complete (with timeout)
    const shutdownTimeout = 30000; // 30 seconds
    const startTime = Date.now();

    while (this.activeJobs.size > 0 && (Date.now() - startTime) < shutdownTimeout) {
      logger.info('Waiting for active jobs to complete', {
        activeJobs: this.activeJobs.size,
        remainingTimeoutMs: shutdownTimeout - (Date.now() - startTime)
      });
      await this.sleep(1000);
    }

    if (this.activeJobs.size > 0) {
      logger.warn('Shutdown timeout reached, some jobs may not have completed', {
        activeJobs: Array.from(this.activeJobs.keys())
      });
    }

    logger.info('Job processor shutdown complete');
  }

  /**
   * Get current processor status
   */
  getStatus() {
    return {
      isShuttingDown: this.isShuttingDown,
      activeJobs: this.activeJobs.size,
      maxConcurrentJobs: config.maxConcurrentJobs,
      workerId: config.workerId
    };
  }

  /**
   * Sleep utility
   * @param {number} ms - Milliseconds to sleep
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}