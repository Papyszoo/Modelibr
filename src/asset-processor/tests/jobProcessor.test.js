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

const mockMarkJobFailed = vi.fn()
const mockTestConnection = vi.fn()
const mockPollForJob = vi.fn()

vi.mock('../jobApiClient.js', () => ({
  JobApiClient: vi.fn(function () {
    this.testConnection = mockTestConnection
    this.markJobFailed = mockMarkJobFailed
    this.pollForJob = mockPollForJob
  }),
}))

vi.mock('../signalrQueueService.js', () => ({
  SignalRQueueService: vi.fn(function () {
    this.onJobReceived = vi.fn()
    this.start = vi.fn().mockResolvedValue(true)
    this.stop = vi.fn().mockResolvedValue(undefined)
    this.acknowledgeJob = vi.fn()
    this.connected = true
  }),
}))

vi.mock('../modelFileService.js', () => ({
  ModelFileService: vi.fn(function () {
    this.cleanupOldFiles = vi.fn()
  }),
}))

vi.mock('../modelDataService.js', () => ({
  ModelDataService: vi.fn(function () {
    this.cleanupOldTextureFiles = vi.fn()
  }),
}))

vi.mock('../processors/processorRegistry.js', () => ({
  ProcessorRegistry: vi.fn(function () {
    this.getProcessor = vi.fn()
    this.cleanupAll = vi.fn()
  }),
}))

const mockRefreshBlender = vi.fn().mockResolvedValue(undefined)
const mockRefreshThumbnailRender = vi.fn().mockResolvedValue(undefined)

vi.mock('../config.js', () => ({
  config: {
    workerId: 'test-worker',
    modelProcessing: {},
    maxConcurrentJobs: 1,
    jobTimeout: 30,
  },
  refreshBlenderConfigFromApi: (...args) => mockRefreshBlender(...args),
  refreshThumbnailRenderConfigFromApi: (...args) =>
    mockRefreshThumbnailRender(...args),
}))

const { JobProcessor } = await import('../jobProcessor.js')

describe('JobProcessor timeout cancellation', () => {
  let processor

  beforeEach(() => {
    vi.clearAllMocks()
    mockRefreshBlender.mockResolvedValue(undefined)
    mockRefreshThumbnailRender.mockResolvedValue(undefined)
    mockMarkJobFailed.mockResolvedValue(undefined)
    processor = new JobProcessor()
  })

  it('frees a renderer-pool slot after a job times out, so a subsequent job can complete', async () => {
    // A minimal fake "renderer pool" with capacity 1, mirroring the
    // contract real processors are expected to honor: acquire a slot, and
    // on abort force-reinit it instead of leaving it hung.
    let slotHeld = false
    const fakePool = {
      acquire: () => {
        if (slotHeld) {
          throw new Error('slot already held — pool exhausted')
        }
        slotHeld = true
        return 'the-renderer'
      },
      forceReinit: () => {
        slotHeld = false
      },
      release: () => {
        slotHeld = false
      },
    }

    // job1's processor acquires the only slot and then hangs forever —
    // like a Puppeteer page.evaluate() that never settles on its own. It
    // only frees the slot if the queue aborts it.
    const job1Processor = (job, signal) =>
      new Promise((_resolve, reject) => {
        fakePool.acquire()
        signal.addEventListener('abort', () => {
          fakePool.forceReinit()
          reject(new Error('job1 aborted'))
        })
      })

    let job2Completed = false
    const job2Processor = async () => {
      // Throws if job1 still holds the slot — proving the pool actually
      // recovered instead of deadlocking.
      fakePool.acquire()
      job2Completed = true
      fakePool.release()
      return { ok: true }
    }

    processor.jobQueue.push({ job: { id: 1 }, processor: job1Processor })
    await processor.processQueue()

    // The 30ms job timeout should have fired, aborted the fake processor,
    // reported the job failed, and freed the slot.
    expect(mockMarkJobFailed).toHaveBeenCalledWith(
      1,
      expect.stringContaining('timed out')
    )
    expect(slotHeld).toBe(false)
    expect(processor.activeJobs.has(1)).toBe(false)

    // A second job queued afterwards should be able to acquire the slot and
    // complete normally.
    processor.jobQueue.push({ job: { id: 2 }, processor: job2Processor })
    await processor.processQueue()

    expect(job2Completed).toBe(true)
  })

  it('clears the timeout timer on normal completion (no late failure report)', async () => {
    const job1Processor = vi.fn().mockResolvedValue({ ok: true })

    processor.jobQueue.push({ job: { id: 10 }, processor: job1Processor })
    await processor.processQueue()

    expect(job1Processor).toHaveBeenCalledTimes(1)
    expect(mockMarkJobFailed).not.toHaveBeenCalled()

    // Wait past the configured job timeout (30ms) — if the timer wasn't
    // cleared, it would still fire and report a bogus timeout failure for
    // a job that already finished.
    await new Promise(resolve => setTimeout(resolve, 60))

    expect(mockMarkJobFailed).not.toHaveBeenCalled()
  })

  it('does not double-report a non-timeout failure the processor already reported itself', async () => {
    // Simulates a BaseProcessor.execute() that already called markFailed
    // internally before rethrowing — jobProcessor must not call
    // markJobFailed again for the same job.
    const job1Processor = vi.fn().mockRejectedValue(new Error('render crash'))

    processor.jobQueue.push({ job: { id: 20 }, processor: job1Processor })
    await processor.processQueue()

    expect(mockMarkJobFailed).not.toHaveBeenCalled()
  })

  it('defensively marks a job failed when it fails before the processor ever runs', async () => {
    mockRefreshBlender.mockRejectedValueOnce(new Error('settings API down'))
    const job1Processor = vi.fn()

    processor.jobQueue.push({ job: { id: 30 }, processor: job1Processor })
    await processor.processQueue()

    expect(job1Processor).not.toHaveBeenCalled()
    expect(mockMarkJobFailed).toHaveBeenCalledWith(30, 'settings API down')
  })
})
