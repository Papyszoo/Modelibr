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
          versionId: created?.id ?? created?.versionId ?? null,
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
