import fs from 'fs'
import path from 'path'
import os from 'os'
import ffmpeg from 'fluent-ffmpeg'
import sharp from 'sharp'
import { config } from './config.js'
import logger from './logger.js'

/**
 * Service for encoding orbit frames into animated WebP and poster images
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
   * Encode orbit frames into animated WebP and poster image
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

      jobLogger.info('Starting frame encoding', {
        frameCount: frames.length,
        workingDir,
        targetFormat: 'webp',
      })

      // Step 1: Convert frames to temporary PNG files
      const pngFiles = await this.framesToPNG(frames, workingDir, jobLogger)

      // Step 2: Create animated WebP from PNG sequence
      const webpPath = await this.createAnimatedWebP(
        pngFiles,
        workingDir,
        jobLogger
      )

      // Step 3: Extract poster frame (first frame as JPG)
      const posterPath = await this.createPosterFrame(
        pngFiles[0],
        workingDir,
        jobLogger
      )

      const encodeTime = Date.now() - startTime

      jobLogger.info('Frame encoding completed successfully', {
        encodeTimeMs: encodeTime,
        webpPath,
        posterPath,
        frameCount: frames.length,
      })

      return {
        webpPath,
        posterPath,
        tempFiles: pngFiles,
        workingDir,
        encodeTimeMs: encodeTime,
        frameCount: frames.length,
      }
    } catch (error) {
      jobLogger.error('Frame encoding failed', {
        error: error.message,
        frameCount: frames.length,
        workingDir,
      })

      // Clean up on error
      await this.cleanupDirectory(workingDir)
      throw error
    }
  }

  /**
   * Convert frame data to PNG files
   * @param {Array} frames - Array of frame data
   * @param {string} workingDir - Working directory for temp files
   * @param {Object} jobLogger - Logger with job context
   * @returns {Promise<Array>} Array of PNG file paths
   */
  async framesToPNG(frames, workingDir, jobLogger) {
    const pngFiles = []

    jobLogger.info('Converting frames to PNG files', {
      frameCount: frames.length,
    })

    for (let i = 0; i < frames.length; i++) {
      const frame = frames[i]
      const fileName = `frame_${String(i).padStart(4, '0')}.png`
      const filePath = path.join(workingDir, fileName)

      // Check if frame has actual pixel data
      if (frame.pixels && frame.pixels.length > 0) {
        // Convert RGBA buffer to PNG using Sharp
        await sharp(frame.pixels, {
          raw: {
            width: frame.width,
            height: frame.height,
            channels: 4, // RGBA
          },
        })
          .png()
          .toFile(filePath)
      } else {
        // If no pixel data, fail with error instead of creating placeholder
        throw new Error(
          `Frame ${i} has no pixel data - cannot generate thumbnail without actual rendering`
        )
      }

      pngFiles.push(filePath)

      // Log progress every 10 frames
      if ((i + 1) % 10 === 0 || i === frames.length - 1) {
        jobLogger.debug('PNG conversion progress', {
          framesCompleted: i + 1,
          totalFrames: frames.length,
        })
      }
    }

    return pngFiles
  }

  /**
   * Create animated WebP from PNG sequence using FFmpeg
   * @param {Array} pngFiles - Array of PNG file paths
   * @param {string} workingDir - Working directory
   * @param {Object} jobLogger - Logger with job context
   * @returns {Promise<string>} Path to created WebP file
   */
  async createAnimatedWebP(pngFiles, workingDir, jobLogger) {
    const webpPath = path.join(workingDir, 'animation.webp')
    const framerate = config.encoding?.framerate || 10 // frames per second
    const quality = config.encoding?.webpQuality || 75 // WebP quality

    jobLogger.info('Creating animated WebP', {
      inputFrames: pngFiles.length,
      framerate,
      quality,
      outputPath: webpPath,
    })

    return new Promise((resolve, reject) => {
      // Create input file list for FFmpeg
      const inputPattern = path.join(workingDir, 'frame_%04d.png')

      ffmpeg()
        .input(inputPattern)
        .inputFPS(framerate)
        .outputOptions([
          '-c:v libwebp',
          '-lossless 0',
          `-quality ${quality}`,
          '-method 6', // Better compression
          '-loop 0', // Infinite loop
          '-preset photo',
        ])
        .output(webpPath)
        .on('start', commandLine => {
          jobLogger.debug('FFmpeg command started', { commandLine })
        })
        .on('progress', progress => {
          if (progress.percent) {
            jobLogger.debug('WebP encoding progress', {
              percent: Math.round(progress.percent),
              fps: progress.currentFps,
              frames: progress.frames,
            })
          }
        })
        .on('end', () => {
          jobLogger.info('Animated WebP created successfully', {
            outputPath: webpPath,
            sizeBytes: fs.existsSync(webpPath) ? fs.statSync(webpPath).size : 0,
          })
          resolve(webpPath)
        })
        .on('error', error => {
          jobLogger.error('WebP encoding failed', {
            error: error.message,
            inputPattern,
            outputPath: webpPath,
          })
          reject(error)
        })
        .run()
    })
  }

  /**
   * Create poster frame (first frame as JPG)
   * @param {string} firstPngPath - Path to first PNG frame
   * @param {string} workingDir - Working directory
   * @param {Object} jobLogger - Logger with job context
   * @returns {Promise<string>} Path to created poster JPG
   */
  async createPosterFrame(firstPngPath, workingDir, jobLogger) {
    const posterPath = path.join(workingDir, 'poster.jpg')
    const quality = config.encoding?.jpegQuality || 85 // JPEG quality

    jobLogger.info('Creating poster frame', {
      inputPath: firstPngPath,
      outputPath: posterPath,
      quality,
    })

    try {
      await sharp(firstPngPath)
        .jpeg({
          quality: quality,
          progressive: true,
          mozjpeg: true,
        })
        .toFile(posterPath)

      const posterSize = fs.statSync(posterPath).size

      jobLogger.info('Poster frame created successfully', {
        outputPath: posterPath,
        sizeBytes: posterSize,
      })

      return posterPath
    } catch (error) {
      jobLogger.error('Poster frame creation failed', {
        error: error.message,
        inputPath: firstPngPath,
        outputPath: posterPath,
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
