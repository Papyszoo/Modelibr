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
    
    // Create fallback clients for connection resilience
    this.fallbackClients = this.createFallbackClients()
  }
  
  /**
   * Create fallback API clients for different connection scenarios
   */
  createFallbackClients() {
    const baseUrl = config.apiBaseUrl
    const clients = []
    
    // HTTP fallback (for HTTPS -> HTTP scenarios)
    if (baseUrl.startsWith('https:')) {
      const httpUrl = baseUrl.replace('https:', 'http:')
      clients.push({
        name: 'http_fallback',
        client: axios.create({
          baseURL: httpUrl,
          timeout: 30000,
          headers: { 'Content-Type': 'application/json' }
        })
      })
    }
    
    // HTTPS with relaxed SSL (for development environments)
    if (baseUrl.startsWith('http:') && process.env.ASPNETCORE_ENVIRONMENT === 'Development') {
      const httpsUrl = baseUrl.replace('http:', 'https:')
      clients.push({
        name: 'https_relaxed_ssl',
        client: axios.create({
          baseURL: httpsUrl,
          timeout: 30000,
          headers: { 'Content-Type': 'application/json' },
          httpsAgent: new https.Agent({ rejectUnauthorized: false })
        })
      })
    }
    
    return clients
  }

  /**
   * Try an API call with fallback clients if the primary fails
   * @param {Function} apiCall - Function that makes the API call with a client
   * @returns {Promise<any>} The successful response
   */
  async tryWithFallbacks(apiCall) {
    // Try primary client first
    try {
      return await apiCall(this.apiClient, 'primary')
    } catch (primaryError) {
      // If primary fails with connection error, try fallbacks
      const isConnectionError = primaryError.code === 'ECONNREFUSED' || 
                                primaryError.code === 'ENOTFOUND' || 
                                primaryError.code === 'ETIMEDOUT' ||
                                primaryError.message.includes('ECONNREFUSED')
      
      if (isConnectionError && this.fallbackClients.length > 0) {
        logger.debug('Primary API client failed, trying fallbacks', {
          primaryError: primaryError.message,
          fallbackCount: this.fallbackClients.length
        })
        
        for (const fallback of this.fallbackClients) {
          try {
            const result = await apiCall(fallback.client, fallback.name)
            logger.info('API call succeeded with fallback client', {
              fallback: fallback.name,
              primaryError: primaryError.message
            })
            return result
          } catch (fallbackError) {
            logger.debug('Fallback client failed', {
              fallback: fallback.name,
              error: fallbackError.message
            })
          }
        }
      }
      
      // If all clients failed, throw the original error
      throw primaryError
    }
  }

  /**
   * Poll for the next available thumbnail job
   * @returns {Promise<Object|null>} Job object or null if no jobs available
   */
  async pollForJob() {
    try {
      const response = await this.tryWithFallbacks(async (client, clientName) => {
        return await client.post('/api/thumbnail-jobs/dequeue', {
          workerId: config.workerId,
        })
      })

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
   * Test API connectivity with multiple fallback strategies
   * @returns {Promise<boolean>} True if API is reachable
   */
  async testConnection() {
    const baseUrl = config.apiBaseUrl
    const attempts = []
    
    // Strategy 1: Try the configured endpoint first
    try {
      const response = await this.apiClient.get('/health')
      if (response.status === 200) {
        logger.info('API connection successful', { 
          baseURL: baseUrl,
          strategy: 'configured_endpoint'
        })
        return true
      }
    } catch (error) {
      attempts.push({
        strategy: 'configured_endpoint',
        url: `${baseUrl}/health`,
        error: error.message,
        code: error.code
      })
      
      logger.debug('API connection attempt failed', {
        strategy: 'configured_endpoint',
        error: error.message,
        code: error.code,
        baseURL: baseUrl
      })
    }
    
    // Strategy 2: If HTTPS failed, try HTTP (common in debugging scenarios)
    if (baseUrl.startsWith('https:')) {
      const httpUrl = baseUrl.replace('https:', 'http:')
      try {
        const httpClient = axios.create({
          baseURL: httpUrl,
          timeout: 30000,
          headers: { 'Content-Type': 'application/json' }
        })
        
        const response = await httpClient.get('/health')
        if (response.status === 200) {
          logger.info('API connection successful via HTTP fallback', { 
            baseURL: httpUrl,
            strategy: 'http_fallback',
            originalUrl: baseUrl
          })
          return true
        }
      } catch (error) {
        attempts.push({
          strategy: 'http_fallback',
          url: `${httpUrl}/health`,
          error: error.message,
          code: error.code
        })
      }
    }
    
    // Strategy 3: If HTTP failed, try HTTPS with relaxed SSL (for development)
    if (baseUrl.startsWith('http:') && process.env.ASPNETCORE_ENVIRONMENT === 'Development') {
      const httpsUrl = baseUrl.replace('http:', 'https:')
      try {
        const httpsClient = axios.create({
          baseURL: httpsUrl,
          timeout: 30000,
          headers: { 'Content-Type': 'application/json' },
          httpsAgent: new https.Agent({ 
            rejectUnauthorized: false // Allow self-signed certs in development
          })
        })
        
        const response = await httpsClient.get('/health')
        if (response.status === 200) {
          logger.info('API connection successful via HTTPS with relaxed SSL', { 
            baseURL: httpsUrl,
            strategy: 'https_relaxed_ssl',
            originalUrl: baseUrl
          })
          return true
        }
      } catch (error) {
        attempts.push({
          strategy: 'https_relaxed_ssl',
          url: `${httpsUrl}/health`,
          error: error.message,
          code: error.code
        })
      }
    }
    
    // Log all failed attempts for debugging
    logger.warn('All API health check strategies failed', {
      baseURL: baseUrl,
      attempts: attempts,
      environment: process.env.ASPNETCORE_ENVIRONMENT
    })
    
    return false
  }
}
