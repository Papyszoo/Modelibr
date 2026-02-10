import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  },
  withJobContext: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  })),
}))

vi.mock('../jobApiClient.js', () => ({
  JobApiClient: vi.fn(function () {
    this.markJobCompleted = vi.fn()
    this.markJobFailed = vi.fn()
    this.finishSoundJob = vi.fn()
  }),
}))

vi.mock('../jobEventService.js', () => ({
  JobEventService: vi.fn(function () {
    this.logJobStarted = vi.fn()
    this.logJobCompleted = vi.fn()
    this.logJobFailed = vi.fn()
  }),
}))

const { MeshAnalysisProcessor } = await import('../processors/meshProcessor.js')

describe('MeshAnalysisProcessor', () => {
  let processor

  beforeEach(() => {
    vi.clearAllMocks()
    processor = new MeshAnalysisProcessor()
  })

  describe('processorType', () => {
    it('should return mesh-analysis', () => {
      expect(processor.processorType).toBe('mesh-analysis')
    })
  })

  describe('canHandle', () => {
    it('should handle MeshAnalysis asset type', () => {
      expect(
        MeshAnalysisProcessor.canHandle({ assetType: 'MeshAnalysis' })
      ).toBe(true)
    })

    it('should handle mesh-analysis processor type', () => {
      expect(
        MeshAnalysisProcessor.canHandle({ processorType: 'mesh-analysis' })
      ).toBe(true)
    })

    it('should not handle Model asset type', () => {
      expect(MeshAnalysisProcessor.canHandle({ assetType: 'Model' })).toBe(
        false
      )
    })
  })

  describe('process', () => {
    const mockJob = { id: 1, modelId: 10, assetType: 'MeshAnalysis' }
    const mockLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }

    it('should throw when BLENDER_ENABLED is false', async () => {
      processor.blenderEnabled = false

      await expect(processor.process(mockJob, mockLogger)).rejects.toThrow(
        'Mesh analysis requires Blender'
      )
    })

    it('should throw when Blender is enabled but not found', async () => {
      processor.blenderEnabled = true
      // isBlenderAvailable will fail because blender binary doesn't exist in test env
      processor.blenderPath = '/nonexistent/blender'

      await expect(processor.process(mockJob, mockLogger)).rejects.toThrow()
    })
  })

  describe('blender detection', () => {
    it('should return false when blenderEnabled is false', async () => {
      processor.blenderEnabled = false
      expect(await processor.isBlenderAvailable()).toBe(false)
    })

    it('should return false when blender binary is not found', async () => {
      processor.blenderEnabled = true
      processor.blenderPath = '/nonexistent/blender'
      expect(await processor.isBlenderAvailable()).toBe(false)
    })
  })
})
