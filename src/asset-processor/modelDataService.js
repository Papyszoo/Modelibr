import axios from 'axios'
import https from 'https'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { config } from './config.js'
import logger from './logger.js'
import { writeStreamToFile } from './streamFile.js'

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
   * @returns {Promise<Object>} Map of texture types to texture info objects {filePath, sourceChannel}
   */
  async downloadTextureSetFiles(textureSet) {
    const texturePaths = {}

    if (
      !textureSet ||
      !textureSet.textures ||
      textureSet.textures.length === 0
    ) {
      logger.info('No textures to download for texture set', {
        textureSetId: textureSet?.id,
      })
      return texturePaths
    }

    logger.info('Downloading texture files', {
      textureSetId: textureSet.id,
      textureCount: textureSet.textures.length,
    })

    // Deduplicate downloads: multiple texture types may reference the same fileId
    // (e.g., ARM packed texture used for AO, Roughness, Metallic channels)
    const downloadedFiles = new Map() // fileId -> filePath

    for (const texture of textureSet.textures) {
      try {
        let filePath

        // Reuse already-downloaded file if same fileId was fetched before
        if (downloadedFiles.has(texture.fileId)) {
          filePath = downloadedFiles.get(texture.fileId)
          logger.debug('Reusing already-downloaded texture file', {
            textureType: texture.textureType,
            fileId: texture.fileId,
            filePath,
          })
        } else {
          filePath = await this.downloadTextureFile(
            texture.fileId,
            texture.fileName || `texture_${texture.id}`
          )
          if (filePath) {
            downloadedFiles.set(texture.fileId, filePath)
          }
        }

        if (filePath) {
          // Include sourceChannel for split channel extraction
          // sourceChannel: 0=RGB (full texture), 1=R, 2=G, 3=B, 4=A
          texturePaths[texture.textureType] = {
            filePath,
            sourceChannel: texture.sourceChannel ?? 0, // Default to RGB (0)
            textureId: texture.id, // Needed for proxy generation
          }
          logger.debug('Texture downloaded', {
            textureType: texture.textureType,
            fileId: texture.fileId,
            sourceChannel: texture.sourceChannel ?? 0,
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
      downloadedFiles: downloadedFiles.size,
      deduplicatedCount: textureSet.textures.length - downloadedFiles.size,
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
    return writeStreamToFile(stream, filePath)
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
   * @param {Object} texturePaths - Map of texture types to texture info objects {filePath, sourceChannel}
   */
  async cleanupTextureFiles(texturePaths) {
    if (!texturePaths) return

    // Deduplicate file paths - multiple texture types may share the same file (e.g., ARM channels)
    const uniquePaths = new Set()
    for (const textureInfo of Object.values(texturePaths)) {
      // Handle both new {filePath, sourceChannel} objects and legacy plain strings
      const filePath =
        typeof textureInfo === 'string' ? textureInfo : textureInfo.filePath
      uniquePaths.add(filePath)
    }

    for (const filePath of uniquePaths) {
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

  /**
   * Save extracted technical metadata to the API for a model version.
   * Calls PUT /model-versions/{versionId}/technical-metadata (worker-authenticated).
   * @param {number} modelVersionId - The model version ID
   * @param {Object} metadata - Extracted technical metadata
   * @param {string[]} metadata.materialNames - Array of material names
   * @param {number|null} metadata.triangleCount - Total triangle count
   * @param {number|null} metadata.vertexCount - Total vertex count
   * @param {number|null} metadata.meshCount - Total mesh count
   * @param {number|null} metadata.materialCount - Total distinct material count
   * @returns {Promise<boolean>} True if saved successfully
   */
  async saveTechnicalMetadata(modelVersionId, metadata) {
    try {
      logger.info('Saving technical metadata for model version', {
        modelVersionId,
        materialNames: metadata.materialNames,
        triangleCount: metadata.triangleCount,
        vertexCount: metadata.vertexCount,
        meshCount: metadata.meshCount,
        materialCount: metadata.materialCount,
      })

      await this.apiClient.put(
        `/model-versions/${modelVersionId}/technical-metadata`,
        {
          materialNames: metadata.materialNames,
          triangleCount: metadata.triangleCount,
          vertexCount: metadata.vertexCount,
          meshCount: metadata.meshCount,
          materialCount: metadata.materialCount,
          boundingBoxX: metadata.boundingBoxX ?? null,
          boundingBoxY: metadata.boundingBoxY ?? null,
          boundingBoxZ: metadata.boundingBoxZ ?? null,
          animationCount: metadata.animationCount ?? null,
          animationNames: metadata.animationNames ?? [],
          boneCount: metadata.boneCount ?? null,
        },
        {
          headers: {
            ...(config.workerApiKey
              ? { 'X-Api-Key': config.workerApiKey }
              : {}),
          },
        }
      )

      logger.info('Technical metadata saved successfully', {
        modelVersionId,
        materialCount: metadata.materialNames.length,
      })

      return true
    } catch (error) {
      logger.warn('Failed to save technical metadata', {
        modelVersionId,
        error: error.message,
        status: error.response?.status,
      })
      return false
    }
  }

  /**
   * Persist a full scene-graph extraction for a model version.
   * Calls PUT /model-versions/{versionId}/scene-graph (worker-authenticated).
   * @param {number} modelVersionId - The model version ID
   * @param {string} fileSha256 - SHA-256 of the extracted model file
   * @param {Object} sceneGraph - Payload from puppeteerRenderer.extractSceneGraph()
   * @returns {Promise<boolean>} True if saved successfully
   */
  async saveSceneGraph(modelVersionId, fileSha256, sceneGraph) {
    try {
      const body = {
        fileSha256,
        extractorVersion: sceneGraph.extractorVersion,
        geometryHashVersion: sceneGraph.geometryHashVersion ?? null,
        schemaVersion: 1,
        rollups: {
          meshCount: sceneGraph.rollups.meshCount ?? null,
          totalTriangles: sceneGraph.rollups.totalTriangles ?? null,
          totalVertices: sceneGraph.rollups.totalVertices ?? null,
          materialCount: sceneGraph.rollups.materialCount ?? null,
          materialNames: sceneGraph.rollups.materialNames ?? [],
          boneCount: sceneGraph.rollups.boneCount ?? null,
          // min/max travel alongside the dimensions: they are what place where the
          // asset's origin sits inside its own bounds. Sending the size alone left the
          // server assuming every origin was centred, which floated base-at-origin
          // geometry - most of the library - by half its height.
          worldBounds: sceneGraph.rollups.worldBounds
            ? {
                dimensions: sceneGraph.rollups.worldBounds.dimensions,
                min: sceneGraph.rollups.worldBounds.min ?? null,
                max: sceneGraph.rollups.worldBounds.max ?? null,
              }
            : null,
          animationCount: sceneGraph.rollups.animationCount ?? null,
          animationNames: sceneGraph.rollups.animationNames ?? [],
        },
        parts: sceneGraph.parts.map(p => ({
          partPath: p.partPath,
          name: p.name,
          parentPath: p.parentPath ?? null,
          depth: p.depth,
          objectType: p.objectType,
          triangleCount: p.triangleCount ?? null,
          vertexCount: p.vertexCount ?? null,
          geometryHash: p.geometryHash ?? null,
          hasUvs: p.hasUvs ?? null,
          // Everything not promoted to a column travels as jsonb detail.
          detail: {
            source: p.source,
            transform: p.transform,
            boundingBox: p.boundingBox ?? null,
            worldBoundingBox: p.worldBoundingBox ?? null,
            uvBounds: p.uvBounds ?? null,
            materialSlots: p.materialSlots ?? [],
            shapeKeys: p.shapeKeys ?? [],
            vertexGroups: p.vertexGroups ?? null,
            modifiers: p.modifiers ?? null,
            quadCount: p.quadCount ?? null,
            ngonCount: p.ngonCount ?? null,
          },
        })),
        warnings: sceneGraph.warnings ?? [],
      }

      await this.apiClient.put(
        `/model-versions/${modelVersionId}/scene-graph`,
        body,
        {
          headers: {
            ...(config.workerApiKey
              ? { 'X-Api-Key': config.workerApiKey }
              : {}),
          },
        }
      )

      logger.info('Scene graph saved successfully', {
        modelVersionId,
        partCount: body.parts.length,
      })
      return true
    } catch (error) {
      logger.warn('Failed to save scene graph', {
        modelVersionId,
        error: error.message,
        status: error.response?.status,
      })
      return false
    }
  }

  /**
   * Persist a raw extraction for a non-mesh asset family (TextureSet, Sound,
   * Script, Sprite, EnvironmentMap). Calls PUT /assets/{assetType}/{assetId}/extraction
   * (worker-authenticated). Models use saveSceneGraph instead.
   * @param {string} assetType - "TextureSet" | "Sound" | "Script" | "Sprite" | "EnvironmentMap"
   * @param {number} assetId - Id within the family
   * @param {Object} extraction - { fileSha256, payload, warnings?, extractorVersion, schemaVersion?, versionId?, outcome? }
   * @returns {Promise<boolean>} True if saved successfully
   */
  async saveExtraction(assetType, assetId, extraction) {
    try {
      const body = {
        versionId: extraction.versionId ?? null,
        fileSha256: extraction.fileSha256,
        extractorVersion: extraction.extractorVersion,
        schemaVersion: extraction.schemaVersion ?? 1,
        outcome: extraction.outcome ?? null,
        payload: extraction.payload ?? {},
        warnings: extraction.warnings ?? [],
      }

      await this.apiClient.put(
        `/assets/${encodeURIComponent(assetType)}/${assetId}/extraction`,
        body,
        {
          headers: {
            ...(config.workerApiKey
              ? { 'X-Api-Key': config.workerApiKey }
              : {}),
          },
        }
      )

      logger.info('Extraction saved successfully', {
        assetType,
        assetId,
        warningCount: body.warnings.length,
      })
      return true
    } catch (error) {
      logger.warn('Failed to save extraction', {
        assetType,
        assetId,
        error: error.message,
        status: error.response?.status,
      })
      return false
    }
  }

  async saveMaterialNames(modelVersionId, materialNames) {
    const uniqueNames = [...new Set(materialNames)]
    return this.saveTechnicalMetadata(modelVersionId, {
      materialNames: uniqueNames,
      triangleCount: null,
      vertexCount: null,
      meshCount: null,
      materialCount: uniqueNames.length,
    })
  }
}
