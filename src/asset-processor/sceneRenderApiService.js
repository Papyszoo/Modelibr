import fs from 'fs'
import FormData from 'form-data'
import axios from 'axios'
import https from 'https'
import { config } from './config.js'
import logger from './logger.js'

/**
 * Uploads scene renders and closes their jobs.
 *
 * Two calls rather than one, matching the thumbnail path: the bytes go up as multipart
 * and the queue transition is a small JSON call afterwards, so a slow upload never holds
 * a job transition open.
 */
export class SceneRenderApiService {
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
   * Store the rendered image against the job that asked for it.
   *
   * The scene id and viewpoint are deliberately not sent: the API reads both off the
   * job, so a worker cannot store an answer to a question it was not asked.
   *
   * @param {number} jobId
   * @param {string} renderPath - Local path to the PNG.
   * @param {Object} metadata
   * @param {number} metadata.width
   * @param {number} metadata.height
   * @param {number} metadata.nodesLoaded
   * @param {number} metadata.nodesFailed
   * @param {boolean} metadata.timedOut
   * @returns {Promise<{success: boolean, data?: Object, error?: string}>}
   */
  async uploadRender(jobId, renderPath, metadata) {
    try {
      if (!fs.existsSync(renderPath)) {
        throw new Error(`Render file not found: ${renderPath}`)
      }

      const formData = new FormData()
      formData.append('file', fs.createReadStream(renderPath))
      formData.append('width', String(metadata.width ?? 0))
      formData.append('height', String(metadata.height ?? 0))
      formData.append('nodesLoaded', String(metadata.nodesLoaded ?? 0))
      formData.append('nodesFailed', String(metadata.nodesFailed ?? 0))
      formData.append('timedOut', String(Boolean(metadata.timedOut)))

      const response = await this.client.post(
        `/thumbnail-jobs/scenes/${jobId}/render-upload`,
        formData,
        { headers: { ...formData.getHeaders() } }
      )

      logger.info('Scene render uploaded', { jobId, data: response.data })
      return { success: true, data: response.data }
    } catch (error) {
      logger.error('Failed to upload scene render', {
        jobId,
        renderPath,
        error: error.message,
        response: error.response?.data,
      })
      return { success: false, error: error.message }
    }
  }

  /**
   * Mark the render job completed or failed.
   * @param {number} jobId
   * @param {boolean} success
   * @param {string} [errorMessage]
   */
  async finishJob(jobId, success, errorMessage = null) {
    await this.client.post(`/thumbnail-jobs/scenes/${jobId}/finish`, {
      success,
      errorMessage,
    })

    logger.info(
      success
        ? 'Marked scene render job as completed'
        : 'Marked scene render job as failed',
      { jobId, ...(success ? {} : { errorMessage }) }
    )
  }
}
