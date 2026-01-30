import fs from 'fs'
import path from 'path'
import os from 'os'
import { ThumbnailJobService } from './thumbnailJobService.js'
import logger from './logger.js'

/**
 * Service for fetching and managing sound files
 */
export class SoundFileService {
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
   * Fetch sound file for processing
   * @param {number} soundId - The sound ID
   * @returns {Promise<{filePath: string, fileType: string, originalFileName: string}>} File information
   */
  async fetchSoundFile(soundId) {
    logger.debug('Fetching sound file', { soundId })

    // Retry logic for race condition where file might not be immediately available after upload
    const maxRetries = 3
    const retryDelay = 1000 // 1 second

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Get file stream from API
        const response = await this.jobService.getSoundFile(soundId)

        if (!response || !response.data) {
          throw new Error('No file data received from API')
        }

        return await this.processFileResponse(response, soundId)
      } catch (error) {
        logger.warn('Failed to fetch sound file', {
          soundId,
          attempt,
          maxRetries,
          error: error.message,
        })

        // If it's the last attempt or not a "file not found" error, rethrow
        if (attempt === maxRetries || !this.isFileNotFoundError(error)) {
          throw error
        }

        // Wait before retrying
        logger.info('Retrying sound file fetch after delay', {
          soundId,
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
   * @param {number} soundId - Sound ID for error context
   * @returns {Promise<{filePath: string, fileType: string, originalFileName: string}>} File information
   */
  async processFileResponse(response, soundId) {
    // Extract file information from response headers
    const contentDisposition = response.headers['content-disposition'] || ''

    // Parse filename from content-disposition header
    let originalFileName = this.parseFilenameFromHeader(contentDisposition)
    if (!originalFileName) {
      originalFileName = `sound_${soundId}`
    }

    // Determine file extension and type
    const fileExtension = path.extname(originalFileName).toLowerCase()
    const fileType = this.getFileTypeFromExtension(fileExtension)

    if (!fileType) {
      throw new Error(`Unsupported sound file type: ${fileExtension}`)
    }

    logger.info('Processing sound file', {
      soundId,
      originalFileName,
      fileType,
      fileExtension,
    })

    // Save file to temporary directory
    const tempFilePath = path.join(
      this.tempDir,
      `sound_${soundId}_${Date.now()}${fileExtension}`
    )

    // Write file stream to disk
    await this.writeStreamToFile(response.data, tempFilePath)

    logger.info('Sound file saved to temporary location', {
      soundId,
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
   * Parse filename from Content-Disposition header
   * @param {string} headerValue - Content-Disposition header value
   * @returns {string|null} Extracted filename or null
   */
  parseFilenameFromHeader(headerValue) {
    if (!headerValue) {
      return null
    }

    // Try to extract filename from various formats
    // Format: filename="example.mp3"
    // Format: filename*=UTF-8''example.mp3
    const filenameMatch = headerValue.match(/filename\*?=['"]?([^'";]+)['"]?/i)
    if (filenameMatch && filenameMatch[1]) {
      return decodeURIComponent(filenameMatch[1])
    }

    return null
  }

  /**
   * Get file type from file extension
   * @param {string} extension - File extension (with dot)
   * @returns {string} File type
   */
  getFileTypeFromExtension(extension) {
    const audioExtensions = {
      '.mp3': 'audio/mpeg',
      '.wav': 'audio/wav',
      '.ogg': 'audio/ogg',
      '.flac': 'audio/flac',
      '.m4a': 'audio/mp4',
      '.aac': 'audio/aac',
      '.opus': 'audio/opus',
      '.weba': 'audio/webm',
    }

    return audioExtensions[extension.toLowerCase()] || null
  }

  /**
   * Write stream to file
   * @param {Stream} stream - Input stream
   * @param {string} outputPath - Output file path
   * @returns {Promise<void>}
   */
  async writeStreamToFile(stream, outputPath) {
    return new Promise((resolve, reject) => {
      const writer = fs.createWriteStream(outputPath)
      stream.pipe(writer)

      writer.on('finish', () => {
        logger.debug('Stream written to file successfully', { outputPath })
        resolve()
      })

      writer.on('error', err => {
        logger.error('Error writing stream to file', {
          outputPath,
          error: err.message,
        })
        reject(err)
      })
    })
  }

  /**
   * Check if error is a file not found error
   * @param {Error} error - Error to check
   * @returns {boolean} True if file not found error
   */
  isFileNotFoundError(error) {
    return (
      error.response &&
      (error.response.status === 404 || error.response.status === 410)
    )
  }

  /**
   * Sleep for specified milliseconds
   * @param {number} ms - Milliseconds to sleep
   * @returns {Promise<void>}
   */
  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  /**
   * Clean up temporary file
   * @param {string} filePath - Path to temporary file
   */
  cleanupFile(filePath) {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath)
        logger.debug('Cleaned up temporary sound file', { filePath })
      }
    } catch (error) {
      logger.warn('Failed to clean up temporary sound file', {
        filePath,
        error: error.message,
      })
    }
  }
}
