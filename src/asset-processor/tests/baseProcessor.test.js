import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock dependencies
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

const mockMarkJobCompleted = vi.fn()
const mockMarkJobFailed = vi.fn()

vi.mock('../jobApiClient.js', () => ({
  JobApiClient: vi.fn(function () {
    this.markJobCompleted = mockMarkJobCompleted
    this.markJobFailed = mockMarkJobFailed
  }),
}))

const mockLogJobStarted = vi.fn()
const mockLogJobCompleted = vi.fn()
const mockLogJobFailed = vi.fn()

vi.mock('../jobEventService.js', () => ({
  JobEventService: vi.fn(function () {
    this.logJobStarted = mockLogJobStarted
    this.logJobCompleted = mockLogJobCompleted
    this.logJobFailed = mockLogJobFailed
  }),
}))

const { BaseProcessor } = await import('../processors/baseProcessor.js')

// Concrete test subclass
class TestProcessor extends BaseProcessor {
  constructor() {
    super()
    this._processResult = { success: true }
  }

  get processorType() {
    return 'test'
  }

  async process(_job, _jobLogger) {
    return this._processResult
  }
}

describe('BaseProcessor', () => {
  let processor
  const mockJob = {
    id: 42,
    modelId: 100,
    modelHash: 'abc123',
    assetType: 'Model',
  }

  beforeEach(() => {
    vi.clearAllMocks()
    processor = new TestProcessor()
  })

  describe('abstract interface', () => {
    it('should throw if processorType is not overridden', () => {
      const base = new BaseProcessor()
      expect(() => base.processorType).toThrow(
        'Subclass must implement get processorType()'
      )
    })

    it('should throw if process is not overridden', async () => {
      const base = new BaseProcessor()
      await expect(base.process({}, {})).rejects.toThrow(
        'Subclass must implement process()'
      )
    })
  })

  describe('execute lifecycle', () => {
    it('should call process and mark job completed on success', async () => {
      const result = { thumbnailPath: '/path', sizeBytes: 1024 }
      processor._processResult = result

      await processor.execute(mockJob)

      expect(mockLogJobStarted).toHaveBeenCalledWith(42, 100, 'abc123')
      expect(mockMarkJobCompleted).toHaveBeenCalledWith(42, result)
      expect(mockLogJobCompleted).toHaveBeenCalledWith(42, result)
    })

    it('should log job failed and mark as failed on error', async () => {
      processor.process = vi
        .fn()
        .mockRejectedValue(new Error('Processing failed'))

      await expect(processor.execute(mockJob)).rejects.toThrow(
        'Processing failed'
      )

      expect(mockLogJobFailed).toHaveBeenCalledWith(
        42,
        'Processing failed',
        expect.any(String)
      )
      expect(mockMarkJobFailed).toHaveBeenCalledWith(42, 'Processing failed')
    })

    it('should use soundId when modelId is absent', async () => {
      const soundJob = {
        id: 43,
        soundId: 200,
        soundHash: 'def456',
        assetType: 'Sound',
      }

      await processor.execute(soundJob)

      expect(mockLogJobStarted).toHaveBeenCalledWith(43, 200, 'def456')
    })

    it('should fall back to job id when both modelId and soundId are absent', async () => {
      const genericJob = { id: 44, assetType: 'MeshAnalysis' }

      await processor.execute(genericJob)

      expect(mockLogJobStarted).toHaveBeenCalledWith(44, 44, undefined)
    })

    it('should not throw if markFailed also fails', async () => {
      processor.process = vi
        .fn()
        .mockRejectedValue(new Error('Processing failed'))
      mockMarkJobFailed.mockRejectedValue(new Error('API down'))

      await expect(processor.execute(mockJob)).rejects.toThrow(
        'Processing failed'
      )
      // Should not throw the markFailed error — it's caught internally
    })
  })

  describe('cleanup', () => {
    it('should be a no-op by default', async () => {
      await expect(processor.cleanup()).resolves.toBeUndefined()
    })
  })
})
