import fs from 'fs'
import os from 'os'
import path from 'path'

import { BaseProcessor } from './baseProcessor.js'
import { SceneRenderer } from '../sceneRenderer.js'
import { SceneRenderApiService } from '../sceneRenderApiService.js'

/**
 * Photographs a scene through the running app and stores the picture.
 *
 * The renderer does the drawing (see sceneRenderer.js, and the argument there for why
 * this drives the real editor rather than assembling the scene a second time). This
 * class is the queue side of it: claim, render, upload, close the job.
 */
export class SceneRenderProcessor extends BaseProcessor {
  constructor() {
    super()
    this.sceneRenderer = null
    this.sceneRenderApiService = new SceneRenderApiService()
  }

  get processorType() {
    return 'scene-render'
  }

  /**
   * @param {Object} job - Queue job; needs sceneId and sceneViewpoint.
   * @param {Object} jobLogger - Logger with job context.
   * @param {AbortSignal} [signal] - Set when the queue times this job out.
   */
  async process(job, jobLogger, signal) {
    const sceneId = job.sceneId
    if (!sceneId) {
      throw new Error('Job is missing sceneId')
    }

    if (!this.sceneRenderer) {
      this.sceneRenderer = new SceneRenderer()
      await this.sceneRenderer.initialize()
    }

    const { image, status, timedOut, width, height } =
      await this.sceneRenderer.render(
        { sceneId, viewpoint: job.sceneViewpoint || 'iso' },
        jobLogger
      )

    if (signal?.aborted) {
      // The queue gave up on this job while the page was still loading. Returning
      // early skips the upload: storing a render against a job another worker may
      // have already reclaimed would leave two pictures racing for one row.
      throw new Error('Scene render aborted by job timeout')
    }

    // The renderer hands back a Buffer, and the upload is multipart - so the bytes
    // touch disk exactly once, in the OS temp dir, and are removed either way.
    const tempPath = path.join(
      os.tmpdir(),
      `scene-render-${job.id}-${Date.now()}.png`
    )

    try {
      await fs.promises.writeFile(tempPath, image)

      const upload = await this.sceneRenderApiService.uploadRender(
        job.id,
        tempPath,
        {
          width,
          height,
          nodesLoaded: status?.nodesLoaded ?? 0,
          nodesFailed: status?.nodesFailed ?? 0,
          timedOut,
        }
      )

      if (!upload.success) {
        throw new Error(`Failed to store scene render: ${upload.error}`)
      }

      jobLogger.info('Scene render stored', {
        sceneId,
        renderId: upload.data?.renderId,
        nodesLoaded: status?.nodesLoaded,
        nodesFailed: status?.nodesFailed,
        timedOut,
      })

      return {
        renderId: upload.data?.renderId,
        sceneId,
        viewpoint: job.sceneViewpoint || 'iso',
        nodesLoaded: status?.nodesLoaded ?? 0,
        nodesFailed: status?.nodesFailed ?? 0,
        timedOut,
      }
    } finally {
      await fs.promises.unlink(tempPath).catch(() => {})
    }
  }

  /**
   * Scene jobs finish through their own endpoint. The default one resolves a Thumbnail
   * for a model version and answers with a ModelId, neither of which a scene job has.
   */
  async markCompleted(job) {
    await this.sceneRenderApiService.finishJob(job.id, true)
  }

  async markFailed(job, errorMessage) {
    await this.sceneRenderApiService.finishJob(job.id, false, errorMessage)
  }

  async dispose() {
    if (this.sceneRenderer) {
      await this.sceneRenderer.dispose()
      this.sceneRenderer = null
    }
  }
}
