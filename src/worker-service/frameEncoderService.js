import fs from 'fs'
import path from 'path'
import os from 'os'
import sharp from 'sharp'
import webpmux from 'node-webpmux'
import { config } from './config.js'
import logger from './logger.js'

/**
 * Service for encoding orbit frames into animated WebP thumbnail and poster images
 * Uses sharp for image processing and node-webpmux for animation creation
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
   * Encode orbit frames into animated WebP thumbnail and poster image
   * Creates a looping animation from all frames
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

      jobLogger.info('Starting frame encoding (animated WebP)', {
        frameCount: frames.length,
        workingDir,
        targetFormat: 'animated-webp',
        framerate: config.encoding.framerate,
      })

      if (frames.length === 0) {
        throw new Error('No frames to encode')
      }

      // Step 1: Create animated WebP from all frames
      const webpPath = await this.createAnimatedWebP(
        frames,
        workingDir,
        jobLogger
      )

      // Step 2: Create poster frame (JPG) from middle frame for fallback/preview
      const middleFrameIndex = Math.floor(frames.length / 2)
      const representativeFrame = frames[middleFrameIndex]
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
        frameCount: frames.length,
        isAnimated: true,
      })

      return {
        webpPath,
        posterPath,
        frameCount: frames.length,
        representativeFrameIndex: middleFrameIndex,
        encodeTimeMs: encodeTime,
        isAnimated: true,
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
   * Create animated WebP from multiple frames using node-webpmux
   * @param {Array} frames - Array of frame data with pixels buffers
   * @param {string} workingDir - Working directory
   * @param {Object} jobLogger - Logger with job context
   * @returns {Promise<string>} Path to created animated WebP file
   */
  async createAnimatedWebP(frames, workingDir, jobLogger) {
    const webpPath = path.join(workingDir, 'thumbnail.webp')
    const quality = config.encoding?.webpQuality || 75
    const framerate = config.encoding?.framerate || 10
    const frameDuration = Math.round(1000 / framerate) // Duration in ms per frame

    jobLogger.info('Creating animated WebP thumbnail', {
      quality,
      framerate,
      frameDuration,
      frameCount: frames.length,
      width: frames[0].width,
      height: frames[0].height,
      outputPath: webpPath,
    })

    try {
      // Create frames array for the animation
      const webpFrames = []

      // Convert each frame to WebP and add to frames array
      for (let i = 0; i < frames.length; i++) {
        const frame = frames[i]

        // Convert PNG buffer to WebP buffer using sharp
        const webpBuffer = await sharp(frame.pixels)
          .webp({ quality })
          .toBuffer()

        // Generate frame with delay
        const webpFrame = await webpmux.Image.generateFrame({
          buffer: webpBuffer,
          delay: frameDuration,
        })

        webpFrames.push(webpFrame)

        // Log progress for large animations
        if (frames.length > 20 && (i + 1) % 10 === 0) {
          jobLogger.info('Animation encoding progress', {
            framesProcessed: i + 1,
            totalFrames: frames.length,
          })
        }
      }

      // Create animated WebP using instance methods
      const img = new webpmux.Image()
      
      // Initialize the library
      await img.initLib()
      
      // Load the first frame as the base image
      const firstFrameBuffer = await sharp(frames[0].pixels)
        .webp({ quality })
        .toBuffer()
      await img.load(firstFrameBuffer)
      
      // Convert to animation
      img.convertToAnim()
      
      // Set animation properties
      img.anim.bgColor = [255, 255, 255, 255] // White background (RGBA)
      img.anim.loops = 0 // 0 = infinite loop
      
      // Add all frames (the first frame from load is replaced by pushing all frames)
      for (const frame of webpFrames) {
        img.frames.push(frame)
      }
      
      // Save the animated WebP
      await img.save(webpPath)

      const stats = fs.statSync(webpPath)
      jobLogger.info('Animated WebP thumbnail created successfully', {
        sizeBytes: stats.size,
        sizeMB: (stats.size / 1024 / 1024).toFixed(2),
        frameCount: frames.length,
        frameDuration,
      })

      return webpPath
    } catch (error) {
      jobLogger.error('Failed to create animated WebP thumbnail', {
        error: error.message,
        stack: error.stack,
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
