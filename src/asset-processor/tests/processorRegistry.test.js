import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock all processor dependencies before importing
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

vi.mock('../modelFileService.js', () => ({
  ModelFileService: vi.fn(function () {}),
}))

vi.mock('../soundFileService.js', () => ({
  SoundFileService: vi.fn(function () {}),
}))

vi.mock('../waveformGeneratorService.js', () => ({
  WaveformGeneratorService: vi.fn(function () {}),
}))

vi.mock('../modelDataService.js', () => ({
  ModelDataService: vi.fn(function () {}),
}))

vi.mock('../thumbnailStorageService.js', () => ({
  ThumbnailStorageService: vi.fn(function () {}),
}))

vi.mock('../thumbnailApiService.js', () => ({
  ThumbnailApiService: vi.fn(function () {}),
}))

vi.mock('../puppeteerRenderer.js', () => ({
  PuppeteerRenderer: vi.fn(function () {}),
}))

vi.mock('../frameEncoderService.js', () => ({
  FrameEncoderService: vi.fn(function () {}),
}))

vi.mock('../config.js', () => ({
  config: {
    orbit: { enabled: true },
    encoding: { enabled: true },
    thumbnailStorage: { enabled: true },
    rendering: {},
    modelProcessing: {},
  },
}))

// Now import the module under test
const { ProcessorRegistry } = await import('../processors/processorRegistry.js')
const { ThumbnailProcessor } = await import(
  '../processors/thumbnailProcessor.js'
)
const { SoundProcessor } = await import('../processors/soundProcessor.js')
const { MeshAnalysisProcessor } = await import('../processors/meshProcessor.js')

describe('ProcessorRegistry', () => {
  let registry

  beforeEach(() => {
    registry = new ProcessorRegistry()
  })

  describe('initialization', () => {
    it('should register Model, Sound, and MeshAnalysis processors', () => {
      expect(registry.processors.size).toBe(3)
      expect(registry.processors.has('Model')).toBe(true)
      expect(registry.processors.has('Sound')).toBe(true)
      expect(registry.processors.has('MeshAnalysis')).toBe(true)
    })

    it('should register correct processor types', () => {
      expect(registry.processors.get('Model')).toBeInstanceOf(
        ThumbnailProcessor
      )
      expect(registry.processors.get('Sound')).toBeInstanceOf(SoundProcessor)
      expect(registry.processors.get('MeshAnalysis')).toBeInstanceOf(
        MeshAnalysisProcessor
      )
    })
  })

  describe('getProcessor', () => {
    it('should return ThumbnailProcessor for Model asset type', () => {
      const processor = registry.getProcessor({ assetType: 'Model', id: 1 })
      expect(processor).toBeInstanceOf(ThumbnailProcessor)
    })

    it('should return SoundProcessor for Sound asset type', () => {
      const processor = registry.getProcessor({ assetType: 'Sound', id: 2 })
      expect(processor).toBeInstanceOf(SoundProcessor)
    })

    it('should return MeshAnalysisProcessor for MeshAnalysis asset type', () => {
      const processor = registry.getProcessor({
        assetType: 'MeshAnalysis',
        id: 3,
      })
      expect(processor).toBeInstanceOf(MeshAnalysisProcessor)
    })

    it('should return null for unknown asset type', () => {
      const processor = registry.getProcessor({ assetType: 'Unknown', id: 4 })
      expect(processor).toBeNull()
    })

    it('should return null for undefined asset type', () => {
      const processor = registry.getProcessor({ id: 5 })
      expect(processor).toBeNull()
    })
  })

  describe('register', () => {
    it('should allow registering new processor types', () => {
      const mockProcessor = { processorType: 'custom', cleanup: vi.fn() }
      registry.register('Custom', mockProcessor)
      expect(registry.processors.has('Custom')).toBe(true)
      expect(registry.getProcessor({ assetType: 'Custom', id: 6 })).toBe(
        mockProcessor
      )
    })

    it('should allow overriding existing processor types', () => {
      const mockProcessor = { processorType: 'override', cleanup: vi.fn() }
      registry.register('Model', mockProcessor)
      expect(registry.getProcessor({ assetType: 'Model', id: 7 })).toBe(
        mockProcessor
      )
    })
  })

  describe('cleanupAll', () => {
    it('should call cleanup on all registered processors', async () => {
      // Replace processors with mocks that track cleanup calls
      const mockCleanups = []
      for (const [key, processor] of registry.processors) {
        const cleanupFn = vi.fn().mockResolvedValue(undefined)
        processor.cleanup = cleanupFn
        mockCleanups.push({ key, cleanupFn })
      }

      await registry.cleanupAll()

      for (const { cleanupFn } of mockCleanups) {
        expect(cleanupFn).toHaveBeenCalledOnce()
      }
    })

    it('should continue cleaning up even if one processor fails', async () => {
      const processors = Array.from(registry.processors.entries())

      // First processor throws
      processors[0][1].cleanup = vi
        .fn()
        .mockRejectedValue(new Error('cleanup failed'))
      // Second processor should still be called
      processors[1][1].cleanup = vi.fn().mockResolvedValue(undefined)
      processors[2][1].cleanup = vi.fn().mockResolvedValue(undefined)

      await registry.cleanupAll()

      expect(processors[1][1].cleanup).toHaveBeenCalledOnce()
      expect(processors[2][1].cleanup).toHaveBeenCalledOnce()
    })
  })
})
