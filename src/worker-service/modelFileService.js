import fs from 'fs'
import path from 'path'
import os from 'os'
import { ThumbnailJobService } from './thumbnailJobService.js'
import logger from './logger.js'

/**
 * Service for fetching and managing model files
 */
export class ModelFileService {
  constructor() {
    this.jobService = new ThumbnailJobService()
    this.tempDir = path.join(os.tmpdir(), 'modelibr-worker')
    this.ensureTempDirectory()
  }

  /**
   * Ensure temporary directory exists
   */
  ensureTempDirectory() {
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true })
      logger.debug('Created temporary directory', { tempDir: this.tempDir })
    }
  }

  /**
   * Fetch model file for processing
   * @param {number} modelId - The model ID
   * @returns {Promise<{filePath: string, fileType: string, originalFileName: string}>} File information
   */
  async fetchModelFile(modelId) {
    logger.debug('Fetching model file', { modelId })

    // Retry logic for race condition where file might not be immediately available after upload
    const maxRetries = 3
    const retryDelay = 1000 // 1 second

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Get file stream from API
        const response = await this.jobService.getModelFile(modelId)

        if (!response || !response.data) {
          throw new Error('No file data received from API')
        }

        return await this.processFileResponse(response, modelId)
      } catch (error) {
        logger.warn('Failed to fetch model file', {
          modelId,
          attempt,
          maxRetries,
          error: error.message,
        })

        // If it's the last attempt or not a "file not found" error, rethrow
        if (attempt === maxRetries || !this.isFileNotFoundError(error)) {
          throw error
        }

        // Wait before retrying
        logger.info('Retrying model file fetch after delay', {
          modelId,
          attempt,
          retryDelayMs: retryDelay,
        })
        await this.sleep(retryDelay)
      }
    }
  }

  /**
   * Process the file response from API
   * @param {Object} response - API response
   * @param {number} modelId - Model ID for error context
   * @returns {Promise<{filePath: string, fileType: string, originalFileName: string}>} File information
   */
  async processFileResponse(response, modelId) {

    // Extract file information from response headers
    const contentDisposition = response.headers['content-disposition'] || ''
    const _contentType =
      response.headers['content-type'] || 'application/octet-stream'

    // Parse filename from content-disposition header
    let originalFileName = this.parseFilenameFromHeader(contentDisposition)
    if (!originalFileName) {
      originalFileName = `model_${modelId}`
    }

    // Determine file extension and type
    const fileExtension = path.extname(originalFileName).toLowerCase()
    const fileType = this.getFileTypeFromExtension(fileExtension)

    if (!fileType) {
      throw new Error(`Unsupported file type: ${fileExtension}`)
    }

    // Create temporary file
    const tempFileName = `${modelId}_${Date.now()}${fileExtension}`
    const tempFilePath = path.join(this.tempDir, tempFileName)

    // Write stream to temporary file
    await this.writeStreamToFile(response.data, tempFilePath)

    logger.info('Model file fetched successfully', {
      modelId,
      originalFileName,
      fileType,
      tempFilePath,
      fileSize: fs.statSync(tempFilePath).size,
    })

    return {
      filePath: tempFilePath,
      fileType,
      originalFileName,
    }
  }

  /**
   * Check if error is related to file not being found (race condition)
   * @param {Error} error - The error to check
   * @returns {boolean} True if it's a file not found error
   */
  isFileNotFoundError(error) {
    const message = error.message.toLowerCase()
    return message.includes('not found') || 
           message.includes('404') ||
           error.response?.status === 404
  }

  /**
   * Sleep utility for retry delays
   * @param {number} ms - Milliseconds to sleep
   * @returns {Promise<void>}
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  /**
   * Clean up temporary file
   * @param {string} filePath - Path to temporary file
   */
  async cleanupFile(filePath) {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath)
        logger.debug('Cleaned up temporary file', { filePath })
      }
    } catch (error) {
      logger.warn('Failed to cleanup temporary file', {
        filePath,
        error: error.message,
      })
    }
  }

  /**
   * Write stream to file
   * @param {ReadableStream} stream - Input stream
   * @param {string} filePath - Output file path
   * @returns {Promise<void>}
   */
  async writeStreamToFile(stream, filePath) {
    return new Promise((resolve, reject) => {
      const writeStream = fs.createWriteStream(filePath)

      stream.pipe(writeStream)

      writeStream.on('finish', () => {
        resolve()
      })

      writeStream.on('error', error => {
        reject(new Error(`Failed to write file: ${error.message}`))
      })

      stream.on('error', error => {
        reject(new Error(`Stream error: ${error.message}`))
      })
    })
  }

  /**
   * Parse filename from Content-Disposition header
   * @param {string} contentDisposition - Content-Disposition header value
   * @returns {string|null} Parsed filename or null
   */
  parseFilenameFromHeader(contentDisposition) {
    if (!contentDisposition) return null

    // Try different patterns to extract filename
    const patterns = [
      /filename\*=UTF-8''([^;]+)/,
      /filename="([^"]+)"/,
      /filename=([^;]+)/,
    ]

    for (const pattern of patterns) {
      const match = contentDisposition.match(pattern)
      if (match) {
        let filename = match[1]
        // Decode URI component if needed
        try {
          filename = decodeURIComponent(filename)
        } catch {
          // Keep original if decode fails
        }
        return filename.trim()
      }
    }

    return null
  }

  /**
   * Get file type from extension
   * @param {string} extension - File extension (with dot)
   * @returns {string|null} File type or null if unsupported
   */
  getFileTypeFromExtension(extension) {
    const supportedTypes = {
      '.obj': 'obj',
      '.gltf': 'gltf',
      '.glb': 'glb',
    }

    return supportedTypes[extension.toLowerCase()] || null
  }

  /**
   * Clean up all temporary files older than specified age
   * @param {number} maxAgeMs - Maximum age in milliseconds (default: 1 hour)
   */
  async cleanupOldFiles(maxAgeMs = 60 * 60 * 1000) {
    try {
      if (!fs.existsSync(this.tempDir)) return

      const files = fs.readdirSync(this.tempDir)
      const now = Date.now()
      let cleanedCount = 0

      for (const file of files) {
        const filePath = path.join(this.tempDir, file)
        const stats = fs.statSync(filePath)

        if (now - stats.mtime.getTime() > maxAgeMs) {
          await this.cleanupFile(filePath)
          cleanedCount++
        }
      }

      if (cleanedCount > 0) {
        logger.info('Cleaned up old temporary files', {
          cleanedCount,
          tempDir: this.tempDir,
        })
      }
    } catch (error) {
      logger.warn('Failed to cleanup old files', {
        error: error.message,
        tempDir: this.tempDir,
      })
    }
  }
}
