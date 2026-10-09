import fs from 'fs'
import FormData from 'form-data'
import axios from 'axios'
import https from 'https'
import { config } from './config.js'
import logger from './logger.js'

/**
 * Uploads a vfx thumbnail and closes its job.
 *
 * Two calls, like the other asset types: the bytes go up as multipart and the
 * queue transition is a small JSON call afterwards.
 */
export class VfxApiService {
  constructor() {
    this.apiBaseUrl = config.apiBaseUrl
    const httpsAgent = this.apiBaseUrl.startsWith('https:')
      ? new https.Agent({ rejectUnauthorized: config.rejectUnauthorized })
      : undefined

    this.client = axios.create({
      baseURL: this.apiBaseUrl,
      timeout: 60000,
      headers: {
        'User-Agent': 'Modelibr-ThumbnailWorker/1.0',
        ...(config.workerApiKey ? { 'X-Api-Key': config.workerApiKey } : {}),
      },
      httpsAgent,
    })
  }

  /**
   * Store the animated WebP as the effect's thumbnail.
   * @param {number} vfxId
   * @param {string} webpPath - Local path to the WebP file.
   * @returns {Promise<{success: boolean, data?: Object, error?: string}>}
   */
  async uploadThumbnail(vfxId, webpPath) {
    try {
      if (!fs.existsSync(webpPath)) {
        throw new Error(`Thumbnail file not found: ${webpPath}`)
      }

      const formData = new FormData()
      formData.append('file', fs.createReadStream(webpPath), {
        contentType: 'image/webp',
        filename: 'thumbnail.webp',
      })

      const response = await this.client.post(
        `/vfx/${vfxId}/thumbnail/upload`,
        formData,
        { headers: { ...formData.getHeaders() } }
      )

      logger.info('Vfx thumbnail uploaded', { vfxId, data: response.data })
      return { success: true, data: response.data }
    } catch (error) {
      logger.error('Failed to upload vfx thumbnail', {
        vfxId,
        webpPath,
        error: error.message,
        response: error.response?.data,
      })
      return { success: false, error: error.message }
    }
  }

  /**
   * Mark the vfx thumbnail job completed or failed.
   * @param {number} jobId
   * @param {boolean} success
   * @param {string} [errorMessage]
   */
  async finishJob(jobId, success, errorMessage = null) {
    await this.client.post(`/thumbnail-jobs/vfx/${jobId}/finish`, {
      success,
      errorMessage,
    })

    logger.info(
      success
        ? 'Marked vfx thumbnail job as completed'
        : 'Marked vfx thumbnail job as failed',
      { jobId, ...(success ? {} : { errorMessage }) }
    )
  }
}
