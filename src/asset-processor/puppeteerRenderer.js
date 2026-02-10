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
   * @param {string} fileType - Type of the file (obj, fbx, gltf, glb)
   * @returns {Promise<number>} Polygon count
   */
  async loadModel(filePath, fileType) {
    // Check if page exists and is still connected
    if (!this.page || this.page.isClosed()) {
      logger.warn('Renderer page is not available, reinitializing')
      // Close existing browser if it exists
      if (this.browser) {
        try {
          await this.browser.close()
        } catch (e) {
          logger.debug('Error closing browser during reinit', {
            error: e.message,
          })
        }
        this.browser = null
      }
      this.page = null

      // Reinitialize
      try {
        await this.initialize()
        logger.info('Renderer reinitialized successfully')
      } catch (initError) {
        logger.error('Failed to reinitialize renderer', {
          error: initError.message,
        })
        throw new Error('Renderer not initialized and reinitialize failed')
      }
    }

    logger.debug('Loading model in browser', { filePath, fileType })

    try {
      // Clear any previously loaded model from the scene
      try {
        const cleared = await this.page.evaluate(() => {
          if (typeof window.clearScene === 'function') {
            return window.clearScene()
          }
          return false
        })

        if (cleared) {
          logger.debug('Previous model cleared from scene')
        }
      } catch (clearError) {
        logger.warn('Failed to clear previous scene, continuing anyway', {
          error: clearError.message,
        })
        // Continue even if clearing fails - the new model will still load
      }

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
            // Add the container (which holds the model) to the scene
            window.modelRenderer.scene.add(window.modelRenderer.modelContainer)
            window.modelRenderer.isReady = true

            // Count polygons
            const polygonCount = window.countPolygons(model)

            return {
              success: true,
              polygonCount,
              modelSize: normInfo.size,
              maxDimension: normInfo.maxDimension,
              boundingSphereRadius: normInfo.boundingSphereRadius,
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
        boundingSphereRadius: result.boundingSphereRadius,
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
   * Apply textures to the loaded model
   * @param {Object} texturePaths - Map of texture types to texture info {filePath, sourceChannel}
   * @param {string} fileType - Model file type (gltf, glb, obj, fbx) for flipY setting
   * @returns {Promise<boolean>} Success status
   */
  async applyTextures(texturePaths, fileType = 'gltf') {
    if (!texturePaths || Object.keys(texturePaths).length === 0) {
      logger.info('No textures to apply')
      return true
    }

    // Determine flipY based on file type
    // GLTF/GLB expect flipY=false, OBJ/FBX expect flipY=true
    const flipY = fileType === 'gltf' || fileType === 'glb' ? false : true

    logger.info('Applying textures to model', {
      textureTypes: Object.keys(texturePaths),
      fileType,
      flipY,
    })

    try {
      // Read texture files and convert to base64 data URLs with channel info
      const textureData = {}
      for (const [textureType, textureInfo] of Object.entries(texturePaths)) {
        try {
          // Handle both new {filePath, sourceChannel} objects and legacy plain strings
          const filePath =
            typeof textureInfo === 'string' ? textureInfo : textureInfo.filePath
          const sourceChannel =
            typeof textureInfo === 'string'
              ? 0
              : (textureInfo.sourceChannel ?? 0)

          const fileBuffer = fs.readFileSync(filePath)
          const base64Data = fileBuffer.toString('base64')
          // Detect image format from file extension
          const ext = path.extname(filePath).toLowerCase()
          const mimeType = ext === '.png' ? 'image/png' : 'image/jpeg'
          textureData[textureType] = {
            dataUrl: `data:${mimeType};base64,${base64Data}`,
            sourceChannel, // 0=RGB, 1=R, 2=G, 3=B, 4=A
          }
          logger.debug('Prepared texture data', {
            textureType,
            filePath,
            sourceChannel,
            dataUrlLength: textureData[textureType].dataUrl.length,
          })
        } catch (error) {
          logger.warn('Failed to read texture file, skipping', {
            textureType,
            error: error.message,
          })
        }
      }

      // Apply textures in the browser with channel extraction
      const result = await this.page.evaluate(
        async (textures, shouldFlipY) => {
          try {
            if (!window.modelRenderer.model) {
              return { success: false, error: 'No model loaded' }
            }

            const THREE = window.THREE
            const model = window.modelRenderer.model
            const renderer = window.modelRenderer.renderer
            const textureLoader = new THREE.TextureLoader()

            // Map texture type enum values to material properties
            const textureTypeMap = {
              1: 'map', // Albedo
              2: 'normalMap',
              3: 'displacementMap',
              4: 'aoMap',
              5: 'roughnessMap',
              6: 'metalnessMap',
              7: 'map', // Diffuse (legacy)
              8: 'specularMap',
              9: 'emissiveMap', // Emissive
              Albedo: 'map',
              Normal: 'normalMap',
              Height: 'displacementMap',
              AO: 'aoMap',
              Roughness: 'roughnessMap',
              Metallic: 'metalnessMap',
              Diffuse: 'map',
              Specular: 'specularMap',
              BaseColor: 'map',
              AmbientOcclusion: 'aoMap',
              Emissive: 'emissiveMap',
            }

            // Channel extraction shader
            const extractChannelShader = {
              vertexShader: `
                varying vec2 vUv;
                void main() {
                  vUv = uv;
                  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
              `,
              fragmentShader: `
                uniform sampler2D sourceTexture;
                uniform int channel; // 1=R, 2=G, 3=B, 4=A
                varying vec2 vUv;
                void main() {
                  vec4 texColor = texture2D(sourceTexture, vUv);
                  float value;
                  if (channel == 1) value = texColor.r;
                  else if (channel == 2) value = texColor.g;
                  else if (channel == 3) value = texColor.b;
                  else if (channel == 4) value = texColor.a;
                  else value = texColor.r; // Default to R
                  gl_FragColor = vec4(value, value, value, 1.0);
                }
              `,
            }

            // Function to extract a single channel to grayscale texture
            function extractChannel(sourceTexture, channelIndex) {
              const size = 512 // Output texture size
              const renderTarget = new THREE.WebGLRenderTarget(size, size, {
                minFilter: THREE.LinearFilter,
                magFilter: THREE.LinearFilter,
                format: THREE.RGBAFormat,
              })

              const scene = new THREE.Scene()
              const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10)
              camera.position.z = 1

              const material = new THREE.ShaderMaterial({
                uniforms: {
                  sourceTexture: { value: sourceTexture },
                  channel: { value: channelIndex },
                },
                vertexShader: extractChannelShader.vertexShader,
                fragmentShader: extractChannelShader.fragmentShader,
              })

              const geometry = new THREE.PlaneGeometry(2, 2)
              const mesh = new THREE.Mesh(geometry, material)
              scene.add(mesh)

              renderer.setRenderTarget(renderTarget)
              renderer.render(scene, camera)
              renderer.setRenderTarget(null)

              const extractedTexture = renderTarget.texture
              extractedTexture.wrapS = sourceTexture.wrapS
              extractedTexture.wrapT = sourceTexture.wrapT
              extractedTexture.flipY = sourceTexture.flipY
              extractedTexture.needsUpdate = true

              // Cleanup
              geometry.dispose()
              material.dispose()

              return extractedTexture
            }

            // Load texture with proper flipY
            const loadTexture = (url, flip) => {
              return new Promise((resolve, reject) => {
                textureLoader.load(
                  url,
                  texture => {
                    texture.flipY = flip
                    texture.colorSpace = THREE.SRGBColorSpace
                    resolve(texture)
                  },
                  undefined,
                  error => reject(error)
                )
              })
            }

            const loadedTextures = {}
            for (const [type, data] of Object.entries(textures)) {
              try {
                let texture = await loadTexture(data.dataUrl, shouldFlipY)
                const sourceChannel = data.sourceChannel

                // Extract channel if not RGB (0)
                if (sourceChannel > 0 && sourceChannel <= 4) {
                  console.log(`Extracting channel ${sourceChannel} for ${type}`)
                  texture = extractChannel(texture, sourceChannel)
                  // For grayscale textures, use linear color space
                  texture.colorSpace = THREE.LinearSRGBColorSpace
                }

                const materialProperty = textureTypeMap[type] || type
                loadedTextures[materialProperty] = texture
                console.log(
                  `Loaded ${type} -> ${materialProperty} (channel: ${sourceChannel})`
                )
              } catch (error) {
                console.warn(`Failed to load ${type} texture:`, error)
              }
            }

            // Apply textures to all meshes with proper material setup
            let meshCount = 0
            model.traverse(child => {
              if (child.isMesh) {
                meshCount++

                // Create new material with white base color for textures
                child.material = new THREE.MeshStandardMaterial({
                  color: loadedTextures.map
                    ? 0xffffff
                    : new THREE.Color(0.7, 0.7, 0.9),
                  metalness: loadedTextures.metalnessMap ? 1 : 0.3,
                  roughness: loadedTextures.roughnessMap ? 1 : 0.4,
                  envMapIntensity: 1.0,
                })

                // Apply each loaded texture
                for (const [property, texture] of Object.entries(
                  loadedTextures
                )) {
                  if (child.material[property] !== undefined) {
                    child.material[property] = texture
                    child.material.needsUpdate = true
                    console.log(`Applied ${property} to mesh`)

                    // Special handling for emissive
                    if (property === 'emissiveMap') {
                      child.material.emissive = new THREE.Color(0xffffff)
                    }
                  }
                }
              }
            })

            return {
              success: true,
              meshCount,
              appliedTextures: Object.keys(loadedTextures),
            }
          } catch (error) {
            console.error('Texture application error:', error)
            return {
              success: false,
              error: error.message,
            }
          }
        },
        textureData,
        flipY
      )

      if (!result.success) {
        logger.warn('Failed to apply textures in browser', {
          error: result.error,
        })
        return false
      }

      logger.info('Textures applied successfully', {
        meshCount: result.meshCount,
        appliedTextures: result.appliedTextures,
        flipY,
      })

      return true
    } catch (error) {
      logger.error('Failed to apply textures', {
        error: error.message,
        stack: error.stack,
      })
      return false
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

      // Calculate optimal camera distance
      const cameraDistance = await this.calculateOptimalCameraDistance()

      // Calculate frame count
      const angleRange = config.orbit.endAngle - config.orbit.startAngle
      const frameCount = Math.ceil(angleRange / config.orbit.angleStep)

      jobLogger.info('Starting orbit frame rendering with Puppeteer', {
        angleStep: config.orbit.angleStep,
        startAngle: config.orbit.startAngle,
        endAngle: config.orbit.endAngle,
        frameCount: frameCount,
        cameraDistance: cameraDistance,
        cameraHeight: config.orbit.cameraHeight,
      })

      // Render frames at each orbit angle
      for (let i = 0; i < frameCount; i++) {
        const angle = config.orbit.startAngle + i * config.orbit.angleStep
        const frameData = await this.renderFrame(angle, cameraDistance, i)
        frames.push(frameData)

        // Log progress every 10 frames or at the end
        if ((i + 1) % 10 === 0 || i === frameCount - 1) {
          const memoryUsage = process.memoryUsage()
          jobLogger.info('Orbit rendering progress', {
            framesCompleted: i + 1,
            totalFrames: frameCount,
            currentAngle: angle,
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
   * @param {number} distance - Camera distance from center
   * @param {number} frameIndex - Frame index for logging
   * @returns {Promise<Object>} Frame data object
   */
  async renderFrame(angle, distance, frameIndex) {
    if (!this.page) {
      throw new Error('Renderer not initialized')
    }

    // Position camera and render in browser (async for WebGPU support)
    const result = await this.page.evaluate(
      async (ang, dist, height) => {
        try {
          window.positionCamera(ang, dist, height)
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
      angle,
      distance,
      config.orbit.cameraHeight
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
    })

    return frameData
  }

  /**
   * Calculate optimal camera distance based on model bounds
   * Uses bounding sphere to ensure entire model is visible when rotated
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

      // Calculate bounding sphere radius that encompasses the entire model
      const box = new window.THREE.Box3().setFromObject(
        window.modelRenderer.model
      )
      const size = box.getSize(new window.THREE.Vector3())

      // Calculate diagonal radius - this ensures the entire model is visible
      // even when rotated at any angle
      const diagonalRadius =
        Math.sqrt(size.x * size.x + size.y * size.y + size.z * size.z) / 2

      // Calculate camera distance based on field of view and bounding sphere
      // FOV is 45 degrees, so we need distance = radius / tan(FOV/2)
      const fovRadians = (45 * Math.PI) / 180
      const minDistance = diagonalRadius / Math.tan(fovRadians / 2)

      // Add 10% padding to ensure model doesn't touch edges
      const paddingFactor = 1.1
      const calculatedDistance = minDistance * paddingFactor

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
   * Set viewport size dynamically
   * @param {number} width - Viewport width
   * @param {number} height - Viewport height
   */
  async setViewport(width, height) {
    if (!this.page) {
      throw new Error('Renderer not initialized')
    }

    await this.page.setViewport({
      width: width,
      height: height,
      deviceScaleFactor: 1,
    })

    // Update renderer size in the page
    await this.page.evaluate(
      async (w, h) => {
        if (window.modelRenderer.renderer) {
          window.modelRenderer.renderer.setSize(w, h)
          window.modelRenderer.camera.aspect = w / h
          window.modelRenderer.camera.updateProjectionMatrix()
        }
      },
      width,
      height
    )

    logger.debug('Viewport resized', { width, height })
  }

  /**
   * Get MIME type for file type
   * @param {string} fileType - File extension
   * @returns {string} MIME type
   */
  getMimeType(fileType) {
    const mimeTypes = {
      obj: 'text/plain',
      fbx: 'application/octet-stream',
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
