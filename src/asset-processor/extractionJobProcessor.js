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
 * extraction for a model version - load the file, walk the graph, and persist the
 * rebuilt parts/derivation/search projection - without re-rendering a thumbnail.
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
    this.rendererPoolReady = null
    this.pollHandle = null
    this.isPolling = false
    this.isShuttingDown = false
  }

  start() {
    const pollIntervalMs = config.extractionPollIntervalMs
    logger.info('Starting extraction-job polling', {
      pollIntervalMs,
      concurrency: config.extractionConcurrency,
      batchSize: config.extractionBatchSize,
    })
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
    this.rendererPoolReady = null
  }

  /**
   * Claim and process jobs until the queue is empty, `extractionConcurrency` at a time
   * and bounded at `extractionBatchSize` per tick.
   *
   * Concurrent rather than sequential because extraction is I/O-shaped - fetch the file,
   * load it, walk the graph, POST the result - and one-at-a-time behind a 10-per-tick cap
   * put a hard 120 jobs/min ceiling on re-deriving a library, which is 20-40 minutes of
   * waiting for a 1,700-model re-projection. Each lane holds one renderer, and the pool is
   * sized to the same budget, so the lanes never queue on each other for one.
   */
  async drain() {
    if (this.isPolling || this.isShuttingDown) return
    this.isPolling = true
    try {
      const budget = config.extractionConcurrency
      const batchSize = config.extractionBatchSize
      let claimed = 0
      // Set once a lane finds the queue empty, so the other lanes stop asking for work
      // that is not there instead of each paying its own empty round trip.
      let drained = false

      const lane = async () => {
        while (!drained && !this.isShuttingDown && claimed < batchSize) {
          claimed++
          const job = await this.jobApi.dequeueExtractionJob(
            config.workerId,
            'Geometry'
          )
          if (!job) {
            // Give the slot back - it was counted before we knew there was nothing in it.
            claimed--
            drained = true
            break
          }
          // process() never throws: it reports its own failures to the queue. A lane that
          // died on one bad job would take the rest of the tick's parallelism with it.
          await this.process(job)
        }
      }

      await Promise.all(Array.from({ length: budget }, () => lane()))
    } catch (error) {
      logger.error('Extraction-job polling error', { error: error.message })
    } finally {
      this.isPolling = false
    }
  }

  /**
   * The renderer pool, created on first use and sized to the concurrency budget - a smaller
   * pool would serialise the lanes on acquire() and quietly undo the parallelism.
   *
   * The in-flight promise is memoised, not just the pool: several lanes reach this at the
   * same moment on the first tick, and each would otherwise build a pool of its own and
   * leave all but the last orphaned with live browser instances.
   */
  async ensureRendererPool() {
    if (this.rendererPool) return this.rendererPool
    this.rendererPoolReady ??= (async () => {
      const pool = new RendererPool(config.extractionConcurrency)
      await pool.initialize()
      this.rendererPool = pool
      return pool
    })()
    return this.rendererPoolReady
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

      const pool = await this.ensureRendererPool()
      renderer = await pool.acquire()

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
