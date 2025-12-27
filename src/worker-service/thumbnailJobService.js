import axios from 'axios'
import https from 'https'
import { config } from './config.js'
import logger from './logger.js'

/**
 * Service for interacting with the thumbnail job queue API
 */
export class ThumbnailJobService {
  constructor() {
    const httpsAgent = config.apiBaseUrl.startsWith('https:')
      ? new https.Agent({ rejectUnauthorized: config.rejectUnauthorized })
      : undefined

    this.apiClient = axios.create({
      baseURL: config.apiBaseUrl,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
      // Handle self-signed certificates in development/docker environments
      httpsAgent,
    })
  }

  /**
   * Poll for the next available thumbnail job
   * @returns {Promise<Object|null>} Job object or null if no jobs available
   */
  async pollForJob() {
    try {
      const response = await this.apiClient.post(
        '/api/thumbnail-jobs/dequeue',
        {
          workerId: config.workerId,
        }
      )

      if (response.status === 204) {
        // No jobs available
        return null
      }

      return response.data
    } catch (error) {
      if (error.response?.status === 404) {
        // No jobs available or endpoint not found
        logger.debug('No thumbnail jobs available or API endpoint not found')
        return null
      }

      logger.error('Failed to poll for thumbnail job', {
        error: error.message,
        status: error.response?.status,
        workerId: config.workerId,
      })
      throw error
    }
  }

  /**
   * Finish a job (mark as completed or failed)
   * @param {number} jobId - The job ID
   * @param {boolean} success - Whether the job succeeded
   * @param {Object} metadata - Thumbnail metadata (required when success=true)
   * @param {string} metadata.thumbnailPath - Path to the stored thumbnail
   * @param {number} metadata.sizeBytes - Size of the thumbnail in bytes
   * @param {number} metadata.width - Width of the thumbnail
   * @param {number} metadata.height - Height of the thumbnail
   * @param {string} errorMessage - Error message (required when success=false)
   */
  async finishJob(jobId, success, metadata = {}, errorMessage = null) {
    try {
      const requestData = {
        success,
        thumbnailPath: metadata?.thumbnailPath || null,
        sizeBytes: metadata?.sizeBytes || null,
        width: metadata?.width || null,
        height: metadata?.height || null,
        errorMessage
      }

      await this.apiClient.post(
        `/api/thumbnail-jobs/${jobId}/finish`,
        requestData
      )
      logger.info(success ? 'Marked job as completed' : 'Marked job as failed', {
        jobId,
        success,
        ...(success ? { thumbnailMetadata: metadata } : { errorMessage })
      })
    } catch (error) {
      logger.error('Failed to finish job', {
        jobId,
        success,
        error: error.message,
      })
      throw error
    }
  }

  /**
   * Mark a job as completed (convenience wrapper)
   * @deprecated Use finishJob with success=true instead
   */
  async markJobCompleted(jobId, thumbnailMetadata) {
    return this.finishJob(jobId, true, thumbnailMetadata)
  }

  /**
   * Mark a job as failed (convenience wrapper)
   * @deprecated Use finishJob with success=false instead
   */
  async markJobFailed(jobId, errorMessage) {
    return this.finishJob(jobId, false, {}, errorMessage)
  }

  /**
   * Get model file information for a job
   * @param {number} modelId - The model ID
   * @param {number} [modelVersionId] - Optional model version ID (if provided, fetches version-specific file)
   * @returns {Promise<Object>} Model file information
   */
  async getModelFile(modelId, modelVersionId = null) {
    try {
      // Use version-specific endpoint if modelVersionId is provided
      const endpoint = modelVersionId
        ? `/models/${modelId}/versions/${modelVersionId}/file`
        : `/models/${modelId}/file`
      
      const response = await this.apiClient.get(endpoint, {
        responseType: 'stream',
      })
      return response
    } catch (error) {
      logger.error('Failed to get model file', {
        modelId,
        modelVersionId,
        error: error.message,
      })
      throw error
    }
  }

  /**
   * Test API connectivity
   * @returns {Promise<boolean>} True if API is reachable
   */
  async testConnection() {
    try {
      const response = await this.apiClient.get('/health')
      return response.status === 200
    } catch (error) {
      logger.warn('API health check failed', {
        error: error.message,
        baseURL: config.apiBaseUrl,
      })
      return false
    }
  }
}
