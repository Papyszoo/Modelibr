import fs from 'fs'
import FormData from 'form-data'
import axios from 'axios'
import https from 'https'
import { config } from './config.js'
import logger from './logger.js'

/**
 * Service for uploading texture set thumbnails to the backend API.
 * Mirrors ThumbnailApiService but targets /texture-sets/{id}/thumbnail/* endpoints.
 */
export class TextureSetApiService {
  constructor() {
    this.apiBaseUrl = config.apiBaseUrl
    const httpsAgent = this.apiBaseUrl.startsWith('https:')
      ? new https.Agent({ rejectUnauthorized: config.rejectUnauthorized })
      : undefined

    this.client = axios.create({
      baseURL: this.apiBaseUrl,
      timeout: 30000,
      headers: {
        'User-Agent': 'Modelibr-ThumbnailWorker/1.0',
        ...(config.workerApiKey ? { 'X-Api-Key': config.workerApiKey } : {}),
      },
      httpsAgent,
    })
  }

  /**
   * Upload the WebP (animated orbit) thumbnail for a texture set.
   * @param {number} textureSetId
   * @param {string} thumbnailPath - Local path to the WebP file
   * @param {Object} [metadata={}]
   * @returns {Promise<{success: boolean, data?: Object, error?: string}>}
   */
  async uploadThumbnail(textureSetId, thumbnailPath, metadata = {}) {
    try {
      if (!fs.existsSync(thumbnailPath)) {
        throw new Error(`Thumbnail file not found: ${thumbnailPath}`)
      }

      const formData = new FormData()
      formData.append('file', fs.createReadStream(thumbnailPath))
      if (metadata.width) formData.append('width', metadata.width.toString())
      if (metadata.height) formData.append('height', metadata.height.toString())

      const uploadUrl = `/texture-sets/${textureSetId}/thumbnail/upload`

      logger.info('Uploading texture set thumbnail', {
        textureSetId,
        thumbnailPath,
        apiUrl: `${this.apiBaseUrl}${uploadUrl}`,
      })

      const response = await this.client.post(uploadUrl, formData, {
        headers: { ...formData.getHeaders() },
      })

      logger.info('Texture set thumbnail uploaded', {
        textureSetId,
        responseData: response.data,
      })

      return { success: true, data: response.data }
    } catch (error) {
      logger.error('Failed to upload texture set thumbnail', {
        textureSetId,
        thumbnailPath,
        error: error.message,
        response: error.response?.data,
      })
      return { success: false, error: error.message }
    }
  }

  /**
   * Upload the PNG (poster) thumbnail for a texture set.
   * @param {number} textureSetId
   * @param {string} pngPath - Local path to the PNG file
   * @param {Object} [metadata={}]
   * @returns {Promise<{success: boolean, data?: Object, error?: string}>}
   */
  async uploadPngThumbnail(textureSetId, pngPath, metadata = {}) {
    try {
      if (!fs.existsSync(pngPath)) {
        throw new Error(`PNG thumbnail file not found: ${pngPath}`)
      }

      const formData = new FormData()
      formData.append('file', fs.createReadStream(pngPath))
      if (metadata.width) formData.append('width', metadata.width.toString())
      if (metadata.height) formData.append('height', metadata.height.toString())

      const uploadUrl = `/texture-sets/${textureSetId}/thumbnail/png-upload`

      logger.info('Uploading texture set PNG thumbnail', {
        textureSetId,
        pngPath,
        apiUrl: `${this.apiBaseUrl}${uploadUrl}`,
      })

      const response = await this.client.post(uploadUrl, formData, {
        headers: { ...formData.getHeaders() },
      })

      logger.info('Texture set PNG thumbnail uploaded', {
        textureSetId,
        responseData: response.data,
      })

      return { success: true, data: response.data }
    } catch (error) {
      logger.error('Failed to upload texture set PNG thumbnail', {
        textureSetId,
        pngPath,
        error: error.message,
        response: error.response?.data,
      })
      return { success: false, error: error.message }
    }
  }

  /**
   * Upload both WebP and PNG thumbnails for a texture set.
   * @param {number} textureSetId
   * @param {{webpPath?: string, pngPath?: string}} paths
   * @returns {Promise<{allSuccessful: boolean, uploads: Array}>}
   */
  async uploadMultipleThumbnails(textureSetId, paths) {
    const result = { allSuccessful: true, uploads: [] }

    if (paths.webpPath && fs.existsSync(paths.webpPath)) {
      const webpResult = await this.uploadThumbnail(
        textureSetId,
        paths.webpPath,
        { width: 256, height: 256 }
      )
      result.uploads.push({ type: 'webp', path: paths.webpPath, ...webpResult })
      if (!webpResult.success) result.allSuccessful = false
    }

    if (paths.pngPath && fs.existsSync(paths.pngPath)) {
      const pngResult = await this.uploadPngThumbnail(
        textureSetId,
        paths.pngPath,
        { width: 256, height: 256 }
      )
      result.uploads.push({ type: 'png', path: paths.pngPath, ...pngResult })
      if (!pngResult.success) result.allSuccessful = false
    }

    return result
  }
}
