import axios from 'axios'
import { config } from './config.js'
import logger from './logger.js'

/**
 * Service for logging thumbnail job events to the API
 */
export class JobEventService {
  constructor() {
    this.apiClient = axios.create({
      baseURL: config.apiBaseUrl,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
      },
    })
  }

  /**
   * Log an event for a thumbnail job
   * @param {number} jobId - The job ID
   * @param {string} eventType - Type of event (e.g., "JobStarted", "ModelDownloaded", "FrameRendered")
   * @param {string} message - Event message
   * @param {string|null} metadata - Optional JSON metadata
   * @param {string|null} errorMessage - Optional error message
   * @returns {Promise<Object>} API response
   */
  async logEvent(
    jobId,
    eventType,
    message,
    metadata = null,
    errorMessage = null
  ) {
    try {
      const response = await this.apiClient.post(
        `/thumbnail-jobs/${jobId}/events`,
        {
          eventType,
          message,
          metadata,
          errorMessage,
        }
      )

      logger.debug('Event logged to API', {
        jobId,
        eventType,
        eventId: response.data.eventId,
      })

      return response.data
    } catch (error) {
      logger.error('Failed to log event to API', {
        jobId,
        eventType,
        error: error.message,
      })
      // Don't throw - logging should not break the job processing
      return null
    }
  }

  /**
   * Log job started event
   */
  async logJobStarted(jobId, modelId, modelHash) {
    return await this.logEvent(
      jobId,
      'JobStarted',
      `Thumbnail generation started for model ${modelId}`,
      JSON.stringify({ modelId, modelHash })
    )
  }

  /**
   * Log model download started event
   */
  async logModelDownloadStarted(jobId, modelId) {
    return await this.logEvent(
      jobId,
      'ModelDownloadStarted',
      `Starting model file download for model ${modelId}`,
      JSON.stringify({ modelId })
    )
  }

  /**
   * Log model downloaded event
   */
  async logModelDownloaded(jobId, modelId, fileType, filePath) {
    return await this.logEvent(
      jobId,
      'ModelDownloaded',
      `Model file downloaded successfully`,
      JSON.stringify({ modelId, fileType, filePath })
    )
  }

  /**
   * Log model loading started event
   */
  async logModelLoadingStarted(jobId, fileType) {
    return await this.logEvent(
      jobId,
      'ModelLoadingStarted',
      `Loading and normalizing model (${fileType})`,
      JSON.stringify({ fileType })
    )
  }

  /**
   * Log model loaded event
   */
  async logModelLoaded(jobId, polygonCount, fileType) {
    return await this.logEvent(
      jobId,
      'ModelLoaded',
      `Model loaded successfully`,
      JSON.stringify({ polygonCount, fileType })
    )
  }

  /**
   * Log frame rendering started event
   */
  async logFrameRenderingStarted(jobId, frameCount, config) {
    return await this.logEvent(
      jobId,
      'FrameRenderingStarted',
      `Starting orbit frame rendering (${frameCount} frames)`,
      JSON.stringify({ frameCount, config })
    )
  }

  /**
   * Log frame rendering completed event
   */
  async logFrameRenderingCompleted(jobId, frameCount, renderTimeMs) {
    return await this.logEvent(
      jobId,
      'FrameRenderingCompleted',
      `Orbit frame rendering completed`,
      JSON.stringify({ frameCount, renderTimeMs })
    )
  }

  /**
   * Log encoding started event
   */
  async logEncodingStarted(jobId, frameCount) {
    return await this.logEvent(
      jobId,
      'EncodingStarted',
      `Starting frame encoding (${frameCount} frames)`,
      JSON.stringify({ frameCount })
    )
  }

  /**
   * Log encoding completed event
   */
  async logEncodingCompleted(jobId, webpPath, posterPath, encodeTimeMs) {
    return await this.logEvent(
      jobId,
      'EncodingCompleted',
      `Frame encoding completed successfully`,
      JSON.stringify({ webpPath, posterPath, encodeTimeMs })
    )
  }

  /**
   * Log thumbnail upload started event
   */
  async logThumbnailUploadStarted(jobId, modelHash) {
    return await this.logEvent(
      jobId,
      'ThumbnailUploadStarted',
      `Uploading thumbnails to API`,
      JSON.stringify({ modelHash })
    )
  }

  /**
   * Log thumbnail upload completed event
   */
  async logThumbnailUploadCompleted(jobId, uploadResults) {
    return await this.logEvent(
      jobId,
      'ThumbnailUploadCompleted',
      `Thumbnail upload completed`,
      JSON.stringify({ uploadResults })
    )
  }

  /**
   * Log job completed event
   */
  async logJobCompleted(jobId, thumbnailMetadata) {
    return await this.logEvent(
      jobId,
      'JobCompleted',
      `Thumbnail generation completed successfully`,
      JSON.stringify({ thumbnailMetadata })
    )
  }

  /**
   * Log job failed event
   */
  async logJobFailed(jobId, errorMessage, errorStack = null) {
    return await this.logEvent(
      jobId,
      'JobFailed',
      `Thumbnail generation failed`,
      errorStack ? JSON.stringify({ stack: errorStack }) : null,
      errorMessage
    )
  }

  /**
   * Log generic error event
   */
  async logError(jobId, eventType, message, error) {
    return await this.logEvent(
      jobId,
      eventType,
      message,
      error.stack ? JSON.stringify({ stack: error.stack }) : null,
      error.message
    )
  }
}
