import fs from 'fs'
import path from 'path'
import os from 'os'
import sharp from 'sharp'
import { config } from './config.js'
import logger from './logger.js'

/**
 * Service for encoding orbit frames into static WebP thumbnail and poster images
 * Simplified version using sharp only (no ffmpeg dependency)
 */
export class FrameEncoderService {
  constructor() {
    this.tempDir = path.join(os.tmpdir(), 'modelibr-frame-encoder')
    this.ensureTempDirectory()
  }

  /**
   * Ensure temporary directory exists
   */
  ensureTempDirectory() {
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true })
      logger.debug('Created frame encoder temporary directory', {
        tempDir: this.tempDir,
      })
    }
  }

  /**
   * Encode orbit frames into static WebP thumbnail and poster image
   * Uses the middle frame as the representative image
   * @param {Array} frames - Array of rendered frame data
   * @param {Object} jobLogger - Logger with job context
   * @returns {Promise<Object>} Encoding result with file paths and metadata
   */
  async encodeFrames(frames, jobLogger) {
    const startTime = Date.now()
    const jobId = Date.now().toString(36) + Math.random().toString(36).substr(2)
    const workingDir = path.join(this.tempDir, `job-${jobId}`)

    try {
      // Create job-specific working directory
      fs.mkdirSync(workingDir, { recursive: true })

      jobLogger.info('Starting frame encoding (static WebP)', {
        frameCount: frames.length,
        workingDir,
        targetFormat: 'webp',
      })

      if (frames.length === 0) {
        throw new Error('No frames to encode')
      }

      // Select middle frame as representative image
      const middleFrameIndex = Math.floor(frames.length / 2)
      const representativeFrame = frames[middleFrameIndex]

      jobLogger.info('Using middle frame for thumbnail', {
        frameIndex: middleFrameIndex,
        totalFrames: frames.length,
        angle: representativeFrame.angle,
      })

      // Step 1: Create WebP thumbnail from representative frame
      const webpPath = await this.createStaticWebP(
        representativeFrame,
        workingDir,
        jobLogger
      )

      // Step 2: Create poster frame (JPG) from same frame
      const posterPath = await this.createPosterFrame(
        representativeFrame,
        workingDir,
        jobLogger
      )

      const encodeTime = Date.now() - startTime

      jobLogger.info('Frame encoding completed', {
        webpPath,
        posterPath,
        encodeTimeMs: encodeTime,
        representativeFrameIndex: middleFrameIndex,
      })

      return {
        webpPath,
        posterPath,
        frameCount: frames.length,
        representativeFrameIndex: middleFrameIndex,
        encodeTimeMs: encodeTime,
      }
    } catch (error) {
      jobLogger.error('Frame encoding failed', {
        error: error.message,
        stack: error.stack,
      })
      throw error
    } finally {
      // Cleanup will be done by periodic cleanup task
    }
  }

  /**
   * Create static WebP from a single frame using Sharp
   * @param {Object} frame - Frame data with pixels buffer
   * @param {string} workingDir - Working directory
   * @param {Object} jobLogger - Logger with job context
   * @returns {Promise<string>} Path to created WebP file
   */
  async createStaticWebP(frame, workingDir, jobLogger) {
    const webpPath = path.join(workingDir, 'thumbnail.webp')
    const quality = config.encoding?.webpQuality || 75

    jobLogger.info('Creating static WebP thumbnail', {
      quality,
      width: frame.width,
      height: frame.height,
      outputPath: webpPath,
    })

    try {
      // Frame pixels are already PNG data from Puppeteer's canvas.toDataURL
      // So we can directly process them
      await sharp(frame.pixels).webp({ quality }).toFile(webpPath)

      const stats = fs.statSync(webpPath)
      jobLogger.info('WebP thumbnail created successfully', {
        sizeBytes: stats.size,
        sizeMB: (stats.size / 1024 / 1024).toFixed(2),
      })

      return webpPath
    } catch (error) {
      jobLogger.error('Failed to create WebP thumbnail', {
        error: error.message,
      })
      throw error
    }
  }

  /**
   * Create poster frame (JPG) from a single frame
   * @param {Object} frame - Frame data with pixels buffer
   * @param {string} workingDir - Working directory
   * @param {Object} jobLogger - Logger with job context
   * @returns {Promise<string>} Path to created JPG file
   */
  async createPosterFrame(frame, workingDir, jobLogger) {
    const posterPath = path.join(workingDir, 'poster.jpg')
    const quality = config.encoding?.jpegQuality || 85

    jobLogger.info('Creating poster frame (JPEG)', {
      quality,
      width: frame.width,
      height: frame.height,
      outputPath: posterPath,
    })

    try {
      await sharp(frame.pixels).jpeg({ quality }).toFile(posterPath)

      const stats = fs.statSync(posterPath)
      jobLogger.info('Poster frame created successfully', {
        sizeBytes: stats.size,
        sizeMB: (stats.size / 1024 / 1024).toFixed(2),
      })

      return posterPath
    } catch (error) {
      jobLogger.error('Failed to create poster frame', {
        error: error.message,
      })
      throw error
    }
  }

  /**
   * Clean up temporary files and directories
   * @param {string} workingDir - Directory to clean up
   */
  async cleanupDirectory(workingDir) {
    try {
      if (fs.existsSync(workingDir)) {
        fs.rmSync(workingDir, { recursive: true, force: true })
        logger.debug('Cleaned up working directory', { workingDir })
      }
    } catch (error) {
      logger.warn('Failed to cleanup working directory', {
        workingDir,
        error: error.message,
      })
    }
  }

  /**
   * Clean up specific encoding result files
   * @param {Object} encodingResult - Result from encodeFrames
   */
  async cleanupEncodingResult(encodingResult) {
    if (encodingResult && encodingResult.workingDir) {
      await this.cleanupDirectory(encodingResult.workingDir)
    }
  }

  /**
   * Clean up old temporary directories
   * @param {number} maxAgeMs - Maximum age in milliseconds (default: 2 hours)
   */
  async cleanupOldFiles(maxAgeMs = 2 * 60 * 60 * 1000) {
    try {
      if (!fs.existsSync(this.tempDir)) {
        return
      }

      const entries = fs.readdirSync(this.tempDir, { withFileTypes: true })
      const now = Date.now()
      let cleanedCount = 0

      for (const entry of entries) {
        if (entry.isDirectory() && entry.name.startsWith('job-')) {
          const dirPath = path.join(this.tempDir, entry.name)
          const stats = fs.statSync(dirPath)
          const age = now - stats.mtime.getTime()

          if (age > maxAgeMs) {
            fs.rmSync(dirPath, { recursive: true, force: true })
            cleanedCount++
          }
        }
      }

      if (cleanedCount > 0) {
        logger.info('Cleaned up old frame encoder directories', {
          cleanedCount,
          maxAgeMs,
          tempDir: this.tempDir,
        })
      }
    } catch (error) {
      logger.warn('Failed to cleanup old frame encoder files', {
        error: error.message,
        tempDir: this.tempDir,
      })
    }
  }
}
