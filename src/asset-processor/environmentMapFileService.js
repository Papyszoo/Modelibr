import fs from 'fs'
import os from 'os'
import path from 'path'
import { JobApiClient } from './jobApiClient.js'
import logger from './logger.js'

const CUBE_FACE_ORDER = ['px', 'nx', 'py', 'ny', 'pz', 'nz']

/**
 * Service for fetching environment map metadata and source files.
 */
export class EnvironmentMapFileService {
  constructor() {
    this.jobService = new JobApiClient()
    this.tempDir = path.join(os.tmpdir(), 'modelibr-worker', 'environment-maps')
    this.ensureTempDirectory()
  }

  ensureTempDirectory() {
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true })
      logger.debug('Created environment map temporary directory', {
        tempDir: this.tempDir,
      })
    }
  }

  async getEnvironmentMap(environmentMapId) {
    return this.jobService.getEnvironmentMap(environmentMapId)
  }

  selectVariant(environmentMap, preferredVariantId = null) {
    const variants = environmentMap?.variants || []
    if (variants.length === 0) {
      throw new Error(`Environment map ${environmentMap?.id} has no variants`)
    }

    if (preferredVariantId) {
      const preferred = variants.find(
        variant => variant.id === preferredVariantId
      )
      if (!preferred) {
        throw new Error(
          `Environment map variant ${preferredVariantId} was not found for environment map ${environmentMap.id}`
        )
      }
      return preferred
    }

    if (environmentMap.previewVariantId) {
      const previewVariant = variants.find(
        variant => variant.id === environmentMap.previewVariantId
      )
      if (previewVariant) return previewVariant
    }

    return variants[0]
  }

  async downloadVariantSource(variant) {
    if (!variant) {
      throw new Error('Environment map variant is required')
    }

    if (variant.projectionType === 'cube' || variant.sourceType === 'cube') {
      return {
        projectionType: 'cube',
        cubeFaces: await this._downloadCubeFaces(variant.cubeFaces),
      }
    }

    const panoramicFile = variant.panoramicFile
    if (!panoramicFile?.fileId) {
      throw new Error(
        `Panoramic variant ${variant.id} is missing panoramicFile`
      )
    }

    return {
      projectionType: 'equirectangular',
      panoramic: await this._downloadFile(
        panoramicFile.fileId,
        panoramicFile.fileName
      ),
    }
  }

  async _downloadCubeFaces(cubeFaces) {
    if (!cubeFaces) {
      throw new Error('Cube variant is missing cubeFaces')
    }

    const downloadedFaces = {}
    for (const face of CUBE_FACE_ORDER) {
      const file = cubeFaces[face]
      if (!file?.fileId) {
        throw new Error(`Cube variant is missing the ${face} face`)
      }
      downloadedFaces[face] = await this._downloadFile(
        file.fileId,
        file.fileName
      )
    }

    return downloadedFaces
  }

  async _downloadFile(fileId, originalFileName) {
    const response = await this.jobService.getFile(fileId)
    if (!response?.data) {
      throw new Error(`No file stream returned for file ${fileId}`)
    }

    const fileExtension =
      path.extname(originalFileName || '').toLowerCase() || '.bin'
    const tempFileName = `environment_map_${fileId}_${Date.now()}${fileExtension}`
    const tempFilePath = path.join(this.tempDir, tempFileName)

    await this.writeStreamToFile(response.data, tempFilePath)

    return {
      fileId,
      fileName: originalFileName,
      filePath: tempFilePath,
    }
  }

  async writeStreamToFile(stream, filePath) {
    return new Promise((resolve, reject) => {
      const writeStream = fs.createWriteStream(filePath)
      stream.pipe(writeStream)

      writeStream.on('finish', resolve)
      writeStream.on('error', error => {
        reject(new Error(`Failed to write file: ${error.message}`))
      })
      stream.on('error', error => {
        reject(new Error(`Stream error: ${error.message}`))
      })
    })
  }

  async cleanupSource(source) {
    if (!source) return

    const files = []
    if (source.panoramic?.filePath) {
      files.push(source.panoramic.filePath)
    }

    if (source.cubeFaces) {
      for (const face of Object.values(source.cubeFaces)) {
        if (face?.filePath) files.push(face.filePath)
      }
    }

    const uniqueFiles = [...new Set(files)]
    for (const filePath of uniqueFiles) {
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath)
        }
      } catch (error) {
        logger.warn('Failed to clean up environment map source file', {
          filePath,
          error: error.message,
        })
      }
    }
  }
}
