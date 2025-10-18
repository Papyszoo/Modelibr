import axios from 'axios'
import https from 'https'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { config } from './config.js'
import logger from './logger.js'

/**
 * Service for fetching model and texture data from the API
 */
export class ModelDataService {
  constructor() {
    const httpsAgent = config.apiBaseUrl.startsWith('https:')
      ? new https.Agent({ rejectUnauthorized: config.rejectUnauthorized })
      : undefined

    this.apiClient = axios.create({
      baseURL: config.apiBaseUrl,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
      httpsAgent,
    })

    this.tempDir = path.join(os.tmpdir(), 'modelibr-worker', 'textures')
    this.ensureTempDirectory()
  }

  /**
   * Ensure temporary directory exists for textures
   */
  ensureTempDirectory() {
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true })
      logger.debug('Created texture temporary directory', {
        tempDir: this.tempDir,
      })
    }
  }

  /**
   * Fetch model information including default texture set
   * @param {number} modelId - The model ID
   * @returns {Promise<Object|null>} Model data or null if not found
   */
  async getModelInfo(modelId) {
    try {
      logger.debug('Fetching model information', { modelId })

      const response = await this.apiClient.get(`/models/${modelId}`)

      if (!response || !response.data) {
        logger.warn('No model data received from API', { modelId })
        return null
      }

      logger.info('Model information fetched successfully', {
        modelId,
        hasDefaultTextureSet: !!response.data.defaultTextureSetId,
        defaultTextureSetId: response.data.defaultTextureSetId,
      })

      return response.data
    } catch (error) {
      if (error.response?.status === 404) {
        logger.warn('Model not found', { modelId })
        return null
      }

      logger.error('Failed to fetch model information', {
        modelId,
        error: error.message,
        status: error.response?.status,
      })
      throw error
    }
  }

  /**
   * Fetch texture set information including all texture files
   * @param {number} textureSetId - The texture set ID
   * @returns {Promise<Object|null>} Texture set data or null if not found
   */
  async getTextureSet(textureSetId) {
    try {
      logger.debug('Fetching texture set information', { textureSetId })

      const response = await this.apiClient.get(`/texture-sets/${textureSetId}`)

      if (!response || !response.data) {
        logger.warn('No texture set data received from API', { textureSetId })
        return null
      }

      logger.info('Texture set information fetched successfully', {
        textureSetId,
        name: response.data.name,
        textureCount: response.data.textures?.length || 0,
      })

      return response.data
    } catch (error) {
      if (error.response?.status === 404) {
        logger.warn('Texture set not found', { textureSetId })
        return null
      }

      logger.error('Failed to fetch texture set information', {
        textureSetId,
        error: error.message,
        status: error.response?.status,
      })
      throw error
    }
  }

  /**
   * Download a texture file from the API
   * @param {number} fileId - The file ID
   * @param {string} originalFileName - The original file name
   * @returns {Promise<string|null>} Path to downloaded texture file or null if failed
   */
  async downloadTextureFile(fileId, originalFileName) {
    try {
      logger.debug('Downloading texture file', { fileId, originalFileName })

      const response = await this.apiClient.get(`/files/${fileId}`, {
        responseType: 'stream',
      })

      if (!response || !response.data) {
        logger.warn('No texture file data received from API', { fileId })
        return null
      }

      // Save to temporary file
      const fileExtension = path.extname(originalFileName)
      const tempFileName = `texture_${fileId}_${Date.now()}${fileExtension}`
      const tempFilePath = path.join(this.tempDir, tempFileName)

      await this.writeStreamToFile(response.data, tempFilePath)

      logger.info('Texture file downloaded successfully', {
        fileId,
        originalFileName,
        tempFilePath,
        fileSize: fs.statSync(tempFilePath).size,
      })

      return tempFilePath
    } catch (error) {
      logger.error('Failed to download texture file', {
        fileId,
        originalFileName,
        error: error.message,
        status: error.response?.status,
      })
      return null
    }
  }

  /**
   * Download all textures for a texture set
   * @param {Object} textureSet - The texture set data
   * @returns {Promise<Object>} Map of texture types to file paths
   */
  async downloadTextureSetFiles(textureSet) {
    const texturePaths = {}

    if (!textureSet || !textureSet.textures || textureSet.textures.length === 0) {
      logger.info('No textures to download for texture set', {
        textureSetId: textureSet?.id,
      })
      return texturePaths
    }

    logger.info('Downloading texture files', {
      textureSetId: textureSet.id,
      textureCount: textureSet.textures.length,
    })

    for (const texture of textureSet.textures) {
      try {
        const filePath = await this.downloadTextureFile(
          texture.fileId,
          texture.originalFileName || `texture_${texture.id}`
        )

        if (filePath) {
          texturePaths[texture.textureType] = filePath
          logger.debug('Texture downloaded', {
            textureType: texture.textureType,
            fileId: texture.fileId,
            filePath,
          })
        }
      } catch (error) {
        logger.warn('Failed to download texture, continuing with others', {
          textureId: texture.id,
          textureType: texture.textureType,
          error: error.message,
        })
      }
    }

    logger.info('Texture set files downloaded', {
      textureSetId: textureSet.id,
      downloadedCount: Object.keys(texturePaths).length,
      types: Object.keys(texturePaths),
    })

    return texturePaths
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
   * Clean up a texture file
   * @param {string} filePath - Path to texture file
   */
  async cleanupTextureFile(filePath) {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath)
        logger.debug('Cleaned up texture file', { filePath })
      }
    } catch (error) {
      logger.warn('Failed to cleanup texture file', {
        filePath,
        error: error.message,
      })
    }
  }

  /**
   * Clean up all texture files in a map
   * @param {Object} texturePaths - Map of texture types to file paths
   */
  async cleanupTextureFiles(texturePaths) {
    if (!texturePaths) return

    for (const filePath of Object.values(texturePaths)) {
      await this.cleanupTextureFile(filePath)
    }
  }

  /**
   * Clean up all old texture files
   * @param {number} maxAgeMs - Maximum age in milliseconds (default: 1 hour)
   */
  async cleanupOldTextureFiles(maxAgeMs = 60 * 60 * 1000) {
    try {
      if (!fs.existsSync(this.tempDir)) return

      const files = fs.readdirSync(this.tempDir)
      const now = Date.now()
      let cleanedCount = 0

      for (const file of files) {
        const filePath = path.join(this.tempDir, file)
        const stats = fs.statSync(filePath)

        if (now - stats.mtime.getTime() > maxAgeMs) {
          await this.cleanupTextureFile(filePath)
          cleanedCount++
        }
      }

      if (cleanedCount > 0) {
        logger.info('Cleaned up old texture files', {
          cleanedCount,
          tempDir: this.tempDir,
        })
      }
    } catch (error) {
      logger.warn('Failed to cleanup old texture files', {
        error: error.message,
        tempDir: this.tempDir,
      })
    }
  }
}
