import * as THREE from 'three'
import { createCanvas } from 'canvas'
import { config } from './config.js'
import logger from './logger.js'

/**
 * Service for rendering orbit animation frames using three.js
 */
export class OrbitFrameRenderer {
  constructor() {
    this.renderer = null
    this.scene = null
    this.camera = null
    this.setupRenderer()
  }

  /**
   * Initialize the three.js renderer and scene
   */
  setupRenderer() {
    // Create scene
    this.scene = new THREE.Scene()

    // Setup camera
    this.camera = new THREE.PerspectiveCamera(
      60, // field of view
      config.rendering.outputWidth / config.rendering.outputHeight, // aspect ratio
      0.1, // near plane
      1000 // far plane
    )

    // Create canvas for headless rendering
    const canvas = createCanvas(
      config.rendering.outputWidth,
      config.rendering.outputHeight
    )
    
    // Add DOM-like event methods that THREE.js expects
    // node-canvas doesn't have these, so we add no-op implementations
    canvas.addEventListener = canvas.addEventListener || (() => {})
    canvas.removeEventListener = canvas.removeEventListener || (() => {})
    
    // Create WebGL renderer using the canvas
    this.renderer = new THREE.WebGLRenderer({
      canvas: canvas,
      antialias: config.rendering.enableAntialiasing,
      alpha: true,
      preserveDrawingBuffer: true, // Required for reading pixels
    })
    
    this.renderer.setSize(
      config.rendering.outputWidth,
      config.rendering.outputHeight
    )
    
    // Set background color
    const bgColor = parseInt(config.rendering.backgroundColor.replace('#', ''), 16)
    this.renderer.setClearColor(bgColor, 1)

    // Setup lighting to match frontend Scene.jsx
    this.setupLighting()

    logger.debug('OrbitFrameRenderer initialized with WebGL rendering', {
      renderSize: `${config.rendering.outputWidth}x${config.rendering.outputHeight}`,
      backgroundColor: config.rendering.backgroundColor,
      antialiasing: config.rendering.enableAntialiasing,
    })
  }

  /**
   * Setup lighting to match the frontend Scene component
   */
  setupLighting() {
    // Ambient light for general illumination
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.3)
    this.scene.add(ambientLight)

    // Directional light (main light source)
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0)
    directionalLight.position.set(10, 10, 5)
    directionalLight.castShadow = true
    directionalLight.shadow.mapSize.width = 2048
    directionalLight.shadow.mapSize.height = 2048
    directionalLight.shadow.camera.near = 0.5
    directionalLight.shadow.camera.far = 500
    directionalLight.shadow.camera.left = -10
    directionalLight.shadow.camera.right = 10
    directionalLight.shadow.camera.top = 10
    directionalLight.shadow.camera.bottom = -10
    this.scene.add(directionalLight)

    // Point light for additional fill lighting
    const pointLight = new THREE.PointLight(0xffffff, 0.5)
    pointLight.position.set(-10, -10, -10)
    this.scene.add(pointLight)

    // Spot light for dramatic effect
    const spotLight = new THREE.SpotLight(0xffffff, 0.8)
    spotLight.position.set(0, 10, 0)
    spotLight.angle = 0.3
    spotLight.penumbra = 1
    spotLight.castShadow = true
    this.scene.add(spotLight)

    // Ground plane for shadows (optional)
    const groundGeometry = new THREE.PlaneGeometry(10, 10)
    const groundMaterial = new THREE.MeshStandardMaterial({
      color: 0xf0f0f0,
      metalness: 0.0,
      roughness: 0.8,
    })
    const ground = new THREE.Mesh(groundGeometry, groundMaterial)
    ground.rotation.x = -Math.PI / 2
    ground.position.y = -2
    ground.receiveShadow = true
    this.scene.add(ground)

    logger.debug('Lighting setup completed', {
      ambientIntensity: 0.3,
      directionalIntensity: 1.0,
      pointIntensity: 0.5,
      spotIntensity: 0.8,
    })
  }

  /**
   * Render orbit frames for a given model
   * @param {THREE.Object3D} model - The 3D model to render
   * @param {Object} jobLogger - Logger with job context
   * @returns {Promise<Array>} Array of rendered frame data
   */
  async renderOrbitFrames(model, jobLogger) {
    const frames = []
    const startTime = Date.now()

    try {
      // Add model to scene
      this.scene.add(model)

      // Calculate optimal camera distance based on model bounds
      const cameraDistance = this.calculateOptimalCameraDistance(model)

      // Calculate frame count
      const angleRange = config.orbit.endAngle - config.orbit.startAngle
      const frameCount = Math.ceil(angleRange / config.orbit.angleStep)

      jobLogger.info('Starting orbit frame rendering', {
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

      // Remove model from scene to free memory
      this.scene.remove(model)

      const renderTime = Date.now() - startTime
      jobLogger.info('Orbit frame rendering completed', {
        frameCount: frames.length,
        renderTimeMs: renderTime,
        averageTimePerFrameMs: Math.round(renderTime / frames.length),
        totalDataSizeKB: Math.round(
          frames.reduce((sum, f) => sum + f.size, 0) / 1024
        ),
      })

      return frames
    } catch (error) {
      // Clean up on error
      this.scene.remove(model)
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
    // Convert angle to radians
    const radians = (angle * Math.PI) / 180

    // Position camera in orbit around the model
    this.camera.position.x = Math.cos(radians) * distance
    this.camera.position.z = Math.sin(radians) * distance
    this.camera.position.y = config.orbit.cameraHeight

    // Look at center of scene
    this.camera.lookAt(0, 0, 0)

    // Render the scene
    this.renderer.render(this.scene, this.camera)

    // Read pixel data from the renderer
    const gl = this.renderer.getContext()
    const width = config.rendering.outputWidth
    const height = config.rendering.outputHeight
    const pixels = new Uint8Array(width * height * 4) // RGBA
    
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels)

    // Flip pixels vertically (WebGL has origin at bottom-left, we need top-left)
    const flippedPixels = new Uint8Array(width * height * 4)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const srcIdx = ((height - 1 - y) * width + x) * 4
        const dstIdx = (y * width + x) * 4
        flippedPixels[dstIdx] = pixels[srcIdx]
        flippedPixels[dstIdx + 1] = pixels[srcIdx + 1]
        flippedPixels[dstIdx + 2] = pixels[srcIdx + 2]
        flippedPixels[dstIdx + 3] = pixels[srcIdx + 3]
      }
    }

    const frameSize = width * height * 4 // RGBA bytes

    // Create frame data object with actual pixel data
    const frameData = {
      index: frameIndex,
      angle: angle,
      width: width,
      height: height,
      pixels: Buffer.from(flippedPixels), // Convert to Buffer for easier handling
      size: frameSize,
      timestamp: Date.now(),
      cameraPosition: {
        x: this.camera.position.x,
        y: this.camera.position.y,
        z: this.camera.position.z,
      },
      simulated: false, // Actual rendering, not simulated
      renderSettings: {
        backgroundColor: config.rendering.backgroundColor,
        antialiasing: config.rendering.enableAntialiasing,
      },
    }

    logger.debug('Frame rendered (actual)', {
      frameIndex,
      angle,
      dataSize: frameSize,
      cameraPos: frameData.cameraPosition,
    })

    return frameData
  }

  /**
   * Calculate optimal camera distance based on model bounds
   * @param {THREE.Object3D} model - The model to analyze
   * @returns {number} Optimal camera distance
   */
  calculateOptimalCameraDistance(model) {
    const box = new THREE.Box3().setFromObject(model)
    const size = box.getSize(new THREE.Vector3())
    const maxDimension = Math.max(size.x, size.y, size.z)

    // Use configured distance as base, adjusted by model size
    const baseDistance = config.rendering.cameraDistance
    const calculatedDistance = baseDistance * (maxDimension / 2)

    // Ensure minimum distance
    const optimalDistance = Math.max(calculatedDistance, baseDistance)

    logger.debug('Camera distance calculated', {
      modelSize: { x: size.x, y: size.y, z: size.z },
      maxDimension,
      baseDistance,
      calculatedDistance,
      optimalDistance,
    })

    return optimalDistance
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
   * Clean up resources
   */
  dispose() {
    if (this.renderer) {
      this.renderer.dispose()
      this.renderer = null
    }

    if (this.scene) {
      // Clean up scene objects
      while (this.scene.children.length > 0) {
        const child = this.scene.children[0]
        this.scene.remove(child)

        if (child.geometry) {
          child.geometry.dispose()
        }

        if (child.material) {
          if (Array.isArray(child.material)) {
            child.material.forEach(material => material.dispose())
          } else {
            child.material.dispose()
          }
        }
      }

      this.scene = null
    }

    this.camera = null

    logger.debug('OrbitFrameRenderer disposed')
  }
}
