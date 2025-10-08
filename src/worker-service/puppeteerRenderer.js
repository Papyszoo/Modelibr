/* eslint-disable no-undef */
// Note: 'window' is used within page.evaluate() calls which run in browser context
import puppeteer from 'puppeteer'
import { config } from './config.js'
import logger from './logger.js'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

/**
 * Service for rendering orbit animation frames using Puppeteer with Three.js in browser
 */
export class PuppeteerRenderer {
  constructor() {
    this.browser = null
    this.page = null
  }

  /**
   * Initialize the Puppeteer browser and page
   */
  async initialize() {
    logger.info('Initializing Puppeteer renderer')

    try {
      // Determine executable path - use env var or try to find chrome/chromium
      const executablePath =
        process.env.PUPPETEER_EXECUTABLE_PATH ||
        process.env.CHROME_PATH ||
        process.env.CHROMIUM_PATH ||
        undefined // Let Puppeteer auto-detect if not specified

      const launchOptions = {
        headless: true,
        args: [
          // Sandbox flags - required in Docker/CI environments even with proper user setup
          // See: https://pptr.dev/troubleshooting#chrome-doesnt-launch-on-linux
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          // WebGL/GPU flags - enable WebGL with software rendering for headless mode
          '--use-gl=angle', // Use ANGLE for WebGL compatibility
          '--use-angle=swiftshader', // Use SwiftShader for software rendering
          '--enable-webgl', // Explicitly enable WebGL
          '--disable-extensions',
          '--disable-web-security', // Allow loading models from data URLs
          '--disable-features=IsolateOrigins,site-per-process',
          // Crash reporter flags - disable to prevent crashpad_handler errors
          '--disable-crash-reporter',
          '--disable-breakpad',
          '--disable-crashpad',
          '--no-crash-upload',
          '--disable-client-side-phishing-detection',
          '--disable-component-extensions-with-background-pages',
          '--crash-dumps-dir=/tmp',
        ],
        dumpio: config.logLevel === 'debug',
        // Set environment variables to completely disable crash reporting
        env: {
          ...process.env,
          CHROME_CRASHPAD_PIPE_NAME: '', // Disable crashpad pipe
          BREAKPAD_DISABLE: '1', // Legacy Breakpad disable
        },
      }

      // Add executable path if provided
      if (executablePath) {
        launchOptions.executablePath = executablePath
        logger.debug('Using custom Chrome/Chromium path', { executablePath })
      }

      // Launch browser with appropriate flags
      this.browser = await puppeteer.launch(launchOptions)

      this.page = await this.browser.newPage()

      // Set viewport to match output size
      await this.page.setViewport({
        width: config.rendering.outputWidth,
        height: config.rendering.outputHeight,
        deviceScaleFactor: 1,
      })

      // Load the rendering template
      const templatePath = path.join(__dirname, 'render-template.html')
      const templateUrl = `file://${templatePath}`

      logger.debug('Loading render template', { templatePath, templateUrl })
      await this.page.goto(templateUrl, { waitUntil: 'networkidle0' })

      // Wait for Three.js to be loaded
      await this.page.waitForFunction(() => window.THREE !== undefined, {
        timeout: 10000,
      })

      // Initialize the renderer in the page (async for WebGPU support)
      const initialized = await this.page.evaluate(
        async (width, height, bgColor) => {
          try {
            return await window.initRenderer(width, height, bgColor)
          } catch (error) {
            console.error('Failed to initialize renderer:', error)
            return false
          }
        },
        config.rendering.outputWidth,
        config.rendering.outputHeight,
        config.rendering.backgroundColor
      )

      if (!initialized) {
        const error = await this.page.evaluate(() => window.modelRenderer.error)
        throw new Error(
          `Failed to initialize renderer: ${error || 'Unknown error'}`
        )
      }

      logger.info('Puppeteer renderer initialized successfully', {
        width: config.rendering.outputWidth,
        height: config.rendering.outputHeight,
        backgroundColor: config.rendering.backgroundColor,
      })

      return true
    } catch (error) {
      logger.error('Failed to initialize Puppeteer renderer', {
        error: error.message,
        stack: error.stack,
      })
      await this.dispose()
      throw error
    }
  }

  /**
   * Load a model from file path
   * @param {string} filePath - Path to the model file
   * @param {string} fileType - Type of the file (obj, gltf, glb)
   * @returns {Promise<number>} Polygon count
   */
  async loadModel(filePath, fileType) {
    if (!this.page) {
      throw new Error('Renderer not initialized')
    }

    logger.debug('Loading model in browser', { filePath, fileType })

    try {
      // Read the file and convert to data URL
      const fileBuffer = fs.readFileSync(filePath)
      const base64Data = fileBuffer.toString('base64')
      const mimeType = this.getMimeType(fileType)
      const dataUrl = `data:${mimeType};base64,${base64Data}`

      // Load model in the browser
      const result = await this.page.evaluate(
        async (modelData, type) => {
          try {
            const model = await window.loadModelFromData(modelData, type)

            // Normalize and add to scene
            const normInfo = window.normalizeModel(model, 2.0)
            window.modelRenderer.model = model
            window.modelRenderer.scene.add(model)
            window.modelRenderer.isReady = true

            // Count polygons
            const polygonCount = window.countPolygons(model)

            return {
              success: true,
              polygonCount,
              modelSize: normInfo.size,
              maxDimension: normInfo.maxDimension,
            }
          } catch (error) {
            console.error('Model loading error:', error)
            return {
              success: false,
              error: error.message,
            }
          }
        },
        dataUrl,
        fileType
      )

      if (!result.success) {
        throw new Error(result.error || 'Failed to load model')
      }

      logger.info('Model loaded successfully in browser', {
        polygonCount: result.polygonCount,
        maxDimension: result.maxDimension,
      })

      return result.polygonCount
    } catch (error) {
      logger.error('Failed to load model', {
        error: error.message,
        filePath,
        fileType,
      })
      throw error
    }
  }

  /**
   * Render orbit frames for the loaded model
   * @param {Object} jobLogger - Logger with job context
   * @returns {Promise<Array>} Array of rendered frame data
   */
  async renderOrbitFrames(jobLogger) {
    if (!this.page) {
      throw new Error('Renderer not initialized')
    }

    const frames = []
    const startTime = Date.now()

    try {
      // Check if model is loaded
      const isReady = await this.page.evaluate(
        () => window.modelRenderer.isReady
      )
      if (!isReady) {
        throw new Error('No model loaded')
      }

      // Calculate frame count
      const angleRange = config.orbit.endAngle - config.orbit.startAngle
      const frameCount = Math.ceil(angleRange / config.orbit.angleStep)

      jobLogger.info('Starting orbit frame rendering with Puppeteer', {
        angleStep: config.orbit.angleStep,
        startAngle: config.orbit.startAngle,
        endAngle: config.orbit.endAngle,
        frameCount: frameCount,
        note: 'Camera distance calculated automatically based on model size',
      })

      // Render frames at each orbit angle
      for (let i = 0; i < frameCount; i++) {
        const angle = config.orbit.startAngle + i * config.orbit.angleStep
        const frameData = await this.renderFrame(angle, i)
        frames.push(frameData)

        // Log progress every 10 frames or at the end
        if ((i + 1) % 10 === 0 || i === frameCount - 1) {
          const memoryUsage = process.memoryUsage()
          jobLogger.info('Orbit rendering progress', {
            framesCompleted: i + 1,
            totalFrames: frameCount,
            currentAngle: angle,
            cameraDistance: frameData.cameraDistance,
            memoryUsageMB: Math.round(memoryUsage.heapUsed / 1024 / 1024),
            memoryTotalMB: Math.round(memoryUsage.heapTotal / 1024 / 1024),
          })
        }
      }

      const renderTime = Date.now() - startTime
      jobLogger.info('Orbit frame rendering completed with Puppeteer', {
        frameCount: frames.length,
        renderTimeMs: renderTime,
        averageTimePerFrameMs: Math.round(renderTime / frames.length),
        totalDataSizeKB: Math.round(
          frames.reduce((sum, f) => sum + f.size, 0) / 1024
        ),
      })

      return frames
    } catch (error) {
      jobLogger.error('Orbit frame rendering failed', {
        error: error.message,
        framesCompleted: frames.length,
      })
      throw error
    }
  }

  /**
   * Render a single frame at a specific angle
   * @param {number} angle - Camera angle in degrees
   * @param {number} frameIndex - Frame index for logging
   * @returns {Promise<Object>} Frame data object
   */
  async renderFrame(angle, frameIndex) {
    if (!this.page) {
      throw new Error('Renderer not initialized')
    }

    // Position camera and render in browser (async for WebGPU support)
    // positionCamera now automatically calculates distance and height based on model size
    const result = await this.page.evaluate(
      async (ang) => {
        try {
          // positionCamera now handles automatic distance/height calculation
          const calculatedDistance = window.positionCamera(ang)
          const rendered = await window.renderScene()

          if (!rendered) {
            return { success: false, error: 'Rendering failed' }
          }

          const dataUrl = window.getCanvasDataURL()
          if (!dataUrl) {
            return { success: false, error: 'Failed to get canvas data' }
          }

          return {
            success: true,
            dataUrl,
            calculatedDistance,
            cameraPosition: {
              x: window.modelRenderer.camera.position.x,
              y: window.modelRenderer.camera.position.y,
              z: window.modelRenderer.camera.position.z,
            },
          }
        } catch (error) {
          console.error('Render error:', error)
          return { success: false, error: error.message }
        }
      },
      angle
    )

    if (!result.success) {
      throw new Error(result.error || 'Failed to render frame')
    }

    // Convert data URL to buffer
    const base64Data = result.dataUrl.replace(/^data:image\/\w+;base64,/, '')
    const buffer = Buffer.from(base64Data, 'base64')

    const frameData = {
      index: frameIndex,
      angle: angle,
      width: config.rendering.outputWidth,
      height: config.rendering.outputHeight,
      pixels: buffer,
      size: buffer.length,
      timestamp: Date.now(),
      cameraPosition: result.cameraPosition,
      cameraDistance: result.calculatedDistance,
      simulated: false,
      renderSettings: {
        backgroundColor: config.rendering.backgroundColor,
        antialiasing: config.rendering.enableAntialiasing,
      },
    }

    logger.debug('Frame rendered with Puppeteer', {
      frameIndex,
      angle,
      dataSize: buffer.length,
      cameraPos: result.cameraPosition,
      cameraDistance: result.calculatedDistance,
    })

    return frameData
  }

  /**
   * Calculate optimal camera distance based on model bounds
   * @returns {Promise<number>} Optimal camera distance
   */
  async calculateOptimalCameraDistance() {
    if (!this.page) {
      throw new Error('Renderer not initialized')
    }

    const distance = await this.page.evaluate(baseDistance => {
      if (!window.modelRenderer.model) {
        return baseDistance
      }

      const box = new window.THREE.Box3().setFromObject(
        window.modelRenderer.model
      )
      const size = box.getSize(new window.THREE.Vector3())
      const maxDimension = Math.max(size.x, size.y, size.z)

      const calculatedDistance = baseDistance * (maxDimension / 2)
      return Math.max(calculatedDistance, baseDistance)
    }, config.rendering.cameraDistance)

    logger.debug('Camera distance calculated', {
      baseDistance: config.rendering.cameraDistance,
      calculatedDistance: distance,
    })

    return distance
  }

  /**
   * Get memory usage statistics for rendered frames
   * @param {Array} frames - Array of frame data
   * @returns {Object} Memory usage statistics
   */
  getMemoryStats(frames) {
    const totalBytes = frames.reduce((sum, frame) => sum + frame.size, 0)
    const averageFrameSize = frames.length > 0 ? totalBytes / frames.length : 0

    return {
      frameCount: frames.length,
      totalSizeBytes: totalBytes,
      totalSizeMB: Math.round((totalBytes / 1024 / 1024) * 100) / 100,
      averageFrameSizeKB: Math.round((averageFrameSize / 1024) * 100) / 100,
      processMemoryUsage: process.memoryUsage(),
    }
  }

  /**
   * Get MIME type for file type
   * @param {string} fileType - File extension
   * @returns {string} MIME type
   */
  getMimeType(fileType) {
    const mimeTypes = {
      obj: 'text/plain',
      gltf: 'model/gltf+json',
      glb: 'model/gltf-binary',
    }
    return mimeTypes[fileType.toLowerCase()] || 'application/octet-stream'
  }

  /**
   * Clean up resources
   */
  async dispose() {
    logger.debug('Disposing Puppeteer renderer')

    try {
      if (this.page) {
        await this.page.close()
        this.page = null
      }

      if (this.browser) {
        await this.browser.close()
        this.browser = null
      }

      logger.debug('Puppeteer renderer disposed')
    } catch (error) {
      logger.error('Error disposing Puppeteer renderer', {
        error: error.message,
      })
    }
  }
}
