import fs from 'fs'
import FormData from 'form-data'
import axios from 'axios'
import https from 'https'
import { config } from './config.js'
import logger from './logger.js'

/**
 * Service for uploading thumbnails to the backend API
 */
export class ThumbnailApiService {
  constructor() {
    this.apiBaseUrl = config.apiBaseUrl
    const httpsAgent = this.apiBaseUrl.startsWith('https:')
      ? new https.Agent({ rejectUnauthorized: config.rejectUnauthorized })
      : undefined

    this.client = axios.create({
      baseURL: this.apiBaseUrl,
      timeout: 30000, // 30 second timeout
      headers: {
        'User-Agent': 'Modelibr-ThumbnailWorker/1.0',
      },
      // Handle self-signed certificates in development/docker environments
      httpsAgent,
    })
  }

  /**
   * Upload a thumbnail file to the backend API
   * @param {number} modelId - The model ID to upload thumbnail for
   * @param {string} thumbnailPath - Path to the thumbnail file
   * @param {Object} metadata - Optional metadata about the thumbnail
   * @returns {Promise<Object>} Upload result
   */
  async uploadThumbnail(modelId, thumbnailPath, metadata = {}) {
    try {
      if (!fs.existsSync(thumbnailPath)) {
        throw new Error(`Thumbnail file not found: ${thumbnailPath}`)
      }

      const formData = new FormData()

      // Add the file
      formData.append('file', fs.createReadStream(thumbnailPath))

      // Add optional metadata
      if (metadata.width) {
        formData.append('width', metadata.width.toString())
      }
      if (metadata.height) {
        formData.append('height', metadata.height.toString())
      }

      logger.info('Uploading thumbnail to API', {
        modelId,
        thumbnailPath,
        apiUrl: `${this.apiBaseUrl}/models/${modelId}/thumbnail/upload`,
        metadata,
      })

      const response = await this.client.post(
        `/models/${modelId}/thumbnail/upload`,
        formData,
        {
          headers: {
            ...formData.getHeaders(),
            'Content-Type': 'multipart/form-data',
          },
        }
      )

      logger.info('Thumbnail uploaded successfully', {
        modelId,
        responseData: response.data,
      })

      return {
        success: true,
        data: response.data,
      }
    } catch (error) {
      logger.error('Failed to upload thumbnail to API', {
        modelId,
        thumbnailPath,
        error: error.message,
        stack: error.stack,
        response: error.response?.data,
      })

      return {
        success: false,
        error: error.message,
        details: error.response?.data,
      }
    }
  }

  /**
   * Upload multiple thumbnail files (e.g., WebP and poster)
   * @param {number} modelId - The model ID to upload thumbnails for
   * @param {Object} thumbnailPaths - Object containing paths to different thumbnail formats
   * @returns {Promise<Object>} Upload results
   */
  async uploadMultipleThumbnails(modelId, thumbnailPaths) {
    const results = {
      modelId,
      uploads: [],
      allSuccessful: true,
    }

    // Upload WebP thumbnail if available
    if (thumbnailPaths.webpPath && fs.existsSync(thumbnailPaths.webpPath)) {
      try {
        const webpStats = fs.statSync(thumbnailPaths.webpPath)
        const result = await this.uploadThumbnail(
          modelId,
          thumbnailPaths.webpPath,
          {
            width: 256, // Default WebP dimensions
            height: 256,
          }
        )

        results.uploads.push({
          type: 'webp',
          path: thumbnailPaths.webpPath,
          size: webpStats.size,
          ...result,
        })

        if (!result.success) {
          results.allSuccessful = false
        }
      } catch (error) {
        logger.error('Error processing WebP thumbnail', {
          modelId,
          path: thumbnailPaths.webpPath,
          error: error.message,
        })

        results.uploads.push({
          type: 'webp',
          path: thumbnailPaths.webpPath,
          success: false,
          error: error.message,
        })

        results.allSuccessful = false
      }
    }

    // Upload poster thumbnail if available and webp failed or not available
    if (thumbnailPaths.posterPath && fs.existsSync(thumbnailPaths.posterPath)) {
      // Only upload poster if WebP upload failed or WebP doesn't exist
      const webpUpload = results.uploads.find(u => u.type === 'webp')
      const shouldUploadPoster = !webpUpload || !webpUpload.success

      if (shouldUploadPoster) {
        try {
          const posterStats = fs.statSync(thumbnailPaths.posterPath)
          const result = await this.uploadThumbnail(
            modelId,
            thumbnailPaths.posterPath,
            {
              width: 256, // Default poster dimensions
              height: 256,
            }
          )

          results.uploads.push({
            type: 'poster',
            path: thumbnailPaths.posterPath,
            size: posterStats.size,
            ...result,
          })

          if (!result.success) {
            results.allSuccessful = false
          }
        } catch (error) {
          logger.error('Error processing poster thumbnail', {
            modelId,
            path: thumbnailPaths.posterPath,
            error: error.message,
          })

          results.uploads.push({
            type: 'poster',
            path: thumbnailPaths.posterPath,
            success: false,
            error: error.message,
          })

          results.allSuccessful = false
        }
      } else {
        logger.info('Skipping poster upload, WebP upload was successful', {
          modelId,
          posterPath: thumbnailPaths.posterPath,
        })
      }
    }

    logger.info('Multiple thumbnail upload completed', {
      modelId,
      totalUploads: results.uploads.length,
      allSuccessful: results.allSuccessful,
      uploads: results.uploads.map(u => ({
        type: u.type,
        success: u.success,
        size: u.size,
      })),
    })

    return results
  }

  /**
   * Test API connectivity
   * @returns {Promise<boolean>} True if API is reachable
   */
  async testConnection() {
    try {
      // Use the OpenAPI endpoint to test connectivity - it's lightweight and reliable
      const response = await this.client.get('/openapi/v1.json', {
        timeout: 3000,
        validateStatus: () => true, // Accept any status code, we just want to know if server responds
      })

      return response.status >= 200 && response.status < 300 // OpenAPI should return 200
    } catch (error) {
      // Only log if it's not a simple connection refused error
      if (
        !error.code ||
        !['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT'].includes(error.code)
      ) {
        logger.warn('API connectivity test failed', {
          apiBaseUrl: this.apiBaseUrl,
          error: error.message,
        })
      }
      return false
    }
  }

  /**
   * Update model tags and description via backend API
   * @param {number} modelId - The model ID to update
   * @param {string} tags - Comma-separated tags with confidence scores
   * @param {string} description - Generated description
   * @returns {Promise<Object>} Update result
   */
  async updateModelTags(modelId, tags, description) {
    try {
      logger.info('Updating model tags via API', {
        modelId,
        tagsPreview: tags?.substring(0, 100),
        description,
      })

      const response = await this.client.post(`/models/${modelId}/tags`, {
        tags,
        description,
      })

      logger.info('Model tags updated successfully', {
        modelId,
        responseData: response.data,
      })

      return {
        success: true,
        data: response.data,
      }
    } catch (error) {
      logger.error('Failed to update model tags via API', {
        modelId,
        error: error.message,
        stack: error.stack,
        response: error.response?.data,
      })

      return {
        success: false,
        error: error.message,
        details: error.response?.data,
      }
    }
  }
}
