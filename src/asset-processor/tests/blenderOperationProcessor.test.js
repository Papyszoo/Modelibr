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
      // The Blender operations stage the model in a directory WITH its siblings:
      // Blender resolves a loose glTF's .bin and an OBJ's .mtl off the filesystem,
      // so handing it the primary file alone loses geometry or materials.
      fetchModelFileWithAuxiliaries: vi.fn().mockResolvedValue({
        filePath: '/tmp/work-chair/chair.fbx',
        fileType: 'fbx',
        originalFileName: 'chair.fbx',
        workDir: '/tmp/work-chair',
        auxiliaryCount: 0,
      }),
      fetchModelFile: vi.fn().mockResolvedValue({
        filePath: '/tmp/chair.fbx',
        fileType: 'fbx',
        originalFileName: 'chair.fbx',
      }),
      cleanupFile: vi.fn().mockResolvedValue(undefined),
      cleanupDirectory: vi.fn().mockResolvedValue(undefined),
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
    // Was bake-textures until the bake shipped. convert-format is still queued-but-refused,
    // which is what this guards: the queue accepts the whole family, the worker implements
    // part of it, and the gap has to be reported rather than reported as success.
    await processor.process({ ...job, operation: 'convert-format' })

    const [, , success, errorMessage] =
      processor.jobApi.finishExtractionJob.mock.calls[0]
    expect(success).toBe(false)
    expect(errorMessage).toContain('convert-format')
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

/**
 * The bake. Blender is stubbed here too - what is under test is what happens to what it
 * produced: that the maps become ONE texture set rather than loose textures, that the set
 * is bound to the version its layout actually matches, and that a re-layout bake's new
 * version arrives inactive like an unwrap's.
 */
describe('BlenderOperationProcessor - bake-textures', () => {
  let processor
  let blenderEnabledBefore

  const job = {
    id: 8,
    assetType: 'Model',
    assetId: 42,
    versionId: 7,
    operation: 'bake-textures',
    parametersJson: JSON.stringify({
      maps: ['diffuse', 'ao'],
      resolution: 1024,
      samples: 32,
      margin: 16,
      unwrap: false,
    }),
  }

  const blenderResult = {
    maps: [
      {
        map: 'diffuse',
        textureType: 'Albedo',
        fileName: 'diffuse.png',
        path: '/tmp/bake/diffuse.png',
        sizeBytes: 4096,
        colorSpace: 'srgb',
      },
      {
        map: 'ao',
        textureType: 'AO',
        fileName: 'ao.png',
        path: '/tmp/bake/ao.png',
        sizeBytes: 2048,
        colorSpace: 'non-color',
      },
    ],
    resolution: 1024,
    samples: 32,
    meshesBaked: 1,
    unwrapped: false,
  }

  beforeEach(() => {
    blenderEnabledBefore = config.blender.enabled
    config.blender.enabled = true

    processor = new BlenderOperationProcessor()
    processor.modelFileService = {
      // The Blender operations stage the model in a directory WITH its siblings:
      // Blender resolves a loose glTF's .bin and an OBJ's .mtl off the filesystem,
      // so handing it the primary file alone loses geometry or materials.
      fetchModelFileWithAuxiliaries: vi.fn().mockResolvedValue({
        filePath: '/tmp/work-chair/chair.fbx',
        fileType: 'fbx',
        originalFileName: 'chair.fbx',
        workDir: '/tmp/work-chair',
        auxiliaryCount: 0,
      }),
      fetchModelFile: vi.fn().mockResolvedValue({
        filePath: '/tmp/chair.fbx',
        fileType: 'fbx',
        originalFileName: 'chair.fbx',
      }),
      cleanupFile: vi.fn().mockResolvedValue(undefined),
      cleanupDirectory: vi.fn().mockResolvedValue(undefined),
    }
    processor.jobApi = {
      dequeueExtractionJob: vi.fn().mockResolvedValue(null),
      finishExtractionJob: vi.fn().mockResolvedValue(undefined),
      createModelVersion: vi
        .fn()
        .mockResolvedValue({ versionId: 21, versionNumber: 3, fileId: 9 }),
      createTextureSetWithFile: vi
        .fn()
        .mockResolvedValue({ textureSetId: 77, textureId: 1, fileId: 2 }),
      addTextureToSetWithFile: vi.fn().mockResolvedValue({ textureId: 2 }),
      associateTextureSetWithModelVersion: vi.fn().mockResolvedValue(undefined),
    }
    processor.runBlender = vi.fn().mockResolvedValue(blenderResult)
  })

  afterEach(() => {
    config.blender.enabled = blenderEnabledBefore
  })

  /**
   * The regression this closes: staging used to log a failed sibling download and
   * carry on. An OBJ still loads without its .mtl - the geometry is all there and
   * nothing looks broken - so the bake ran, produced textures for untextured
   * surfaces, and PUBLISHED them as a texture set bound to the version. A
   * thumbnail that comes out wrong is re-queued by whoever looks at it; this was
   * written into the library as the truth.
   */
  it('cannot bake an OBJ whose advertised .mtl could not be staged', async () => {
    processor.modelFileService.fetchModelFileWithAuxiliaries = vi
      .fn()
      .mockRejectedValue(
        new Error(
          "Could not stage auxiliary file 'chair.mtl' (file 10): connection " +
            'reset. Refusing to run the operation on a partial model.'
        )
      )

    await processor.process(job)

    // The job is reported FAILED...
    const [, , succeeded, message] =
      processor.jobApi.finishExtractionJob.mock.calls[0]
    expect(succeeded).toBe(false)
    expect(message).toMatch(/chair\.mtl/)
    // ...and nothing was published from a model that was never fully assembled.
    expect(processor.runBlender).not.toHaveBeenCalled()
    expect(processor.jobApi.createTextureSetWithFile).not.toHaveBeenCalled()
    expect(processor.jobApi.addTextureToSetWithFile).not.toHaveBeenCalled()
    expect(
      processor.jobApi.associateTextureSetWithModelVersion
    ).not.toHaveBeenCalled()
    expect(processor.jobApi.createModelVersion).not.toHaveBeenCalled()
  })

  it('imports every baked map into ONE texture set', async () => {
    // One set, a channel per map - not two loose textures nobody can bind together.
    await processor.process(job)

    expect(processor.jobApi.createTextureSetWithFile).toHaveBeenCalledWith(
      '/tmp/bake/diffuse.png',
      'diffuse.png',
      'chair (baked)',
      'Albedo'
    )
    expect(processor.jobApi.addTextureToSetWithFile).toHaveBeenCalledWith(
      77,
      '/tmp/bake/ao.png',
      'ao.png',
      'AO'
    )
    expect(processor.jobApi.createTextureSetWithFile).toHaveBeenCalledTimes(1)
  })

  it('binds the set to the version it was baked from, and to no other', async () => {
    // A baked set is laid out for one version's UVs. The all-versions form would point it
    // at layouts it does not match.
    await processor.process(job)

    expect(
      processor.jobApi.associateTextureSetWithModelVersion
    ).toHaveBeenCalledWith(77, 7)
    expect(processor.jobApi.createModelVersion).not.toHaveBeenCalled()
  })

  it('writes a re-layout bake as a new INACTIVE version and binds the set to THAT', async () => {
    processor.runBlender = vi
      .fn()
      .mockResolvedValue({ ...blenderResult, unwrapped: true })

    await processor.process({
      ...job,
      parametersJson: JSON.stringify({
        maps: ['diffuse', 'ao'],
        resolution: 1024,
        unwrap: true,
      }),
    })

    expect(processor.jobApi.createModelVersion).toHaveBeenCalledWith(
      42,
      expect.stringContaining('rebaked.glb'),
      'chair-baked.glb',
      expect.stringContaining('version 7'),
      false
    )
    // 21, the version just written - not 7, whose layout the maps do not match.
    expect(
      processor.jobApi.associateTextureSetWithModelVersion
    ).toHaveBeenCalledWith(77, 21)
  })

  it('reports the set, the binding and the maps back on the job', async () => {
    await processor.process(job)

    const [, , success, error, , resultJson] =
      processor.jobApi.finishExtractionJob.mock.calls[0]
    expect(success).toBe(true)
    expect(error).toBeNull()

    const result = JSON.parse(resultJson)
    expect(result.textureSetId).toBe(77)
    expect(result.boundToVersionId).toBe(7)
    expect(result.maps.map(m => m.textureType)).toEqual(['Albedo', 'AO'])
    expect(result.setAsDefaultTextureSet).toBe(false)
  })

  it("carries the script's warning through to the job", async () => {
    processor.runBlender = vi.fn().mockResolvedValue({
      ...blenderResult,
      warning: '1 of 1 meshes had no material',
    })

    await processor.process(job)

    const [, , success, , warning] =
      processor.jobApi.finishExtractionJob.mock.calls[0]
    expect(success).toBe(true)
    expect(warning).toBe('1 of 1 meshes had no material')
  })

  it('says where the orphaned set is when the version cannot be written', async () => {
    // The set is already in the library by then. "The job failed" alone would leave the
    // user hunting for something this message can just name.
    processor.runBlender = vi
      .fn()
      .mockResolvedValue({ ...blenderResult, unwrapped: true })
    processor.jobApi.createModelVersion = vi
      .fn()
      .mockRejectedValue(new Error('disk full'))

    await processor.process({
      ...job,
      parametersJson: JSON.stringify({ maps: ['diffuse'], unwrap: true }),
    })

    const [, , success, errorMessage] =
      processor.jobApi.finishExtractionJob.mock.calls[0]
    expect(success).toBe(false)
    expect(errorMessage).toContain('disk full')
    expect(errorMessage).toContain('texture set 77')
    expect(
      processor.jobApi.associateTextureSetWithModelVersion
    ).not.toHaveBeenCalled()
  })

  it('refuses when the API creates the set but does not say which one', async () => {
    processor.jobApi.createTextureSetWithFile = vi.fn().mockResolvedValue({})

    await processor.process(job)

    const [, , success, errorMessage] =
      processor.jobApi.finishExtractionJob.mock.calls[0]
    expect(success).toBe(false)
    expect(errorMessage).toContain('did not return its id')
    expect(processor.jobApi.addTextureToSetWithFile).not.toHaveBeenCalled()
  })

  it('names the set after the model, so it is findable without the job id', () => {
    expect(processor.bakedSetName('SM_Prop_CardboardBox_01.fbx')).toBe(
      'SM_Prop_CardboardBox_01 (baked)'
    )
    expect(processor.bakedModelFileName('SM_Prop_CardboardBox_01.fbx')).toBe(
      'SM_Prop_CardboardBox_01-baked.glb'
    )
  })
})

/**
 * The analysis. Its whole design question is which of its four numbers may go into a cache
 * keyed by geometry hash - so that is what these test.
 */
describe('BlenderOperationProcessor - mesh-analysis', () => {
  let processor
  let blenderEnabledBefore

  const job = {
    id: 11,
    assetType: 'Model',
    assetId: 42,
    versionId: 7,
    operation: 'mesh-analysis',
    parametersJson: JSON.stringify({ overlapSamples: 512 }),
  }

  const parts = [
    {
      object: 'Body',
      geometryHash: 'dff7e3502d16ec4b',
      geometryHashVersion: 1,
      // World-space: the object's scale is in it, so it is NOT a function of the
      // hashed geometry and must not be what gets cached.
      surfaceArea: 12.166688,
      localSurfaceArea: 3.041672,
      triangleCount: 224,
      manifold: { isManifold: false, boundaryEdges: 480, nonManifoldEdges: 0 },
      uvOverlap: { overlappingFraction: 0, bakeable: true },
      texelDensity: { uvAreaPerSquareMetre: 0.0145 },
    },
  ]

  beforeEach(() => {
    blenderEnabledBefore = config.blender.enabled
    config.blender.enabled = true

    processor = new BlenderOperationProcessor()
    processor.modelFileService = {
      fetchModelFileWithAuxiliaries: vi.fn().mockResolvedValue({
        filePath: '/tmp/work-chair/chair.glb',
        fileType: 'glb',
        originalFileName: 'chair.glb',
        workDir: '/tmp/work-chair',
        auxiliaryCount: 0,
      }),
      cleanupFile: vi.fn().mockResolvedValue(undefined),
      cleanupDirectory: vi.fn().mockResolvedValue(undefined),
    }
    processor.jobApi = {
      finishExtractionJob: vi.fn().mockResolvedValue(undefined),
      storeComputeResult: vi.fn().mockResolvedValue(undefined),
    }
    processor.runBlender = vi.fn().mockResolvedValue({ parts })
  })

  afterEach(() => {
    config.blender.enabled = blenderEnabledBefore
  })

  it('caches only the metrics that depend on geometry alone', async () => {
    // The cache is shared by every asset with this hash. A UV metric put in it would be
    // served to a mesh it was never measured on - a model and its re-baked version hash
    // identically and have entirely different layouts.
    await processor.process(job)

    const metrics = processor.jobApi.storeComputeResult.mock.calls.map(
      c => c[2]
    )
    expect(metrics).toEqual(['surface-area', 'manifold'])
    expect(metrics).not.toContain('uv-overlap')
    expect(metrics).not.toContain('texel-density')
  })

  it('caches under the hash and hash version the part reported', async () => {
    await processor.process(job)

    const [hash, hashVersion, metric, payload] =
      processor.jobApi.storeComputeResult.mock.calls[0]
    expect(hash).toBe('dff7e3502d16ec4b')
    expect(hashVersion).toBe(1)
    expect(metric).toBe('surface-area')
    // The LOCAL area, not the reported world-space one. Two instances of one mesh at
    // different scales share this hash, so caching the world figure would serve one
    // instance's surface as the other's.
    expect(payload).toEqual({
      surfaceArea: 3.041672,
      triangleCount: 224,
      space: 'local',
    })
  })

  it('keeps the world-space area on the job, where the transform it assumes is known', async () => {
    await processor.process(job)

    const [, , , , , resultJson] =
      processor.jobApi.finishExtractionJob.mock.calls[0]
    const result = JSON.parse(resultJson)
    expect(result.parts[0].surfaceArea).toBe(12.166688)
  })

  it('returns the UV metrics on the job, where they are tied to the version measured', async () => {
    await processor.process(job)

    const [, , success, , , resultJson] =
      processor.jobApi.finishExtractionJob.mock.calls[0]
    expect(success).toBe(true)

    const result = JSON.parse(resultJson)
    expect(result.versionId).toBe(7)
    expect(result.parts[0].uvOverlap.bakeable).toBe(true)
    expect(result.parts[0].texelDensity.uvAreaPerSquareMetre).toBe(0.0145)
    expect(result.cachedMetrics).toEqual({ stored: 2, failed: 0 })
  })

  it('still reports the measurements when the cache write fails', async () => {
    // The numbers are already in the job result. Throwing away minutes of Blender to save
    // a cheap re-computation would be the worse trade.
    processor.jobApi.storeComputeResult = vi
      .fn()
      .mockRejectedValue(new Error('unique violation'))

    await processor.process(job)

    const [, , success, , , resultJson] =
      processor.jobApi.finishExtractionJob.mock.calls[0]
    expect(success).toBe(true)
    const result = JSON.parse(resultJson)
    expect(result.cachedMetrics).toEqual({ stored: 0, failed: 2 })
    expect(result.parts[0].surfaceArea).toBe(12.166688)
  })

  it('skips a mesh that produced no hash rather than caching under an empty key', async () => {
    processor.runBlender = vi
      .fn()
      .mockResolvedValue({ parts: [{ ...parts[0], geometryHash: null }] })

    await processor.process(job)

    expect(processor.jobApi.storeComputeResult).not.toHaveBeenCalled()
  })
})
