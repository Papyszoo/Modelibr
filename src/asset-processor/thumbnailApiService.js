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
        ...(config.workerApiKey ? { 'X-Api-Key': config.workerApiKey } : {}),
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
   * @param {number} [versionId] - Optional version ID to upload for specific version
   * @returns {Promise<Object>} Upload result
   */
  async uploadThumbnail(
    modelId,
    thumbnailPath,
    metadata = {},
    versionId = null
  ) {
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

      // Construct upload URL with optional versionId parameter
      const uploadUrl = versionId
        ? `/models/${modelId}/thumbnail/upload?versionId=${versionId}`
        : `/models/${modelId}/thumbnail/upload`

      logger.info('Uploading thumbnail to API', {
        modelId,
        versionId,
        thumbnailPath,
        apiUrl: `${this.apiBaseUrl}${uploadUrl}`,
        metadata,
      })

      const response = await this.client.post(uploadUrl, formData, {
        headers: {
          ...formData.getHeaders(),
          'Content-Type': 'multipart/form-data',
        },
      })

      logger.info('Thumbnail uploaded successfully', {
        modelId,
        versionId,
        responseData: response.data,
      })

      return {
        success: true,
        data: response.data,
      }
    } catch (error) {
      logger.error('Failed to upload thumbnail to API', {
        modelId,
        versionId,
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
   * Upload PNG thumbnail file separately
   * @param {number} modelId - The model ID to upload PNG thumbnail for
   * @param {string} pngPath - Path to the PNG thumbnail file
   * @param {Object} metadata - Optional metadata about the thumbnail
   * @param {number} [versionId] - Optional version ID to upload for specific version
   * @returns {Promise<Object>} Upload result
   */
  async uploadPngThumbnail(modelId, pngPath, metadata = {}, versionId = null) {
    try {
      if (!fs.existsSync(pngPath)) {
        throw new Error(`PNG thumbnail file not found: ${pngPath}`)
      }

      const formData = new FormData()

      // Add the PNG file
      formData.append('file', fs.createReadStream(pngPath))

      // Add optional metadata
      if (metadata.width) {
        formData.append('width', metadata.width.toString())
      }
      if (metadata.height) {
        formData.append('height', metadata.height.toString())
      }

      // Construct upload URL with optional versionId parameter
      const uploadUrl = versionId
        ? `/models/${modelId}/thumbnail/png-upload?versionId=${versionId}`
        : `/models/${modelId}/thumbnail/png-upload`

      logger.info('Uploading PNG thumbnail to API', {
        modelId,
        versionId,
        pngPath,
        apiUrl: `${this.apiBaseUrl}${uploadUrl}`,
        metadata,
      })

      const response = await this.client.post(uploadUrl, formData, {
        headers: {
          ...formData.getHeaders(),
          'Content-Type': 'multipart/form-data',
        },
      })

      logger.info('PNG thumbnail uploaded successfully', {
        modelId,
        versionId,
        responseData: response.data,
      })

      return {
        success: true,
        data: response.data,
      }
    } catch (error) {
      logger.error('Failed to upload PNG thumbnail to API', {
        modelId,
        versionId,
        pngPath,
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
   * @param {number} [versionId] - Optional version ID to upload for specific version
   * @returns {Promise<Object>} Upload results
   */
  async uploadMultipleThumbnails(modelId, thumbnailPaths, versionId = null) {
    const results = {
      modelId,
      versionId,
      uploads: [],
      allSuccessful: true,
    }

    // Upload WebP thumbnail FIRST (primary animated thumbnail for frontend)
    if (thumbnailPaths.webpPath && fs.existsSync(thumbnailPaths.webpPath)) {
      try {
        const webpStats = fs.statSync(thumbnailPaths.webpPath)
        const result = await this.uploadThumbnail(
          modelId,
          thumbnailPaths.webpPath,
          {
            width: 256, // Default WebP dimensions
            height: 256,
          },
          versionId
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

    // Upload PNG thumbnail SEPARATELY via dedicated endpoint
    if (thumbnailPaths.pngPath && fs.existsSync(thumbnailPaths.pngPath)) {
      try {
        const pngStats = fs.statSync(thumbnailPaths.pngPath)
        const result = await this.uploadPngThumbnail(
          modelId,
          thumbnailPaths.pngPath,
          {
            width: 256, // Default PNG dimensions
            height: 256,
          },
          versionId
        )

        results.uploads.push({
          type: 'png',
          path: thumbnailPaths.pngPath,
          size: pngStats.size,
          ...result,
        })

        if (!result.success) {
          results.allSuccessful = false
        }
      } catch (error) {
        logger.error('Error processing PNG thumbnail', {
          modelId,
          path: thumbnailPaths.pngPath,
          error: error.message,
        })

        results.uploads.push({
          type: 'png',
          path: thumbnailPaths.pngPath,
          success: false,
          error: error.message,
        })

        results.allSuccessful = false
      }
    }

    // Upload poster thumbnail if available and PNG failed
    if (thumbnailPaths.posterPath && fs.existsSync(thumbnailPaths.posterPath)) {
      // Only upload poster if PNG upload failed or PNG doesn't exist
      const pngUpload = results.uploads.find(u => u.type === 'png')
      const shouldUploadPoster = !pngUpload || !pngUpload.success

      if (shouldUploadPoster) {
        try {
          const posterStats = fs.statSync(thumbnailPaths.posterPath)
          const result = await this.uploadThumbnail(
            modelId,
            thumbnailPaths.posterPath,
            {
              width: 256, // Default poster dimensions
              height: 256,
            },
            versionId
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
        logger.info('Skipping poster upload, PNG upload was successful', {
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
   * Upload a sound waveform thumbnail to the backend API
   * @param {number} soundId - The sound ID to upload waveform for
   * @param {string} waveformPath - Path to the waveform PNG file
   * @param {string} soundHash - Hash of the sound file for deduplication
   * @returns {Promise<Object>} Upload result with storagePath and sizeBytes
   */
  async uploadSoundWaveform(soundId, waveformPath, soundHash) {
    try {
      if (!fs.existsSync(waveformPath)) {
        throw new Error(`Waveform file not found: ${waveformPath}`)
      }

      const formData = new FormData()
      formData.append('file', fs.createReadStream(waveformPath))
      formData.append('soundHash', soundHash)

      const uploadUrl = `/sounds/${soundId}/waveform/upload`

      logger.info('Uploading waveform thumbnail to API', {
        soundId,
        soundHash,
        waveformPath,
        apiUrl: `${this.apiBaseUrl}${uploadUrl}`,
      })

      const response = await this.client.post(uploadUrl, formData, {
        headers: {
          ...formData.getHeaders(),
          'Content-Type': 'multipart/form-data',
        },
      })

      logger.info('Waveform thumbnail uploaded successfully', {
        soundId,
        responseData: response.data,
      })

      return {
        success: true,
        storagePath: response.data.storagePath,
        sizeBytes: response.data.sizeBytes,
      }
    } catch (error) {
      logger.error('Failed to upload waveform thumbnail to API', {
        soundId,
        soundHash,
        waveformPath,
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
