import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

import { config } from '../config.js'
import { BlenderOperationProcessor } from '../blenderOperationProcessor.js'

vi.mock('../logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    child: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
      error: vi.fn(),
    }),
  },
}))

/**
 * The queue side of a Blender operation. Blender itself is stubbed - what is tested here
 * is everything that decides whether the job is reported honestly: the guard when Blender
 * is missing, that the produced version is created inactive, that a partial run's warning
 * survives to the job, and that a failure is reported rather than swallowed.
 */
describe('BlenderOperationProcessor', () => {
  let processor
  let blenderEnabledBefore

  const job = {
    id: 5,
    assetType: 'Model',
    assetId: 42,
    versionId: 7,
    operation: 'uv-unwrap',
    parametersJson: JSON.stringify({
      method: 'smart',
      angleLimit: 66,
      islandMargin: 0.02,
      lightmap: false,
      channelName: 'UVMap',
    }),
  }

  beforeEach(() => {
    blenderEnabledBefore = config.blender.enabled
    config.blender.enabled = true

    processor = new BlenderOperationProcessor()
    processor.modelFileService = {
      fetchModelFile: vi.fn().mockResolvedValue({
        filePath: '/tmp/chair.fbx',
        fileType: 'fbx',
        originalFileName: 'chair.fbx',
      }),
      cleanupFile: vi.fn().mockResolvedValue(undefined),
    }
    processor.jobApi = {
      dequeueExtractionJob: vi.fn().mockResolvedValue(null),
      finishExtractionJob: vi.fn().mockResolvedValue(undefined),
      // The shape CreateModelVersionResponse actually crosses the wire as.
      createModelVersion: vi
        .fn()
        .mockResolvedValue({ versionId: 13, versionNumber: 2, fileId: 5 }),
    }
    processor.runBlender = vi.fn().mockResolvedValue({
      meshesUnwrapped: 3,
      meshesSkipped: [],
      channelName: 'UVMap',
      channelIndices: [0],
      method: 'smart',
    })
  })

  afterEach(() => {
    config.blender.enabled = blenderEnabledBefore
  })

  it('stores the unwrap as a new INACTIVE version', async () => {
    // The user's file is what they uploaded. Promoting the result would change what every
    // scene referencing this model renders, on the strength of an unreviewed operation.
    await processor.process(job)

    expect(processor.jobApi.createModelVersion).toHaveBeenCalledWith(
      42,
      expect.stringContaining('uv-unwrap-5'),
      'chair-uvs.glb',
      expect.stringContaining('version 7'),
      false
    )
  })

  it('reports the new version id back on the job', async () => {
    await processor.process(job)

    const [, , success, error, warning, resultJson] =
      processor.jobApi.finishExtractionJob.mock.calls[0]
    expect(success).toBe(true)
    expect(error).toBeNull()
    expect(warning).toBeNull()

    const result = JSON.parse(resultJson)
    expect(result.versionId).toBe(13)
    expect(result.sourceVersionId).toBe(7)
    expect(result.meshesUnwrapped).toBe(3)
    expect(result.uvChannelIndices).toEqual([0])
    expect(result.setAsActive).toBe(false)
  })

  it("carries a partial run's warning through to the job", async () => {
    processor.runBlender = vi.fn().mockResolvedValue({
      meshesUnwrapped: 2,
      meshesSkipped: [{ object: 'Curve', reason: 'no faces' }],
      channelName: 'UVMap',
      channelIndices: [0],
      warning: '1 of 3 meshes had no marked seams',
    })

    await processor.process(job)

    const [, , success, , warning] =
      processor.jobApi.finishExtractionJob.mock.calls[0]
    expect(success).toBe(true)
    expect(warning).toBe('1 of 3 meshes had no marked seams')
  })

  it('refuses clearly when Blender is not installed on this worker', async () => {
    // The backend checks this too, but the two run on different machines: the API can see
    // a Blender install in the shared volume that this container does not.
    config.blender.enabled = false

    await processor.process(job)

    expect(processor.modelFileService.fetchModelFile).not.toHaveBeenCalled()
    const [, , success, errorMessage] =
      processor.jobApi.finishExtractionJob.mock.calls[0]
    expect(success).toBe(false)
    expect(errorMessage).toContain('Blender is not installed')
  })

  it('reports a failed Blender run instead of silently completing', async () => {
    processor.runBlender = vi
      .fn()
      .mockRejectedValue(
        new Error('Blender uv_unwrap.py failed (exit 1): no mesh objects')
      )

    await processor.process(job)

    const [, , success, errorMessage] =
      processor.jobApi.finishExtractionJob.mock.calls[0]
    expect(success).toBe(false)
    expect(errorMessage).toContain('no mesh objects')
    expect(processor.jobApi.createModelVersion).not.toHaveBeenCalled()
  })

  it('fails an operation it does not implement rather than reporting success', async () => {
    await processor.process({ ...job, operation: 'bake-textures' })

    const [, , success, errorMessage] =
      processor.jobApi.finishExtractionJob.mock.calls[0]
    expect(success).toBe(false)
    expect(errorMessage).toContain('bake-textures')
  })

  it('survives parameters it cannot parse', async () => {
    // The queue stores them verbatim, so a malformed blob must not take the poller down.
    await processor.process({ ...job, parametersJson: '{not json' })

    const [, , success] = processor.jobApi.finishExtractionJob.mock.calls[0]
    expect(success).toBe(true)
  })

  it('names a lightmap unwrap for what it is', () => {
    expect(processor.outputFileName('chair.fbx', { lightmap: true })).toBe(
      'chair-lightmap-uvs.glb'
    )
  })

  it('always writes a .glb, whatever came in', () => {
    // Worth being loud about: an FBX in, a GLB out.
    expect(processor.outputFileName('chair.fbx', {})).toBe('chair-uvs.glb')
    expect(processor.outputFileName('chair.obj', {})).toBe('chair-uvs.glb')
  })
})
