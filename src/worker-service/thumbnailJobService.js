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
   * Mark a job as completed
   * @param {number} jobId - The job ID
   */
  async markJobCompleted(jobId) {
    try {
      await this.apiClient.post(`/api/thumbnail-jobs/${jobId}/complete`)
      logger.info('Marked job as completed', { jobId })
    } catch (error) {
      logger.error('Failed to mark job as completed', {
        jobId,
        error: error.message,
      })
      throw error
    }
  }

  /**
   * Mark a job as failed
   * @param {number} jobId - The job ID
   * @param {string} errorMessage - The error message
   */
  async markJobFailed(jobId, errorMessage) {
    try {
      await this.apiClient.post(`/api/thumbnail-jobs/${jobId}/fail`, {
        errorMessage,
      })
      logger.info('Marked job as failed', { jobId, errorMessage })
    } catch (error) {
      logger.error('Failed to mark job as failed', {
        jobId,
        errorMessage,
        error: error.message,
      })
      throw error
    }
  }

  /**
   * Get model file information for a job
   * @param {number} modelId - The model ID
   * @returns {Promise<Object>} Model file information
   */
  async getModelFile(modelId) {
    try {
      const response = await this.apiClient.get(`/models/${modelId}/file`, {
        responseType: 'stream',
      })
      return response
    } catch (error) {
      logger.error('Failed to get model file', {
        modelId,
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
