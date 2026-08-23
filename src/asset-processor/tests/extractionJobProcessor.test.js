import { describe, it, expect, beforeEach, vi } from 'vitest'

import { config } from '../config.js'
import { ExtractionJobProcessor } from '../extractionJobProcessor.js'

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

describe('ExtractionJobProcessor.process', () => {
  let processor
  let renderer

  beforeEach(() => {
    processor = new ExtractionJobProcessor()

    renderer = {
      loadModel: vi.fn().mockResolvedValue(1234),
      extractSceneGraph: vi.fn().mockResolvedValue({ nodes: [] }),
      extractTechnicalMetadata: vi
        .fn()
        .mockResolvedValue({ triangleCount: 10 }),
    }
    // Pre-seed a fake pool so process() doesn't spin up a real browser.
    processor.rendererPool = {
      acquire: vi.fn().mockResolvedValue(renderer),
      release: vi.fn().mockResolvedValue(undefined),
    }
    processor.modelFileService = {
      fetchModelFile: vi.fn().mockResolvedValue({
        filePath: '/tmp/model.glb',
        fileType: 'glb',
        originalFileName: 'model.glb',
      }),
      fetchAuxiliaryResourceMap: vi.fn().mockResolvedValue(null),
      cleanupFile: vi.fn().mockResolvedValue(undefined),
    }
    // Both save methods report success/failure as a boolean and never throw -
    // mocking them as `undefined` is what let a failed persist read as success.
    processor.modelDataService = {
      saveSceneGraph: vi.fn().mockResolvedValue(true),
      saveTechnicalMetadata: vi.fn().mockResolvedValue(true),
    }
    processor.jobApi = {
      finishExtractionJob: vi.fn().mockResolvedValue(undefined),
    }
  })

  it('re-extracts a Model job and reports success', async () => {
    // Regression: the executor must rebuild parts/derivation/search for a version
    // (this is what makes trigger_rederive actually refresh an asset's metadata).
    await processor.process({
      id: 5,
      assetType: 'Model',
      assetId: 42,
      versionId: 7,
      fileSha256: 'a'.repeat(64),
    })

    expect(processor.modelDataService.saveSceneGraph).toHaveBeenCalledWith(
      7,
      'a'.repeat(64),
      { nodes: [] }
    )
    // Regression: the scene-graph import IS the technical-metadata write (it
    // refreshes the flat columns itself). Following it with saveTechnicalMetadata
    // overwrote the verbatim v2 extraction payload with the flat v1 shape, so every
    // successful re-derive destroyed the raw data the next derivation needs.
    expect(
      processor.modelDataService.saveTechnicalMetadata
    ).not.toHaveBeenCalled()
    // The worker id proves we still hold the lease; the API refuses a result from a
    // worker whose claim has since been taken over.
    expect(processor.jobApi.finishExtractionJob).toHaveBeenCalledWith(
      5,
      config.workerId,
      true
    )
    expect(processor.rendererPool.release).toHaveBeenCalledWith(renderer)
    expect(processor.modelFileService.cleanupFile).toHaveBeenCalledWith(
      '/tmp/model.glb'
    )
  })

  it('resolves multi-file glTF auxiliaries before extracting', async () => {
    processor.modelFileService.fetchModelFile.mockResolvedValue({
      filePath: '/tmp/scene.gltf',
      fileType: 'gltf',
      originalFileName: 'scene.gltf',
    })
    processor.modelFileService.fetchAuxiliaryResourceMap.mockResolvedValue({
      'scene.bin': 'data:application/octet-stream;base64,AAA',
    })

    await processor.process({
      id: 6,
      assetType: 'Model',
      assetId: 43,
      versionId: 8,
      fileSha256: 'b'.repeat(64),
    })

    expect(
      processor.modelFileService.fetchAuxiliaryResourceMap
    ).toHaveBeenCalledWith(43, 8)
    expect(renderer.loadModel).toHaveBeenCalledWith('/tmp/scene.gltf', 'gltf', {
      gltfResources: {
        'scene.bin': 'data:application/octet-stream;base64,AAA',
      },
    })
  })

  it('reports failure (for retry/dead-letter) when extraction throws', async () => {
    renderer.loadModel.mockRejectedValue(new Error('load boom'))

    await processor.process({
      id: 7,
      assetType: 'Model',
      assetId: 44,
      versionId: 9,
      fileSha256: 'c'.repeat(64),
    })

    expect(processor.jobApi.finishExtractionJob).toHaveBeenCalledWith(
      7,
      config.workerId,
      false,
      'load boom'
    )
    // Still cleans up the temp file and releases the renderer on failure.
    expect(processor.rendererPool.release).toHaveBeenCalledWith(renderer)
    expect(processor.modelFileService.cleanupFile).toHaveBeenCalled()
  })

  it('fails the job when persisting the scene graph fails', async () => {
    // Regression: saveSceneGraph converts an API error (400/500/timeout) into
    // `false`. Ignoring it completed the job having rebuilt nothing, permanently -
    // the queue would never retry, and trigger_rederive silently did nothing.
    processor.modelDataService.saveSceneGraph.mockResolvedValue(false)

    await processor.process({
      id: 9,
      assetType: 'Model',
      assetId: 46,
      versionId: 10,
      fileSha256: 'd'.repeat(64),
    })

    expect(processor.jobApi.finishExtractionJob).toHaveBeenCalledWith(
      9,
      config.workerId,
      false,
      expect.stringContaining('scene graph')
    )
  })

  it('falls back to technical metadata only when no scene graph could be extracted', async () => {
    renderer.extractSceneGraph.mockResolvedValue(null)

    await processor.process({
      id: 10,
      assetType: 'Model',
      assetId: 47,
      versionId: 11,
      fileSha256: 'e'.repeat(64),
    })

    expect(processor.modelDataService.saveSceneGraph).not.toHaveBeenCalled()
    expect(
      processor.modelDataService.saveTechnicalMetadata
    ).toHaveBeenCalledWith(11, { triangleCount: 10 })
    expect(processor.jobApi.finishExtractionJob).toHaveBeenCalledWith(
      10,
      config.workerId,
      true
    )
  })

  it('fails the job when neither a scene graph nor technical metadata is available', async () => {
    renderer.extractSceneGraph.mockResolvedValue(null)
    renderer.extractTechnicalMetadata.mockResolvedValue(null)

    await processor.process({
      id: 11,
      assetType: 'Model',
      assetId: 48,
      versionId: 12,
      fileSha256: 'f'.repeat(64),
    })

    expect(processor.jobApi.finishExtractionJob).toHaveBeenCalledWith(
      11,
      config.workerId,
      false,
      expect.stringContaining('Neither')
    )
  })

  it('acks a non-Model job as done without running a renderer', async () => {
    await processor.process({
      id: 8,
      assetType: 'Sound',
      assetId: 45,
      versionId: null,
    })

    expect(processor.rendererPool.acquire).not.toHaveBeenCalled()
    expect(processor.jobApi.finishExtractionJob).toHaveBeenCalledWith(
      8,
      config.workerId,
      true,
      null,
      expect.stringContaining('Sound')
    )
  })
})

describe('ExtractionJobProcessor.drain', () => {
  /**
   * A processor whose queue holds `count` jobs, with `process` stubbed so a drain can be
   * observed without loading anything. Records how many jobs were in flight at the peak.
   */
  function processorWith(count) {
    const processor = new ExtractionJobProcessor()
    let remaining = count
    let inFlight = 0
    let peakInFlight = 0

    processor.jobApi = {
      dequeueExtractionJob: vi.fn().mockImplementation(async () => {
        if (remaining <= 0) return null
        remaining -= 1
        return { id: count - remaining, assetType: 'Model', versionId: 1, assetId: 1 }
      }),
    }
    processor.process = vi.fn().mockImplementation(async () => {
      inFlight += 1
      peakInFlight = Math.max(peakInFlight, inFlight)
      // Yield, so lanes actually overlap rather than each completing synchronously.
      await new Promise((resolve) => setTimeout(resolve, 1))
      inFlight -= 1
    })

    return { processor, peak: () => peakInFlight }
  }

  it('runs jobs up to the concurrency budget at once', async () => {
    const { processor, peak } = processorWith(12)

    await processor.drain()

    // One at a time behind a 10-per-tick cap was a hard 120 jobs/min ceiling no matter
    // what the machine could do - the reason re-deriving a library took 20-40 minutes.
    expect(processor.process).toHaveBeenCalledTimes(12)
    expect(peak()).toBeGreaterThan(1)
    expect(peak()).toBeLessThanOrEqual(config.extractionConcurrency)
  })

  it('stops at the batch size and leaves the rest for the next tick', async () => {
    const { processor } = processorWith(config.extractionBatchSize + 25)

    await processor.drain()

    expect(processor.process.mock.calls.length).toBeLessThanOrEqual(
      config.extractionBatchSize
    )
  })

  it('stops asking once one lane finds the queue empty', async () => {
    const { processor } = processorWith(1)

    await processor.drain()

    // The lanes share the "it's empty" answer instead of each paying its own empty round
    // trip: one claim that returned a job, and at most one empty answer per lane.
    expect(processor.jobApi.dequeueExtractionJob.mock.calls.length).toBeLessThanOrEqual(
      1 + config.extractionConcurrency
    )
  })

  it('does not re-enter while a drain is still running', async () => {
    const { processor } = processorWith(6)

    const first = processor.drain()
    await processor.drain()
    await first

    expect(processor.process).toHaveBeenCalledTimes(6)
  })
})
