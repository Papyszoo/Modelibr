import { execFile } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { fileURLToPath } from 'url'

import { config, getBlenderPath } from './config.js'
import { JobApiClient } from './jobApiClient.js'
import { ModelFileService } from './modelFileService.js'
import logger from './logger.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/**
 * Runs the Blender family of the extraction queue: the operations that change an asset
 * rather than re-reading one.
 *
 * A separate poller from ExtractionJobProcessor, and deliberately a serial one. A
 * re-derive is seconds of parsing; a Blender run is minutes of CPU and can hold gigabytes
 * of geometry, so two of them on one machine make both slower and can take the machine
 * down with it. One at a time, and the queue holds the rest.
 */
export class BlenderOperationProcessor {
  constructor() {
    this.jobApi = new JobApiClient()
    this.modelFileService = new ModelFileService()
    this.pollHandle = null
    this.isPolling = false
    this.isShuttingDown = false
  }

  start() {
    const pollIntervalMs = config.blenderPollIntervalMs
    logger.info('Starting Blender operation polling', { pollIntervalMs })
    this.pollHandle = setInterval(() => this.drain(), pollIntervalMs)
  }

  async shutdown() {
    this.isShuttingDown = true
    if (this.pollHandle) {
      clearInterval(this.pollHandle)
      this.pollHandle = null
    }
  }

  /**
   * Claim and run jobs until the queue is empty.
   *
   * Bounded at three per tick, not because the loop is expensive but because a worker
   * that has been running Blender for ten minutes should re-check whether it is being
   * shut down before starting another.
   */
  async drain() {
    if (this.isPolling || this.isShuttingDown) return
    this.isPolling = true
    try {
      let processed = 0
      while (processed < 3 && !this.isShuttingDown) {
        const job = await this.jobApi.dequeueExtractionJob(
          config.workerId,
          'Blender'
        )
        if (!job) break
        await this.process(job)
        processed++
      }
    } catch (error) {
      logger.error('Blender operation polling error', { error: error.message })
    } finally {
      this.isPolling = false
    }
  }

  async process(job) {
    const jobLogger = logger.child
      ? logger.child({ blenderJobId: job.id, operation: job.operation })
      : logger

    try {
      this.assertBlenderAvailable()

      const result = await this.run(job, jobLogger)

      await this.jobApi.finishExtractionJob(
        job.id,
        config.workerId,
        true,
        null,
        result.warning || null,
        JSON.stringify(result.payload)
      )

      jobLogger.info('Blender operation finished', {
        operation: job.operation,
        result: result.payload,
      })
    } catch (error) {
      jobLogger.error('Blender operation failed', { error: error.message })
      try {
        await this.jobApi.finishExtractionJob(
          job.id,
          config.workerId,
          false,
          error.message
        )
      } catch (finishError) {
        // The lease may have expired while Blender was running and another worker may
        // now own the job. Reporting that here beats a stack trace that looks like the
        // operation itself failed twice.
        jobLogger.error('Could not report the failure', {
          error: finishError.message,
        })
      }
    }
  }

  /**
   * Refuse early and clearly when Blender is not there.
   *
   * The backend already checks this when the operation is asked for, but the two run on
   * different machines in a normal deployment: the API may have Blender installed into
   * the shared volume while this worker's container does not see it yet.
   */
  assertBlenderAvailable() {
    if (!config.blender.enabled) {
      throw new Error(
        'Blender is not installed or is disabled. Install a Blender version in Settings, ' +
          'then ask for this operation again.'
      )
    }
  }

  async run(job, jobLogger) {
    switch (job.operation) {
      case 'uv-unwrap':
        return await this.unwrap(job, jobLogger)
      case 'bake-textures':
        return await this.bake(job, jobLogger)
      case 'mesh-analysis':
        return await this.analyse(job, jobLogger)
      default:
        throw new Error(
          `The '${job.operation}' operation is queued but not implemented yet in this worker.`
        )
    }
  }

  /**
   * Unwrap a model version and store the result as a NEW version.
   *
   * Never as a replacement: the user's file is what they uploaded, and an unwrap is a
   * proposal they can look at, keep, or delete. The new version is also NOT made active
   * for the same reason - promoting it would change what every scene referencing this
   * model renders, on the strength of an operation nobody has looked at yet.
   */
  async unwrap(job, jobLogger) {
    const parameters = this.parameters(job)
    const source = await this.modelFileService.fetchModelFile(
      job.assetId,
      job.versionId
    )

    const outputPath = path.join(
      os.tmpdir(),
      `uv-unwrap-${job.id}-${Date.now()}.glb`
    )

    try {
      const result = await this.runBlender(
        'uv_unwrap.py',
        [
          '--input',
          source.filePath,
          '--output',
          outputPath,
          '--method',
          parameters.method || 'smart',
          '--angle-limit',
          String(parameters.angleLimit ?? 66),
          '--island-margin',
          String(parameters.islandMargin ?? 0.02),
          '--channel-name',
          parameters.channelName || 'UVMap',
          ...(parameters.lightmap ? ['--lightmap'] : []),
        ],
        'UV_UNWRAP',
        jobLogger
      )

      const fileName = this.outputFileName(source.originalFileName, parameters)
      // Creating the version raises ModelUploadedEvent, which queues the normal
      // thumbnail + scene-graph extraction for it. That is what makes the unwrap
      // visible to search: hasUvs and the UV metrics are rebuilt by the same pass that
      // reads any other upload, so "find every asset that still needs unwrapping" keeps
      // answering correctly without this operation touching the index itself.
      const created = await this.jobApi.createModelVersion(
        job.assetId,
        outputPath,
        fileName,
        this.versionDescription(job, parameters),
        false
      )

      return {
        warning: result.warning || null,
        payload: {
          operation: 'uv-unwrap',
          modelId: job.assetId,
          sourceVersionId: job.versionId,
          versionId: created?.versionId ?? null,
          versionNumber: created?.versionNumber ?? null,
          setAsActive: false,
          meshesUnwrapped: result.meshesUnwrapped,
          meshesSkipped: result.meshesSkipped,
          // GLB carries UV sets by position, not by name, so this is what a consumer
          // binds a lightmap to. The name is Blender's own and does not survive export.
          uvChannelIndices: result.channelIndices,
          channelName: result.channelName,
          note: 'Written as a new, inactive version. Review it, then set it active to use it.',
        },
      }
    } finally {
      await fs.promises.unlink(outputPath).catch(() => {})
      await this.modelFileService.cleanupFile(source.filePath).catch(() => {})
    }
  }

  /**
   * Bake a model's own appearance and geometry into texture maps, imported as a texture set.
   *
   * Two operations behind one name, and `unwrap` picks which:
   *
   * - **off** - the maps are baked for the layout the model already has. Nothing about the
   *   model changes; the output is a texture set bound to the version it was baked from.
   * - **on** - a fresh non-overlapping layout is generated, the model's current appearance
   *   is baked onto it, and a NEW model version is written around the result. This is the
   *   one that helps an atlas-packed asset: its UVs are a small corner of a palette shared
   *   with hundreds of other models, so maps for that layout would be mostly empty and
   *   could not be edited without touching every model on the sheet.
   *
   * Like an unwrap, the new version is NOT made active. A bake is a proposal.
   */
  async bake(job, jobLogger) {
    const parameters = this.parameters(job)
    const source = await this.modelFileService.fetchModelFile(
      job.assetId,
      job.versionId
    )

    const outputDir = path.join(os.tmpdir(), `bake-${job.id}-${Date.now()}`)
    const outputModel = path.join(outputDir, 'rebaked.glb')
    const unwrap = Boolean(parameters.unwrap)

    try {
      await fs.promises.mkdir(outputDir, { recursive: true })

      const result = await this.runBlender(
        'bake_textures.py',
        [
          '--input',
          source.filePath,
          '--output-dir',
          outputDir,
          '--maps',
          (parameters.maps || ['diffuse', 'ao']).join(','),
          '--resolution',
          String(parameters.resolution ?? 1024),
          '--samples',
          String(parameters.samples ?? 32),
          '--margin',
          String(parameters.margin ?? 16),
          '--island-margin',
          String(parameters.islandMargin ?? 0.02),
          '--angle-limit',
          String(parameters.angleLimit ?? 66),
          ...(unwrap ? ['--unwrap', '--output-model', outputModel] : []),
        ],
        'BAKE_TEXTURES',
        jobLogger
      )

      const setName =
        parameters.setName || this.bakedSetName(source.originalFileName)
      const textureSetId = await this.importBakedSet(
        result.maps,
        setName,
        jobLogger
      )

      // The version the set describes. With a re-layout that is the version just written,
      // because the maps are laid out for ITS UVs and match no other version of the model.
      let boundVersionId = job.versionId
      let created = null

      if (unwrap) {
        try {
          created = await this.jobApi.createModelVersion(
            job.assetId,
            outputModel,
            this.bakedModelFileName(source.originalFileName),
            this.bakeVersionDescription(job, parameters, result),
            false
          )
          boundVersionId = created?.versionId ?? job.versionId
        } catch (error) {
          // The set is already in the library at this point. Saying so turns "the job
          // failed" into something the user can act on rather than hunt for.
          throw new Error(
            `${error.message} (texture set ${textureSetId} was already created from this bake ` +
              'and is not bound to anything - delete it or bind it by hand.)'
          )
        }
      }

      await this.jobApi.associateTextureSetWithModelVersion(
        textureSetId,
        boundVersionId
      )

      return {
        warning: result.warning || null,
        payload: {
          operation: 'bake-textures',
          modelId: job.assetId,
          sourceVersionId: job.versionId,
          textureSetId,
          textureSetName: setName,
          boundToVersionId: boundVersionId,
          maps: result.maps.map(m => ({
            map: m.map,
            textureType: m.textureType,
            sizeBytes: m.sizeBytes,
          })),
          resolution: result.resolution,
          samples: result.samples,
          meshesBaked: result.meshesBaked,
          unwrapped: Boolean(result.unwrapped),
          versionId: created?.versionId ?? null,
          versionNumber: created?.versionNumber ?? null,
          setAsActive: false,
          setAsDefaultTextureSet: false,
          note: unwrap
            ? 'A new, inactive version carries the baked layout and maps, and the texture set is bound to it. Review it, then set it active.'
            : 'The texture set is bound to the version it was baked from. It is not the model default - bind_texture_set makes it so.',
        },
      }
    } finally {
      await fs.promises
        .rm(outputDir, { recursive: true, force: true })
        .catch(() => {})
      await this.modelFileService.cleanupFile(source.filePath).catch(() => {})
    }
  }

  /**
   * Import the baked maps as one texture set: the first map creates it, the rest join it.
   *
   * There is no create-with-many endpoint, and inventing one for this would duplicate the
   * per-channel validation (one texture per type, the mutually exclusive pairs) that the
   * add route already enforces.
   */
  async importBakedSet(maps, setName, jobLogger) {
    const [first, ...rest] = maps
    const createdSet = await this.jobApi.createTextureSetWithFile(
      first.path,
      first.fileName,
      setName,
      first.textureType
    )

    const textureSetId = createdSet?.textureSetId
    if (!textureSetId) {
      throw new Error(
        'The texture set was created but the API did not return its id, so the remaining ' +
          'maps have nowhere to go.'
      )
    }

    for (const map of rest) {
      await this.jobApi.addTextureToSetWithFile(
        textureSetId,
        map.path,
        map.fileName,
        map.textureType
      )
    }

    jobLogger.info('Baked texture set imported', {
      textureSetId,
      channels: maps.map(m => m.textureType),
    })
    return textureSetId
  }

  /** Names the set after the model it was baked from, so it is findable without the job id. */
  bakedSetName(originalFileName) {
    const base = path
      .basename(
        originalFileName || 'model',
        path.extname(originalFileName || '')
      )
      .trim()
    return `${base || 'model'} (baked)`
  }

  bakedModelFileName(originalFileName) {
    const base = path
      .basename(
        originalFileName || 'model',
        path.extname(originalFileName || '')
      )
      .trim()
    return `${base || 'model'}-baked.glb`
  }

  bakeVersionDescription(job, parameters, result) {
    const maps = (parameters.maps || []).join(', ')
    return (
      `Baked with Blender from version ${job.versionId}: ${maps} at ` +
      `${result.resolution}px on a generated UV layout.`
    )
  }

  /**
   * Measure what only a real geometry pass can answer, and cache the half that is cacheable.
   *
   * **Two of these four metrics belong in the shared cache and two do not**, which is the
   * finding that shaped this method. The compute cache is keyed by geometry hash, and that
   * hash is deliberately blind to UVs - it exists so every copy of the same mesh shares one
   * answer. Surface area and manifoldness are functions of the geometry alone, so that
   * sharing is exactly right for them.
   *
   * UV overlap and texel density are not. A model and its re-baked version have identical
   * geometry, identical hashes, and completely different UV layouts - measured on a real
   * pair, 0.177 against 0.300 UV coverage under one hash. Writing those into a
   * hash-keyed cache would serve one version's layout as the other's, silently and
   * permanently. They come back on the job instead, tied to the version actually analysed.
   */
  async analyse(job, jobLogger) {
    const parameters = this.parameters(job)
    const source = await this.modelFileService.fetchModelFile(
      job.assetId,
      job.versionId
    )

    try {
      const result = await this.runBlender(
        'mesh_analysis.py',
        [
          '--input',
          source.filePath,
          '--overlap-samples',
          String(parameters.overlapSamples ?? 512),
        ],
        'MESH_ANALYSIS',
        jobLogger
      )

      const cached = await this.cacheGeometryMetrics(result.parts, jobLogger)

      return {
        warning: result.warning || null,
        payload: {
          operation: 'mesh-analysis',
          modelId: job.assetId,
          versionId: job.versionId,
          parts: result.parts,
          cachedMetrics: cached,
          note:
            'surface-area and manifold are cached by geometry hash and shared with every ' +
            'asset having the same geometry. uvOverlap and texelDensity are reported here ' +
            'only - they depend on the UV layout, which the geometry hash excludes.',
        },
      }
    } finally {
      await this.modelFileService.cleanupFile(source.filePath).catch(() => {})
    }
  }

  /**
   * Write the geometry-only metrics into the shared compute cache.
   *
   * A failure to cache is logged and counted, not thrown: the measurements are already in
   * the job result, and losing the whole analysis because one upsert lost a race would
   * throw away minutes of work to save a re-computation that is cheap by comparison.
   */
  async cacheGeometryMetrics(parts, jobLogger) {
    let stored = 0
    let failed = 0

    for (const part of parts) {
      if (!part.geometryHash) continue

      const metrics = [
        [
          'surface-area',
          { surfaceArea: part.surfaceArea, triangleCount: part.triangleCount },
        ],
        ['manifold', part.manifold],
      ]

      for (const [metric, payload] of metrics) {
        if (payload === null || payload === undefined) continue
        try {
          await this.jobApi.storeComputeResult(
            part.geometryHash,
            part.geometryHashVersion ?? 1,
            metric,
            payload
          )
          stored++
        } catch (error) {
          failed++
          jobLogger.error('Could not cache a metric', {
            geometryHash: part.geometryHash,
            metric,
            error: error.message,
          })
        }
      }
    }

    return { stored, failed }
  }

  /**
   * Spawn Blender on one of our bundled scripts and read its marked output.
   *
   * The script protocol is export_glb.py's, generalised: a `<PREFIX>_ERROR:` line carries
   * the precise reason for a failure, a `<PREFIX>_RESULT:` line carries the JSON result.
   * Without it the only thing to report is an exit code, and Blender's exit codes say
   * nothing about which mesh was the problem.
   */
  runBlender(scriptName, args, prefix, jobLogger) {
    const blenderPath = getBlenderPath()
    const scriptPath = path.resolve(__dirname, 'blender', scriptName)

    return new Promise((resolve, reject) => {
      execFile(
        blenderPath,
        ['-b', '--python-exit-code', '1', '-P', scriptPath, '--', ...args],
        {
          timeout: config.blenderOperationTimeoutMs,
          maxBuffer: 32 * 1024 * 1024,
        },
        (error, stdout, stderr) => {
          const output = `${stdout || ''}\n${stderr || ''}`

          if (error) {
            const marked = output
              .split('\n')
              .findLast(line => line.includes(`${prefix}_ERROR:`))
            const detail = marked
              ? marked.split(`${prefix}_ERROR:`)[1].trim()
              : (stderr || '').trim().split('\n').slice(-3).join(' ')
            const reason = error.killed
              ? `timed out after ${config.blenderOperationTimeoutMs}ms`
              : `exit ${error.code ?? 'unknown'}`

            jobLogger.error('Blender run failed', { reason, detail })
            reject(
              new Error(`Blender ${scriptName} failed (${reason}): ${detail}`)
            )
            return
          }

          const resultLine = output
            .split('\n')
            .findLast(line => line.includes(`${prefix}_RESULT:`))
          if (!resultLine) {
            reject(
              new Error(
                `Blender ${scriptName} exited cleanly but reported no result. ` +
                  'This is a script bug, not a bad model.'
              )
            )
            return
          }

          try {
            resolve(JSON.parse(resultLine.split(`${prefix}_RESULT:`)[1].trim()))
          } catch (parseError) {
            reject(
              new Error(
                `Could not read the result from Blender ${scriptName}: ${parseError.message}`
              )
            )
          }
        }
      )
    })
  }

  /** The queue stores parameters verbatim; a malformed blob must not crash the poller. */
  parameters(job) {
    if (!job.parametersJson) return {}
    try {
      return JSON.parse(job.parametersJson)
    } catch {
      return {}
    }
  }

  /**
   * Names the new file after the old one, with the operation in it.
   *
   * Always .glb: Blender exports the unwrapped result as GLB whatever came in, because a
   * single self-contained file is what the viewer and the extractor both handle best.
   * The extension change is worth being loud about - an FBX in, a GLB out.
   */
  outputFileName(originalFileName, parameters) {
    const base = path
      .basename(
        originalFileName || 'model',
        path.extname(originalFileName || '')
      )
      .trim()
    const suffix = parameters.lightmap ? 'lightmap-uvs' : 'uvs'
    return `${base || 'model'}-${suffix}.glb`
  }

  versionDescription(job, parameters) {
    const what = parameters.lightmap ? 'Lightmap UVs' : 'UVs'
    const how = parameters.method === 'angle' ? 'angle-based' : 'smart project'
    return `${what} generated with Blender (${how}) from version ${job.versionId}.`
  }
}
