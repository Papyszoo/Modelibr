import crypto from 'crypto'
import fs from 'fs'

import { config } from './config.js'
import { JobApiClient } from './jobApiClient.js'
import { ModelFileService } from './modelFileService.js'
import { ModelDataService } from './modelDataService.js'
import { RendererPool } from './rendererPool.js'
import logger from './logger.js'

/**
 * Consumes the decoupled extraction queue (prompt 20 executor). Polls
 * `/extraction-jobs/dequeue` for the Geometry family and re-runs scene-graph
 * extraction for a model version — load the file, walk the graph, and persist the
 * rebuilt parts/derivation/search projection — without re-rendering a thumbnail.
 * This is what makes `trigger_rederive` (MCP) actually do work.
 *
 * Reuses the existing worker machinery (ModelFileService, RendererPool,
 * ModelDataService), so a re-extraction resolves multi-file glTF and rebuilds the
 * prompt-29 semantic search tokens exactly like the thumbnail path does.
 */
export class ExtractionJobProcessor {
  constructor() {
    this.jobApi = new JobApiClient()
    this.modelFileService = new ModelFileService()
    this.modelDataService = new ModelDataService()
    this.rendererPool = null
    this.pollHandle = null
    this.isPolling = false
    this.isShuttingDown = false
  }

  start() {
    const pollIntervalMs = config.extractionPollIntervalMs
    logger.info('Starting extraction-job polling', { pollIntervalMs })
    this.pollHandle = setInterval(() => this.drain(), pollIntervalMs)
  }

  async shutdown() {
    this.isShuttingDown = true
    if (this.pollHandle) {
      clearInterval(this.pollHandle)
      this.pollHandle = null
    }
    if (this.rendererPool) {
      await this.rendererPool.shutdown?.()
      this.rendererPool = null
    }
  }

  /** Claim and process jobs until the queue is empty (bounded per tick). */
  async drain() {
    if (this.isPolling || this.isShuttingDown) return
    this.isPolling = true
    try {
      let processed = 0
      // Bounded so one worker tick can't monopolise; the interval picks up the rest.
      while (processed < 10 && !this.isShuttingDown) {
        const job = await this.jobApi.dequeueExtractionJob(
          config.workerId,
          'Geometry'
        )
        if (!job) break
        await this.process(job)
        processed++
      }
    } catch (error) {
      logger.error('Extraction-job polling error', { error: error.message })
    } finally {
      this.isPolling = false
    }
  }

  async process(job) {
    const jobLogger = logger.child
      ? logger.child({ extractionJobId: job.id })
      : logger

    // Only Model geometry re-extraction is supported today; other families ack
    // as done (nothing to run) rather than dead-lettering on repeated claims.
    if (job.assetType !== 'Model') {
      await this.jobApi.finishExtractionJob(
        job.id,
        config.workerId,
        true,
        null,
        `No extraction runner for asset type ${job.assetType}; skipped.`
      )
      return
    }

    let filePath = null
    let renderer = null
    try {
      const fileInfo = await this.modelFileService.fetchModelFile(
        job.assetId,
        job.versionId
      )
      filePath = fileInfo.filePath

      if (fileInfo.fileType === 'blend') {
        // Re-extraction of .blend needs a Blender conversion pass (thumbnail path
        // owns that); skip here rather than fail the queue.
        await this.jobApi.finishExtractionJob(
          job.id,
          config.workerId,
          true,
          null,
          'Re-extraction of .blend via the extraction queue is not supported yet.'
        )
        return
      }

      let gltfResources = null
      if (fileInfo.fileType === 'gltf') {
        gltfResources = await this.modelFileService.fetchAuxiliaryResourceMap(
          job.assetId,
          job.versionId
        )
      }

      if (!this.rendererPool) {
        this.rendererPool = new RendererPool()
        await this.rendererPool.initialize()
      }
      renderer = await this.rendererPool.acquire()

      await renderer.loadModel(fileInfo.filePath, fileInfo.fileType, {
        gltfResources,
      })

      const fileSha256 = job.fileSha256 || this.hashFile(fileInfo.filePath)

      // Rebuild the scene-graph projection (parts + derivation + search docs).
      //
      // This is the SINGLE authoritative write for a re-extraction. The backend's
      // scene-graph import also refreshes the flat technical-metadata columns and
      // upserts the verbatim raw payload into the same AssetExtraction row, so a
      // follow-up saveTechnicalMetadata() would overwrite the raw v2 payload with
      // the flat v1 shape and destroy exactly what re-derivation needs. The flat
      // path is a FALLBACK, used only when no scene graph could be produced.
      const sceneGraph = await renderer.extractSceneGraph()
      if (sceneGraph) {
        const saved = await this.modelDataService.saveSceneGraph(
          job.versionId,
          fileSha256,
          sceneGraph
        )
        // saveSceneGraph swallows API errors into `false`; a transient 400/500/timeout
        // must retry the job, not silently complete it having rebuilt nothing.
        if (!saved) {
          throw new Error(
            `Persisting the scene graph for version ${job.versionId} failed.`
          )
        }
      } else {
        const technicalMetadata = await renderer.extractTechnicalMetadata()
        if (!technicalMetadata) {
          throw new Error(
            `Neither a scene graph nor technical metadata could be extracted for version ${job.versionId}.`
          )
        }
        const saved = await this.modelDataService.saveTechnicalMetadata(
          job.versionId,
          technicalMetadata
        )
        if (!saved) {
          throw new Error(
            `Persisting technical metadata for version ${job.versionId} failed.`
          )
        }
      }

      await this.jobApi.finishExtractionJob(job.id, config.workerId, true)
      jobLogger.info('Extraction job completed', {
        jobId: job.id,
        modelId: job.assetId,
        versionId: job.versionId,
      })
    } catch (error) {
      jobLogger.error('Extraction job failed', {
        jobId: job.id,
        error: error.message,
      })
      // Best-effort finish; the backend handles retry/dead-letter by attempt count.
      try {
        await this.jobApi.finishExtractionJob(
          job.id,
          config.workerId,
          false,
          error.message
        )
      } catch (finishError) {
        jobLogger.error('Failed to report extraction-job failure', {
          jobId: job.id,
          error: finishError.message,
        })
      }
    } finally {
      if (renderer && this.rendererPool) {
        await this.rendererPool.release(renderer)
      }
      if (filePath) {
        await this.modelFileService.cleanupFile(filePath)
      }
    }
  }

  hashFile(filePath) {
    const buffer = fs.readFileSync(filePath)
    return crypto.createHash('sha256').update(buffer).digest('hex')
  }
}
