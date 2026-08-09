import { describe, it, expect, beforeEach, vi } from 'vitest'

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
    processor.modelDataService = {
      saveSceneGraph: vi.fn().mockResolvedValue(undefined),
      saveTechnicalMetadata: vi.fn().mockResolvedValue(undefined),
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
    expect(
      processor.modelDataService.saveTechnicalMetadata
    ).toHaveBeenCalledWith(7, { triangleCount: 10 })
    expect(processor.jobApi.finishExtractionJob).toHaveBeenCalledWith(5, true)
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
      false,
      'load boom'
    )
    // Still cleans up the temp file and releases the renderer on failure.
    expect(processor.rendererPool.release).toHaveBeenCalledWith(renderer)
    expect(processor.modelFileService.cleanupFile).toHaveBeenCalled()
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
      true,
      null,
      expect.stringContaining('Sound')
    )
  })
})
