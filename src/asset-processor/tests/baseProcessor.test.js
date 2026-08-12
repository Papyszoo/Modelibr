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
    this.finishEnvironmentMapJob = vi.fn()
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

    it('should use environmentMapId when modelId and soundId are absent', async () => {
      const environmentMapJob = {
        id: 45,
        environmentMapId: 300,
        assetType: 'EnvironmentMap',
      }

      await processor.execute(environmentMapJob)

      expect(mockLogJobStarted).toHaveBeenCalledWith(45, 300, undefined)
    })

    it('should not throw if markFailed also fails', async () => {
      processor.process = vi
        .fn()
        .mockRejectedValue(new Error('Processing failed'))
      mockMarkJobFailed.mockRejectedValue(new Error('API down'))

      await expect(processor.execute(mockJob)).rejects.toThrow(
        'Processing failed'
      )
      // Should not throw the markFailed error - it's caught internally
    })
  })

  describe('abort signal (timeout cancellation)', () => {
    it('passes the abort signal through to process()', async () => {
      const controller = new AbortController()
      processor.process = vi.fn().mockResolvedValue({ ok: true })

      await processor.execute(mockJob, controller.signal)

      expect(processor.process).toHaveBeenCalledWith(
        mockJob,
        expect.anything(),
        controller.signal
      )
    })

    it('discards a stale success instead of double-completing an aborted job', async () => {
      const controller = new AbortController()
      controller.abort()
      processor._processResult = { thumbnailPath: '/path' }

      await processor.execute(mockJob, controller.signal)

      expect(mockMarkJobCompleted).not.toHaveBeenCalled()
      expect(mockLogJobCompleted).not.toHaveBeenCalled()
    })

    it('does not call markFailed a second time for an already-timed-out job', async () => {
      const controller = new AbortController()
      controller.abort()
      processor.process = vi.fn().mockRejectedValue(new Error('boom'))

      await expect(
        processor.execute(mockJob, controller.signal)
      ).rejects.toThrow('boom')

      // The job queue's timeout handler already reported this job failed -
      // the backend has no double-finish guard, so a second markFailed call
      // here could clobber a job a different worker has since reclaimed.
      expect(mockMarkJobFailed).not.toHaveBeenCalled()
      // Still logs the failure event for visibility.
      expect(mockLogJobFailed).toHaveBeenCalledWith(
        42,
        'boom',
        expect.any(String)
      )
    })

    it('still marks completed/failed normally when no signal is provided', async () => {
      const result = { thumbnailPath: '/path' }
      processor._processResult = result

      await processor.execute(mockJob)

      expect(mockMarkJobCompleted).toHaveBeenCalledWith(42, result)
    })
  })

  describe('_armRendererAbort', () => {
    it('is a no-op when no signal or no renderer is provided', () => {
      const jobLogger = { warn: vi.fn(), error: vi.fn() }
      const pool = { forceReinit: vi.fn() }

      expect(() =>
        processor._armRendererAbort(undefined, pool, {}, jobLogger)()
      ).not.toThrow()
      expect(() =>
        processor._armRendererAbort(
          new AbortController().signal,
          pool,
          null,
          jobLogger
        )()
      ).not.toThrow()
      expect(pool.forceReinit).not.toHaveBeenCalled()
    })

    it('force-reinitializes the renderer pool slot when the signal aborts', () => {
      const controller = new AbortController()
      const renderer = { id: 'renderer-1' }
      const jobLogger = { warn: vi.fn(), error: vi.fn() }
      const forceReinit = vi.fn().mockResolvedValue(undefined)
      const pool = { forceReinit }

      processor._armRendererAbort(controller.signal, pool, renderer, jobLogger)
      controller.abort()

      expect(forceReinit).toHaveBeenCalledWith(renderer)
    })

    it('logs but does not throw when force-reinit fails', async () => {
      const controller = new AbortController()
      const jobLogger = { warn: vi.fn(), error: vi.fn() }
      const forceReinit = vi.fn().mockRejectedValue(new Error('reinit boom'))
      const pool = { forceReinit }

      processor._armRendererAbort(controller.signal, pool, {}, jobLogger)
      controller.abort()

      // Let the fire-and-forget rejection handler run.
      await new Promise(resolve => setTimeout(resolve, 0))

      expect(jobLogger.error).toHaveBeenCalledWith(
        'Failed to force-reinitialize renderer after abort',
        expect.objectContaining({ error: 'reinit boom' })
      )
    })

    it('disarm() removes the abort listener', () => {
      const controller = new AbortController()
      const jobLogger = { warn: vi.fn(), error: vi.fn() }
      const forceReinit = vi.fn().mockResolvedValue(undefined)
      const pool = { forceReinit }

      const disarm = processor._armRendererAbort(
        controller.signal,
        pool,
        {},
        jobLogger
      )
      disarm()
      controller.abort()

      expect(forceReinit).not.toHaveBeenCalled()
    })
  })

  describe('cleanup', () => {
    it('should be a no-op by default', async () => {
      await expect(processor.cleanup()).resolves.toBeUndefined()
    })
  })
})
