import axios from 'axios'
import https from 'https'
import fs from 'fs'
import FormData from 'form-data'
import { config } from './config.js'
import logger from './logger.js'

/**
 * API client for interacting with the job processing queue
 */
export class JobApiClient {
  constructor() {
    const httpsAgent = config.apiBaseUrl.startsWith('https:')
      ? new https.Agent({ rejectUnauthorized: config.rejectUnauthorized })
      : undefined

    this.apiClient = axios.create({
      baseURL: config.apiBaseUrl,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        ...(config.workerApiKey ? { 'X-Api-Key': config.workerApiKey } : {}),
      },
      // Handle self-signed certificates in development/docker environments
      httpsAgent,
    })
  }

  /**
   * Poll for the next available thumbnail job
   * @returns {Promise<Object|null>} Job object or null if no jobs available
   */
  async pollForJob() {
    try {
      const response = await this.apiClient.post('/thumbnail-jobs/dequeue', {
        workerId: config.workerId,
      })

      if (response.status === 204) {
        // No jobs available
        return null
      }

      return response.data
    } catch (error) {
      if (error.response?.status === 404) {
        // No jobs available or endpoint not found
        logger.debug('No jobs available or API endpoint not found')
        return null
      }

      logger.error('Failed to poll for job', {
        error: error.message,
        status: error.response?.status,
        workerId: config.workerId,
      })
      throw error
    }
  }

  /**
   * Finish a thumbnail job (mark as completed or failed) - for model thumbnails
   * @param {number} jobId - The job ID
   * @param {boolean} success - Whether the job succeeded
   * @param {Object} metadata - Thumbnail metadata (required when success=true)
   * @param {string} metadata.thumbnailPath - Path to the stored thumbnail
   * @param {number} metadata.sizeBytes - Size of the thumbnail in bytes
   * @param {number} metadata.width - Width of the thumbnail
   * @param {number} metadata.height - Height of the thumbnail
   * @param {string} errorMessage - Error message (required when success=false)
   */
  async finishJob(jobId, success, metadata = {}, errorMessage = null) {
    try {
      const requestData = {
        success,
        thumbnailPath: metadata?.thumbnailPath || null,
        sizeBytes: metadata?.sizeBytes || null,
        width: metadata?.width || null,
        height: metadata?.height || null,
        errorMessage,
      }

      await this.apiClient.post(`/thumbnail-jobs/${jobId}/finish`, requestData)
      logger.info(
        success ? 'Marked job as completed' : 'Marked job as failed',
        {
          jobId,
          success,
          ...(success ? { thumbnailMetadata: metadata } : { errorMessage }),
        }
      )
    } catch (error) {
      logger.error('Failed to finish job', {
        jobId,
        success,
        error: error.message,
      })
      throw error
    }
  }

  /**
   * Finish a sound waveform job (mark as completed or failed)
   * @param {number} jobId - The job ID
   * @param {boolean} success - Whether the job succeeded
   * @param {Object} metadata - Waveform metadata (required when success=true)
   * @param {string} metadata.waveformPath - Path to the stored waveform
   * @param {number} metadata.sizeBytes - Size of the waveform in bytes
   * @param {number} [metadata.duration] - Authoritative audio duration in seconds
   * @param {number} [metadata.sampleRate] - Audio sample rate in Hz
   * @param {number} [metadata.channels] - Audio channel count
   * @param {string} [metadata.format] - Audio container/codec format
   * @param {string} errorMessage - Error message (required when success=false)
   */
  async finishSoundJob(jobId, success, metadata = {}, errorMessage = null) {
    try {
      const requestData = {
        success,
        waveformPath: metadata?.waveformPath || null,
        sizeBytes: metadata?.sizeBytes || null,
        duration: metadata?.duration ?? null,
        sampleRate: metadata?.sampleRate ?? null,
        channels: metadata?.channels ?? null,
        format: metadata?.format ?? null,
        errorMessage,
      }

      await this.apiClient.post(
        `/thumbnail-jobs/sounds/${jobId}/finish`,
        requestData
      )
      logger.info(
        success
          ? 'Marked sound waveform job as completed'
          : 'Marked sound waveform job as failed',
        {
          jobId,
          success,
          ...(success ? { waveformMetadata: metadata } : { errorMessage }),
        }
      )
    } catch (error) {
      logger.error('Failed to finish sound waveform job', {
        jobId,
        success,
        error: error.message,
      })
      throw error
    }
  }

  /**
   * Finish a texture set thumbnail job (mark as completed or failed)
   * @param {number} jobId - The job ID
   * @param {boolean} success - Whether the job succeeded
   * @param {Object} metadata - Thumbnail metadata (required when success=true)
   * @param {string} metadata.thumbnailPath - Path to the stored thumbnail
   * @param {number} metadata.sizeBytes - Size of the thumbnail in bytes
   * @param {string} errorMessage - Error message (required when success=false)
   */
  async finishTextureSetJob(
    jobId,
    success,
    metadata = {},
    errorMessage = null
  ) {
    try {
      const requestData = {
        success,
        thumbnailPath: metadata?.thumbnailPath || null,
        sizeBytes: metadata?.sizeBytes || null,
        errorMessage,
      }

      await this.apiClient.post(
        `/thumbnail-jobs/texture-sets/${jobId}/finish`,
        requestData
      )
      logger.info(
        success
          ? 'Marked texture set thumbnail job as completed'
          : 'Marked texture set thumbnail job as failed',
        {
          jobId,
          success,
          ...(success ? { thumbnailMetadata: metadata } : { errorMessage }),
        }
      )
    } catch (error) {
      logger.error('Failed to finish texture set thumbnail job', {
        jobId,
        success,
        error: error.message,
      })
      throw error
    }
  }

  /**
   * Finish an environment map thumbnail job (mark as completed or failed)
   * @param {number} jobId - The job ID
   * @param {boolean} success - Whether the job succeeded
   * @param {Object} metadata - Thumbnail metadata (required when success=true)
   * @param {string} metadata.thumbnailPath - Path to the stored thumbnail
   * @param {string} errorMessage - Error message (required when success=false)
   */
  async finishEnvironmentMapJob(
    jobId,
    success,
    metadata = {},
    errorMessage = null
  ) {
    try {
      const requestData = {
        success,
        thumbnailPath: metadata?.thumbnailPath || null,
        errorMessage,
      }

      await this.apiClient.post(
        `/thumbnail-jobs/environment-maps/${jobId}/finish`,
        requestData
      )
      logger.info(
        success
          ? 'Marked environment map thumbnail job as completed'
          : 'Marked environment map thumbnail job as failed',
        {
          jobId,
          success,
          ...(success ? { thumbnailMetadata: metadata } : { errorMessage }),
        }
      )
    } catch (error) {
      logger.error('Failed to finish environment map thumbnail job', {
        jobId,
        success,
        error: error.message,
      })
      throw error
    }
  }

  /**
   * Mark a job as completed (convenience wrapper)
   * @deprecated Use finishJob with success=true instead
   */
  async markJobCompleted(jobId, thumbnailMetadata) {
    return this.finishJob(jobId, true, thumbnailMetadata)
  }

  /**
   * Mark a job as failed (convenience wrapper)
   * @deprecated Use finishJob with success=false instead
   */
  async markJobFailed(jobId, errorMessage) {
    return this.finishJob(jobId, false, {}, errorMessage)
  }

  /**
   * Get model file information for a job
   * @param {number} modelId - The model ID
   * @param {number} [modelVersionId] - Optional model version ID (if provided, fetches version-specific file)
   * @returns {Promise<Object>} Model file information
   */
  async getModelFile(modelId, modelVersionId = null) {
    try {
      // Use version-specific endpoint if modelVersionId is provided
      const endpoint = modelVersionId
        ? `/models/${modelId}/versions/${modelVersionId}/file`
        : `/models/${modelId}/file`

      const response = await this.apiClient.get(endpoint, {
        responseType: 'stream',
      })
      return response
    } catch (error) {
      logger.error('Failed to get model file', {
        modelId,
        modelVersionId,
        error: error.message,
      })
      throw error
    }
  }

  /**
   * Claim the next runnable extraction job in a family (prompt 20 executor).
   * @param {string} workerId
   * @param {string} extractorFamily - e.g. "Geometry"
   * @returns {Promise<Object|null>} The claimed job, or null when the queue is empty.
   */
  async dequeueExtractionJob(workerId, extractorFamily) {
    try {
      const response = await this.apiClient.post('/extraction-jobs/dequeue', {
        workerId,
        extractorFamily,
      })
      // 204 No Content => empty queue.
      if (response.status === 204 || !response.data) {
        return null
      }
      return response.data
    } catch (error) {
      logger.error('Failed to dequeue extraction job', {
        workerId,
        extractorFamily,
        error: error.message,
      })
      throw error
    }
  }

  /**
   * Report the outcome of a claimed extraction job.
   * @param {number} jobId
   * @param {string} workerId - The worker holding the claim (lease check).
   * @param {boolean} success
   * @param {string|null} errorMessage
   * @param {string|null} warningDetail
   * @param {string|null} resultJson - What an operation produced, as JSON. Extraction
   *   jobs have no outcome to name and pass null.
   */
  async finishExtractionJob(
    jobId,
    workerId,
    success,
    errorMessage = null,
    warningDetail = null,
    resultJson = null
  ) {
    try {
      // workerId proves we still hold the claim; the API rejects a result from a
      // worker whose lease expired and whose job another worker has taken over.
      await this.apiClient.post(`/extraction-jobs/${jobId}/finish`, {
        workerId,
        success,
        errorMessage,
        warningDetail,
        resultJson,
      })
    } catch (error) {
      logger.error('Failed to finish extraction job', {
        jobId,
        workerId,
        success,
        error: error.message,
      })
      throw error
    }
  }

  /**
   * List the auxiliary (external) files linked to a model version - the .bin
   * buffers and textures a loose .gltf references, each with the relative path
   * the primary references it by. Used to resolve multi-file glTF imports.
   * @param {number} modelId - The model ID
   * @param {number} modelVersionId - The model version ID
   * @returns {Promise<{modelVersionId: number, auxiliaries: Array<{fileId: number, relativePath: string, originalFileName: string, sha256Hash: string, sizeBytes: number}>}>}
   */
  async getVersionAuxiliaryFiles(modelId, modelVersionId) {
    try {
      const response = await this.apiClient.get(
        `/models/${modelId}/versions/${modelVersionId}/auxiliary-files`
      )
      return response.data
    } catch (error) {
      logger.error('Failed to get version auxiliary files', {
        modelId,
        modelVersionId,
        error: error.message,
      })
      throw error
    }
  }

  /**
   * Get sound file for processing
   * @param {number} soundId - The sound ID
   * @returns {Promise<Object>} Sound file response with stream
   */
  async getSoundFile(soundId) {
    try {
      const response = await this.apiClient.get(`/sounds/${soundId}/file`, {
        responseType: 'stream',
      })
      return response
    } catch (error) {
      logger.error('Failed to get sound file', {
        soundId,
        error: error.message,
      })
      throw error
    }
  }

  /**
   * Get environment map details, including variants and file references.
   * @param {number} environmentMapId - The environment map ID
   * @returns {Promise<Object>} Environment map detail response
   */
  async getEnvironmentMap(environmentMapId) {
    try {
      const response = await this.apiClient.get(
        `/environment-maps/${environmentMapId}`
      )
      return response.data
    } catch (error) {
      logger.error('Failed to get environment map', {
        environmentMapId,
        error: error.message,
      })
      throw error
    }
  }

  /**
   * Download a file stream by file ID.
   * @param {number} fileId - The file ID
   * @returns {Promise<Object>} File response with stream
   */
  async getFile(fileId) {
    try {
      const response = await this.apiClient.get(`/files/${fileId}`, {
        responseType: 'stream',
      })
      return response
    } catch (error) {
      logger.error('Failed to get file', {
        fileId,
        error: error.message,
      })
      throw error
    }
  }

  /**
   * Upload a renderable file (e.g. converted .glb) to an existing model version.
   * @param {number} modelId - The model ID
   * @param {number} versionId - The version ID to attach the file to
   * @param {string} filePath - Path to the file to upload
   * @param {string} fileName - Original filename for the upload
   * @returns {Promise<Object>} Upload result
   */
  /**
   * Create a NEW version of a model from a file this worker produced.
   *
   * setAsActive defaults to false and the callers keep it that way: an operation's output
   * is a proposal, and promoting it would change what every scene referencing the model
   * renders before anyone had looked at it.
   *
   * @param {number} modelId
   * @param {string} filePath - Local path to the produced file.
   * @param {string} fileName - Name to store it under.
   * @param {string} description - What produced it, for the version list.
   * @param {boolean} setAsActive
   * @returns {Promise<Object>} The created version.
   */
  async createModelVersion(
    modelId,
    filePath,
    fileName,
    description,
    setAsActive = false
  ) {
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`)
    }

    const formData = new FormData()
    formData.append('file', fs.createReadStream(filePath), fileName)
    formData.append('description', description ?? '')
    formData.append('setAsActive', String(Boolean(setAsActive)))

    try {
      const response = await this.apiClient.post(
        `/models/${modelId}/versions`,
        formData,
        {
          headers: formData.getHeaders(),
          timeout: 300000,
        }
      )

      logger.info('Model version created', {
        modelId,
        fileName,
        setAsActive,
        responseData: response.data,
      })

      return response.data
    } catch (error) {
      logger.error('Failed to create model version', {
        modelId,
        fileName,
        error: error.message,
      })
      throw error
    }
  }

  async uploadRenderableFile(modelId, versionId, filePath, fileName) {
    try {
      if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`)
      }

      const formData = new FormData()
      formData.append('file', fs.createReadStream(filePath), fileName)

      const response = await this.apiClient.post(
        `/models/${modelId}/versions/${versionId}/files`,
        formData,
        {
          headers: formData.getHeaders(),
          timeout: 120000,
        }
      )

      logger.info('Renderable file uploaded successfully', {
        modelId,
        versionId,
        fileName,
        responseData: response.data,
      })

      return response.data
    } catch (error) {
      logger.error('Failed to upload renderable file', {
        modelId,
        versionId,
        fileName,
        error: error.message,
      })
      throw error
    }
  }

  /**
   * Test API connectivity
   * @returns {Promise<boolean>} True if API is reachable
   */
  async testConnection() {
    try {
      const response = await this.apiClient.get('/health')
      return response.status === 200
    } catch (error) {
      logger.warn('API health check failed', {
        error: error.message,
        baseURL: config.apiBaseUrl,
      })
      return false
    }
  }
}
