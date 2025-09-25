import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'
import fs from 'fs'
import path from 'path'
import { config } from './config.js'
import logger from './logger.js'

/**
 * Service for loading and processing 3D models
 */
export class ModelLoaderService {
  constructor() {
    this.gltfLoader = new GLTFLoader()
    this.objLoader = new OBJLoader()
  }

  /**
   * Load a 3D model from file path
   * @param {string} filePath - Path to the model file
   * @param {string} fileType - Type of the file (obj, gltf, glb)
   * @returns {Promise<THREE.Object3D>} Loaded and normalized model
   */
  async loadModel(filePath, fileType) {
    logger.debug('Loading model', { filePath, fileType })

    if (!fs.existsSync(filePath)) {
      throw new Error(`Model file not found: ${filePath}`)
    }

    let loadedModel

    switch (fileType.toLowerCase()) {
      case 'obj':
        loadedModel = await this.loadOBJModel(filePath)
        break
      case 'gltf':
      case 'glb':
        loadedModel = await this.loadGLTFModel(filePath)
        break
      default:
        throw new Error(`Unsupported file type: ${fileType}`)
    }

    // Validate polygon count
    this.validatePolygonCount(loadedModel)

    // Normalize the model
    if (config.modelProcessing.enableNormalization) {
      this.normalizeModel(loadedModel)
    }

    logger.debug('Model loaded and processed successfully', {
      filePath,
      fileType,
      polygonCount: this.countPolygons(loadedModel),
    })

    return loadedModel
  }

  /**
   * Load OBJ model
   * @param {string} filePath - Path to OBJ file
   * @returns {Promise<THREE.Object3D>} Loaded model
   */
  async loadOBJModel(filePath) {
    return new Promise((resolve, reject) => {
      try {
        const fileContent = fs.readFileSync(filePath, 'utf8')
        const model = this.objLoader.parse(fileContent)
        resolve(model)
      } catch (error) {
        reject(new Error(`Failed to load OBJ model: ${error.message}`))
      }
    })
  }

  /**
   * Load GLTF/GLB model
   * @param {string} filePath - Path to GLTF/GLB file
   * @returns {Promise<THREE.Object3D>} Loaded model
   */
  async loadGLTFModel(filePath) {
    return new Promise((resolve, reject) => {
      try {
        if (path.extname(filePath).toLowerCase() === '.glb') {
          // For GLB files, read as buffer
          const fileBuffer = fs.readFileSync(filePath)
          this.gltfLoader.parse(
            fileBuffer,
            '',
            gltf => {
              resolve(gltf.scene)
            },
            reject
          )
        } else {
          // For GLTF files, read as text
          const fileContent = fs.readFileSync(filePath, 'utf8')
          this.gltfLoader.parse(
            fileContent,
            path.dirname(filePath),
            gltf => {
              resolve(gltf.scene)
            },
            reject
          )
        }
      } catch (error) {
        reject(new Error(`Failed to load GLTF model: ${error.message}`))
      }
    })
  }

  /**
   * Normalize model to center at origin and fit within specified bounds
   * @param {THREE.Object3D} model - Model to normalize
   */
  normalizeModel(model) {
    // Calculate bounding box
    const box = new THREE.Box3().setFromObject(model)
    const center = box.getCenter(new THREE.Vector3())
    const size = box.getSize(new THREE.Vector3())

    // Calculate scale to fit within normalized bounds
    const maxDimension = Math.max(size.x, size.y, size.z)
    const scale = config.modelProcessing.normalizedScale / maxDimension

    // Center the model at origin
    model.position.sub(center.multiplyScalar(scale))

    // Apply uniform scaling
    model.scale.setScalar(scale)

    logger.debug('Model normalized', {
      originalSize: { x: size.x, y: size.y, z: size.z },
      center: { x: center.x, y: center.y, z: center.z },
      scale: scale,
      maxDimension: maxDimension,
    })
  }

  /**
   * Count polygons in a model
   * @param {THREE.Object3D} model - Model to count polygons for
   * @returns {number} Total polygon count
   */
  countPolygons(model) {
    let polygonCount = 0

    model.traverse(child => {
      if (child.isMesh && child.geometry) {
        if (child.geometry.index) {
          // Indexed geometry
          polygonCount += child.geometry.index.count / 3
        } else if (child.geometry.attributes.position) {
          // Non-indexed geometry
          polygonCount += child.geometry.attributes.position.count / 3
        }
      }
    })

    return Math.floor(polygonCount)
  }

  /**
   * Validate that model doesn't exceed polygon count limits
   * @param {THREE.Object3D} model - Model to validate
   * @throws {Error} If model exceeds polygon limits
   */
  validatePolygonCount(model) {
    const polygonCount = this.countPolygons(model)

    if (polygonCount > config.modelProcessing.maxPolygonCount) {
      throw new Error(
        `Model exceeds maximum polygon count: ${polygonCount} > ${config.modelProcessing.maxPolygonCount}`
      )
    }

    logger.debug('Model polygon count validation passed', {
      polygonCount,
      maxAllowed: config.modelProcessing.maxPolygonCount,
    })
  }

  /**
   * Get supported file types
   * @returns {string[]} Array of supported file extensions
   */
  getSupportedFileTypes() {
    return ['obj', 'gltf', 'glb']
  }
}
