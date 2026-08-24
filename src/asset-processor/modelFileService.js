import fs from 'fs'
import path from 'path'
import os from 'os'
import { JobApiClient } from './jobApiClient.js'
import { writeStreamToFile } from './streamFile.js'
import logger from './logger.js'

/**
 * Service for fetching and managing model files
 */
export class ModelFileService {
  constructor() {
    this.jobService = new JobApiClient()
    this.tempDir = path.join(os.tmpdir(), 'modelibr-worker')
    this.ensureTempDirectory()
  }

  /**
   * Ensure temporary directory exists
   */
  ensureTempDirectory() {
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true })
      logger.debug('Created temporary directory', { tempDir: this.tempDir })
    }
  }

  /**
   * Fetch model file for processing
   * @param {number} modelId - The model ID
   * @param {number} [modelVersionId] - Optional model version ID
   * @returns {Promise<{filePath: string, fileType: string, originalFileName: string}>} File information
   */
  async fetchModelFile(modelId, modelVersionId = null) {
    logger.debug('Fetching model file', { modelId, modelVersionId })

    // Retry logic for transient errors (network issues, server overload)
    // 404 errors are NOT retried - they indicate the model/version is deleted
    const maxRetries = 3
    const retryDelay = 1000 // 1 second

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Get file stream from API
        const response = await this.jobService.getModelFile(
          modelId,
          modelVersionId
        )

        if (!response || !response.data) {
          throw new Error('No file data received from API')
        }

        return await this.processFileResponse(response, modelId, modelVersionId)
      } catch (error) {
        logger.warn('Failed to fetch model file', {
          modelId,
          modelVersionId,
          attempt,
          maxRetries,
          error: error.message,
        })

        // If it's a 404/not-found error, fail immediately - model is likely deleted
        if (this.isFileNotFoundError(error)) {
          throw error
        }

        // For transient errors, retry unless it's the last attempt
        if (attempt === maxRetries) {
          throw error
        }

        // Wait before retrying
        logger.info('Retrying model file fetch after delay', {
          modelId,
          modelVersionId,
          attempt,
          retryDelayMs: retryDelay,
        })
        await this.sleep(retryDelay)
      }
    }
  }

  /**
   * Process the file response from API
   * @param {Object} response - API response
   * @param {number} modelId - Model ID for error context
   * @param {number} [modelVersionId] - Optional model version ID for error context
   * @returns {Promise<{filePath: string, fileType: string, originalFileName: string}>} File information
   */
  async processFileResponse(response, modelId, modelVersionId = null) {
    // Extract file information from response headers
    const contentDisposition = response.headers['content-disposition'] || ''
    const _contentType =
      response.headers['content-type'] || 'application/octet-stream'

    // Parse filename from content-disposition header
    let originalFileName = this.parseFilenameFromHeader(contentDisposition)
    if (!originalFileName) {
      originalFileName = `model_${modelId}`
    }

    // Determine file extension and type
    const fileExtension = path.extname(originalFileName).toLowerCase()
    const fileType = this.getFileTypeFromExtension(fileExtension)

    if (!fileType) {
      throw new Error(`Unsupported file type: ${fileExtension}`)
    }

    // Create temporary file
    const tempFileName = `${modelId}_${Date.now()}${fileExtension}`
    const tempFilePath = path.join(this.tempDir, tempFileName)

    // Write stream to temporary file
    await this.writeStreamToFile(response.data, tempFilePath)

    // Everything after the write is still this function's responsibility for the
    // file: it returns a path or it throws, and a throw means nobody downstream
    // has the path to clean up with. Inspecting the result is the case that
    // actually happens - a stat on a file the filesystem filled to capacity
    // mid-write.
    try {
      logger.info('Model file fetched successfully', {
        modelId,
        modelVersionId,
        originalFileName,
        fileType,
        tempFilePath,
        fileSize: fs.statSync(tempFilePath).size,
      })
    } catch (error) {
      await this.cleanupFile(tempFilePath)
      throw error
    }

    return {
      filePath: tempFilePath,
      fileType,
      originalFileName,
    }
  }

  /**
   * Check if error is related to file not being found (race condition)
   * @param {Error} error - The error to check
   * @returns {boolean} True if it's a file not found error
   */
  isFileNotFoundError(error) {
    const message = error.message.toLowerCase()
    return (
      message.includes('not found') ||
      message.includes('404') ||
      error.response?.status === 404
    )
  }

  /**
   * Sleep utility for retry delays
   * @param {number} ms - Milliseconds to sleep
   * @returns {Promise<void>}
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  /**
   * Clean up temporary file
   * @param {string} filePath - Path to temporary file
   */
  async cleanupFile(filePath) {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath)
        logger.debug('Cleaned up temporary file', { filePath })
      }
      return true
    } catch (error) {
      logger.warn('Failed to cleanup temporary file', {
        filePath,
        error: error.message,
      })
      return false
    }
  }

  /**
   * Fetch a model version onto disk **with its siblings next to it**, in a
   * directory of its own.
   *
   * The data-URL map further down is for three.js, which resolves references
   * through a LoadingManager and never touches a filesystem. Blender does the
   * opposite: it opens the file and follows every reference the file itself
   * contains, by relative path. Handed a lone .gltf its buffers are missing, and
   * handed a lone .obj its .mtl is missing.
   *
   * **This throws rather than degrading, which is the difference between it and
   * the render path.** A thumbnail rendered without a texture is a worse picture
   * that a person looks at and re-queues. A bake or an unwrap run without the
   * .mtl produces a NEW model version, published as the truth, whose materials
   * are silently wrong - and the OBJ case is the quiet one, because the geometry
   * still loads, so nothing looks broken. There is no version of "proceed with
   * what we have" that is correct here: either every advertised sibling is on
   * disk or the operation has not been set up and must not run.
   *
   * Returns the same shape as {@link fetchModelFile} plus `workDir`, which the
   * caller must clean up instead of the file. On every failure path - including
   * the ones before that object exists - the primary and the work directory are
   * removed here, because the caller has nothing to clean up with.
   *
   * @param {number} modelId
   * @param {number} modelVersionId
   * @returns {Promise<{filePath: string, fileType: string, originalFileName: string, workDir: string, auxiliaryCount: number}>}
   * @throws {Error} when the auxiliary manifest cannot be read, an advertised
   *   auxiliary cannot be downloaded, or one names a path outside the work
   *   directory.
   */
  async fetchModelFileWithAuxiliaries(modelId, modelVersionId = null) {
    // Same shape as fetchModelFile's own retry: transient network trouble while
    // staging is not a reason to fail an operation, but exhausting the attempts
    // is - the alternative is publishing a result computed from half a model.
    const maxRetries = 3
    const retryDelay = 1000

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      let staged = null
      try {
        staged = await this.stageModelWithAuxiliaries(modelId, modelVersionId)
        return staged
      } catch (error) {
        // Nothing partially staged survives an attempt, successful or not.
        await this.cleanupDirectory(staged?.workDir ?? error.workDir)

        const lastAttempt = attempt === maxRetries
        logger.warn('Failed to stage a model with its auxiliary files', {
          modelId,
          modelVersionId,
          attempt,
          maxRetries,
          error: error.message,
        })

        if (lastAttempt || this.isFileNotFoundError(error)) {
          throw error
        }

        await this.sleep(retryDelay * attempt)
      }
    }
  }

  /**
   * One staging attempt. Split out so the retry above has a single thing to call
   * and a single thing to clean up: every path that creates the work directory
   * either returns it on the result or attaches it to the thrown error.
   *
   * @param {number} modelId
   * @param {number} modelVersionId
   */
  async stageModelWithAuxiliaries(modelId, modelVersionId) {
    const source = await this.fetchModelFile(modelId, modelVersionId)

    let workDir = null
    try {
      workDir = fs.mkdtempSync(path.join(this.tempDir, `model-${modelId}-`))

      // The primary keeps its ORIGINAL name inside the work directory: a loose
      // .gltf's references are relative to the file, and renaming it to a temp
      // name is harmless, but a .mtl referenced by name from an .obj is not.
      const primaryPath = path.join(
        workDir,
        path.basename(source.originalFileName)
      )
      fs.copyFileSync(source.filePath, primaryPath)

      const auxiliaryCount = await this.stageAuxiliaries(
        modelId,
        modelVersionId,
        workDir
      )

      logger.info('Model file staged with auxiliaries', {
        modelId,
        modelVersionId,
        workDir,
        auxiliaryCount,
      })

      return {
        filePath: primaryPath,
        fileType: source.fileType,
        originalFileName: source.originalFileName,
        workDir,
        auxiliaryCount,
      }
    } catch (error) {
      // The work directory may not be on any result yet, so the retry above
      // cannot find it any other way.
      error.workDir = workDir
      throw error
    } finally {
      // The download landed outside the work directory and is copied, not moved,
      // so it is this function's to remove either way.
      await this.cleanupFile(source.filePath)
    }
  }

  /**
   * Download every auxiliary the version advertises into `workDir`.
   *
   * @param {number} modelId
   * @param {number} modelVersionId
   * @param {string} workDir
   * @returns {Promise<number>} how many were staged
   */
  async stageAuxiliaries(modelId, modelVersionId, workDir) {
    // No version id means there is nothing to ask about - a single-file upload
    // reached here through a path that never had a version. That is genuinely
    // primary-only, not a manifest that failed to load.
    if (!modelVersionId) {
      return 0
    }

    // NOT caught. An unreadable manifest is indistinguishable from an empty one
    // once it has been swallowed, and those two mean opposite things: "this model
    // has no siblings" and "this model may have siblings we did not fetch".
    const list = await this.jobService.getVersionAuxiliaryFiles(
      modelId,
      modelVersionId
    )

    const auxiliaries = list?.auxiliaries || []
    let staged = 0

    for (const aux of auxiliaries) {
      // The relative path is normalised server-side, but it arrives over HTTP
      // and lands on a filesystem here, so it is checked again rather than
      // trusted: a '../' in it would write outside the work directory. Refused
      // rather than skipped - a path that tried to escape is not a sibling this
      // operation should quietly do without, it is one somebody built wrong.
      const target = path.resolve(workDir, aux.relativePath)
      if (target === workDir || !target.startsWith(workDir + path.sep)) {
        throw new Error(
          `Auxiliary file '${aux.relativePath}' resolves outside the staging ` +
            `directory. Refusing to run the operation on a partial model.`
        )
      }

      try {
        const response = await this.jobService.getFile(aux.fileId)
        if (!response || !response.data) {
          throw new Error('No file data received from API')
        }
        fs.mkdirSync(path.dirname(target), { recursive: true })
        await this.writeStreamToFile(response.data, target)
        staged++
      } catch (error) {
        throw new Error(
          `Could not stage auxiliary file '${aux.relativePath}' ` +
            `(file ${aux.fileId}): ${error.message}. Refusing to run the ` +
            `operation on a partial model.`
        )
      }
    }

    return staged
  }

  /**
   * Remove a staging directory created by {@link fetchModelFileWithAuxiliaries}.
   * @param {string} workDir
   */
  async cleanupDirectory(workDir) {
    try {
      if (workDir && fs.existsSync(workDir)) {
        fs.rmSync(workDir, { recursive: true, force: true })
        logger.debug('Cleaned up staging directory', { workDir })
      }
      return true
    } catch (error) {
      logger.warn('Failed to cleanup staging directory', {
        workDir,
        error: error.message,
      })
      return false
    }
  }

  /**
   * Fetch the auxiliary (external) glTF resources for a model version and return
   * them as a { relativePath: dataUrl } map for the page's LoadingManager to
   * resolve. Downloads each already-uploaded sibling (.bin/textures) and inlines
   * it as a data URL - offline by construction, no external network. Best-effort:
   * a failed list or download leaves the reference unresolved rather than failing
   * the whole render (matches the "Unresolved reference" warning path).
   * @param {number} modelId
   * @param {number} modelVersionId
   * @returns {Promise<Record<string, string>|null>} Resource map, or null if none.
   */
  async fetchAuxiliaryResourceMap(modelId, modelVersionId) {
    if (!modelVersionId) return null

    let list
    try {
      list = await this.jobService.getVersionAuxiliaryFiles(
        modelId,
        modelVersionId
      )
    } catch (error) {
      logger.warn(
        'Failed to fetch auxiliary file list; rendering without external glTF resources',
        { modelId, modelVersionId, error: error.message }
      )
      return null
    }

    const auxiliaries = list?.auxiliaries || []
    if (auxiliaries.length === 0) return null

    const resources = {}
    for (const aux of auxiliaries) {
      try {
        const response = await this.jobService.getFile(aux.fileId)
        const buffer = await this.streamToBuffer(response.data)
        const mime = this.mimeFromFileName(aux.originalFileName)
        resources[aux.relativePath] =
          `data:${mime};base64,${buffer.toString('base64')}`
      } catch (error) {
        logger.warn(
          'Failed to download auxiliary file; leaving reference unresolved',
          {
            fileId: aux.fileId,
            relativePath: aux.relativePath,
            error: error.message,
          }
        )
      }
    }

    const resolvedCount = Object.keys(resources).length
    logger.info('Fetched auxiliary glTF resources', {
      modelId,
      modelVersionId,
      requested: auxiliaries.length,
      resolved: resolvedCount,
    })

    return resolvedCount > 0 ? resources : null
  }

  /**
   * Collect a readable stream into a Buffer.
   * @param {ReadableStream} stream
   * @returns {Promise<Buffer>}
   */
  async streamToBuffer(stream) {
    const chunks = []
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    }
    return Buffer.concat(chunks)
  }

  /**
   * Map an auxiliary file name to a MIME type so an inlined data URL decodes
   * correctly in the browser (image textures) or streams as bytes (.bin).
   * @param {string} fileName
   * @returns {string}
   */
  mimeFromFileName(fileName) {
    const ext = path.extname(fileName || '').toLowerCase()
    const mimes = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.webp': 'image/webp',
      '.gif': 'image/gif',
      '.bmp': 'image/bmp',
      '.ktx2': 'image/ktx2',
      '.basis': 'application/octet-stream',
      '.bin': 'application/octet-stream',
    }
    return mimes[ext] || 'application/octet-stream'
  }

  /**
   * Write a stream to a file, removing the partial file if it cannot be finished.
   *
   * The implementation is shared - see `streamFile.js` for why a hand-rolled
   * `pipe` + `destroy()` + `unlinkSync()` could not be made correct. Kept as a
   * method because callers stub it.
   *
   * @param {ReadableStream} stream - Input stream
   * @param {string} filePath - Output file path
   * @returns {Promise<void>}
   */
  async writeStreamToFile(stream, filePath) {
    return writeStreamToFile(stream, filePath)
  }

  /**
   * Parse filename from Content-Disposition header
   * @param {string} contentDisposition - Content-Disposition header value
   * @returns {string|null} Parsed filename or null
   */
  parseFilenameFromHeader(contentDisposition) {
    if (!contentDisposition) return null

    // Try different patterns to extract filename
    const patterns = [
      /filename\*=UTF-8''([^;]+)/,
      /filename="([^"]+)"/,
      /filename=([^;]+)/,
    ]

    for (const pattern of patterns) {
      const match = contentDisposition.match(pattern)
      if (match) {
        let filename = match[1]
        // Decode URI component if needed
        try {
          filename = decodeURIComponent(filename)
        } catch {
          // Keep original if decode fails
        }
        return filename.trim()
      }
    }

    return null
  }

  /**
   * Get file type from extension
   * @param {string} extension - File extension (with dot)
   * @returns {string|null} File type or null if unsupported
   */
  getFileTypeFromExtension(extension) {
    const supportedTypes = {
      '.obj': 'obj',
      '.fbx': 'fbx',
      '.gltf': 'gltf',
      '.glb': 'glb',
      '.stl': 'stl',
      '.3mf': '3mf',
      '.blend': 'blend',
    }

    return supportedTypes[extension.toLowerCase()] || null
  }

  /**
   * Remove everything in the temp directory older than `maxAgeMs` - files and
   * staging directories alike.
   *
   * The directories are the reason this is not a one-liner. A crash between
   * `mkdtemp` and the operation's own cleanup leaves a `model-<id>-XXXXXX/`
   * behind, and this sweep used to call `unlinkSync` on every entry - which
   * fails with EPERM/EISDIR on a directory, threw out of the loop, and so left
   * not only that directory but every entry after it, forever. On a worker that
   * stages a model per job, "forever" fills the disk.
   *
   * One broken entry no longer ends the sweep either: each is removed on its
   * own, and what could not be removed is counted and reported rather than
   * silently taking the rest with it.
   *
   * @param {number} maxAgeMs - Maximum age in milliseconds (default: 1 hour)
   * @returns {Promise<{cleanedCount: number, failedCount: number}>}
   */
  async cleanupOldFiles(maxAgeMs = 60 * 60 * 1000) {
    const summary = { cleanedCount: 0, failedCount: 0 }

    try {
      if (!fs.existsSync(this.tempDir)) return summary

      const entries = fs.readdirSync(this.tempDir)
      const now = Date.now()

      for (const entry of entries) {
        const entryPath = path.join(this.tempDir, entry)

        try {
          // lstat, not stat: a dangling symlink is exactly the kind of entry
          // that used to abort the whole sweep, and it is still stale rubbish
          // that should go.
          const stats = fs.lstatSync(entryPath)
          if (now - stats.mtime.getTime() <= maxAgeMs) continue

          const removed = stats.isDirectory()
            ? await this.cleanupDirectory(entryPath)
            : await this.cleanupFile(entryPath)

          if (removed) {
            summary.cleanedCount++
          } else {
            summary.failedCount++
          }
        } catch (error) {
          // Reading one entry failed - it vanished under us, or its permissions
          // changed. Note it and carry on to the rest.
          summary.failedCount++
          logger.warn('Skipped an unreadable temporary entry', {
            entryPath,
            error: error.message,
          })
        }
      }

      if (summary.cleanedCount > 0 || summary.failedCount > 0) {
        logger.info('Cleaned up old temporary entries', {
          ...summary,
          tempDir: this.tempDir,
        })
      }
    } catch (error) {
      logger.warn('Failed to cleanup old files', {
        error: error.message,
        tempDir: this.tempDir,
      })
    }

    return summary
  }
}
