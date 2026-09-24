import fs from 'fs'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { SceneRenderProcessor } from '../processors/sceneRenderProcessor.js'

/**
 * The processor's job is small but every step of it is a place where a render can be
 * stored against the wrong thing, or a job can be left open. These cover the requested
 * viewpoint, successful and failed storage, readiness-timeout truth, and both timeout
 * layers that must prevent a late image from being published.
 */
describe('SceneRenderProcessor', () => {
  let processor
  let jobLogger

  const image = Buffer.from('fake-png-bytes')

  afterEach(() => {
    vi.restoreAllMocks()
  })

  beforeEach(() => {
    processor = new SceneRenderProcessor()
    jobLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }

    processor.sceneRenderer = {
      render: vi.fn().mockResolvedValue({
        image,
        status: { ready: true, nodesLoaded: 2, nodesFailed: 0 },
        timedOut: false,
        width: 768,
        height: 768,
      }),
      dispose: vi.fn(),
    }

    processor.sceneRenderApiService = {
      uploadRender: vi.fn().mockResolvedValue({
        success: true,
        data: { renderId: 7 },
      }),
      finishJob: vi.fn().mockResolvedValue(undefined),
    }
    processor.jobEventService = {
      logJobStarted: vi.fn().mockResolvedValue(undefined),
      logJobCompleted: vi.fn().mockResolvedValue(undefined),
      logJobFailed: vi.fn().mockResolvedValue(undefined),
    }
  })

  it('renders the viewpoint the job asked for and reports what drew', async () => {
    const result = await processor.process(
      { id: 5, sceneId: 12, sceneViewpoint: 'front' },
      jobLogger
    )

    expect(processor.sceneRenderer.render).toHaveBeenCalledWith(
      { sceneId: 12, viewpoint: 'front' },
      jobLogger
    )
    expect(result).toMatchObject({
      renderId: 7,
      sceneId: 12,
      viewpoint: 'front',
      nodesLoaded: 2,
      nodesFailed: 0,
      timedOut: false,
    })
  })

  it('uploads the rendered bytes with the viewport they were shot at', async () => {
    await processor.process({ id: 5, sceneId: 12 }, jobLogger)

    const [jobId, renderPath, metadata] =
      processor.sceneRenderApiService.uploadRender.mock.calls[0]

    expect(jobId).toBe(5)
    expect(renderPath).toMatch(/scene-render-5-\d+\.png$/)
    expect(metadata).toMatchObject({
      width: 768,
      height: 768,
      nodesLoaded: 2,
      nodesFailed: 0,
      timedOut: false,
    })
  })

  it('fails the job when the render cannot be stored', async () => {
    // Silence is the danger here: an upload that failed but returned normally would
    // complete the job, and the agent polling for the render would be told it is
    // ready and then handed a 404.
    processor.sceneRenderApiService.uploadRender.mockResolvedValue({
      success: false,
      error: 'disk full',
    })

    await expect(
      processor.process({ id: 5, sceneId: 12 }, jobLogger)
    ).rejects.toThrow(/disk full/)
  })

  it('marks a readiness timeout failed without writing or uploading an image', async () => {
    const message =
      'Scene 12 did not become render-ready within 125ms; no image was captured'
    const writeFile = vi.spyOn(fs.promises, 'writeFile')
    processor.sceneRenderer.render.mockRejectedValueOnce(new Error(message))

    await expect(
      processor.execute({ id: 5, sceneId: 12, sceneViewpoint: 'front' })
    ).rejects.toThrow(message)

    expect(writeFile).not.toHaveBeenCalled()
    expect(processor.sceneRenderApiService.uploadRender).not.toHaveBeenCalled()
    expect(processor.sceneRenderApiService.finishJob).toHaveBeenCalledWith(
      5,
      false,
      message
    )
  })

  it('rejects a legacy timed-out renderer result before creating an output path', async () => {
    const writeFile = vi.spyOn(fs.promises, 'writeFile')
    processor.sceneRenderer.render.mockResolvedValueOnce({
      image,
      status: { ready: false, nodesLoaded: 1, nodesFailed: 1 },
      timedOut: true,
      width: 768,
      height: 768,
    })

    await expect(processor.execute({ id: 5, sceneId: 12 })).rejects.toThrow(
      /readiness timeout.*no image was captured/
    )

    expect(writeFile).not.toHaveBeenCalled()
    expect(processor.sceneRenderApiService.uploadRender).not.toHaveBeenCalled()
    expect(processor.sceneRenderApiService.finishJob).toHaveBeenCalledWith(
      5,
      false,
      expect.stringMatching(/readiness timeout.*no image was captured/)
    )
  })

  it('completes a ready render after its image is stored', async () => {
    await processor.execute({ id: 5, sceneId: 12 })

    expect(processor.sceneRenderApiService.uploadRender).toHaveBeenCalledOnce()
    expect(processor.sceneRenderApiService.finishJob).toHaveBeenCalledWith(
      5,
      true
    )
  })

  it('stores nothing for a job the queue has already timed out', async () => {
    // The queue reports a timed-out job failed and lets another worker reclaim it.
    // Uploading late would put a second picture on a row that has moved on.
    const signal = { aborted: true }

    await expect(
      processor.process({ id: 5, sceneId: 12 }, jobLogger, signal)
    ).rejects.toThrow(/aborted/)

    expect(processor.sceneRenderApiService.uploadRender).not.toHaveBeenCalled()
  })

  it('refuses a job with no scene to render', async () => {
    await expect(processor.process({ id: 5 }, jobLogger)).rejects.toThrow(
      /sceneId/
    )
  })

  it('finishes scene jobs through the scene endpoint, not the model one', async () => {
    // The default finish path resolves a Thumbnail for a model version and answers
    // with a ModelId - a scene job has neither, and the call 400s.
    await processor.markCompleted({ id: 5 })
    expect(processor.sceneRenderApiService.finishJob).toHaveBeenCalledWith(
      5,
      true
    )

    await processor.markFailed({ id: 5 }, 'boom')
    expect(processor.sceneRenderApiService.finishJob).toHaveBeenCalledWith(
      5,
      false,
      'boom'
    )
  })
})
