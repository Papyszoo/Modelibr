import { describe, it, expect, vi, beforeEach } from 'vitest'

// Regression coverage for the timeout-cancellation "force-reinit" path
// (prompt 41): when a job times out, jobProcessor.js aborts it and the
// processor hands its held renderer to RendererPool.forceReinit(), which
// must reuse PuppeteerRenderer's own crash-recovery path so the pool gets
// back a USABLE renderer instead of a hung page. This uses the REAL
// RendererPool with a stubbed PuppeteerRenderer (no real Chromium).

vi.mock('../logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  },
}))

vi.mock('../config.js', () => ({
  config: { maxConcurrentJobs: 3 },
}))

const mockLaunch = vi.fn()
vi.mock('puppeteer', () => ({
  default: { launch: (...args) => mockLaunch(...args) },
}))

const mockInitialize = vi.fn()
const mockReinitialize = vi.fn()

vi.mock('../puppeteerRenderer.js', () => {
  const PuppeteerRenderer = vi.fn(function (sharedBrowser) {
    this.browser = sharedBrowser || null
    this.page = { closed: false }
    this.initialize = (...args) => mockInitialize(...args)
    this.reinitialize = (...args) => mockReinitialize(...args)
  })
  PuppeteerRenderer.getLaunchOptions = vi.fn(() => ({}))
  return { PuppeteerRenderer }
})

const { RendererPool } = await import('../rendererPool.js')

describe('RendererPool.forceReinit', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockLaunch.mockResolvedValue({ close: vi.fn() })
    mockInitialize.mockResolvedValue(true)
    mockReinitialize.mockResolvedValue(undefined)
  })

  it('reinitializes the renderer in place instead of tearing down the whole pool', async () => {
    const pool = new RendererPool(1)
    await pool.initialize()

    const renderer = await pool.acquire()
    expect(renderer).toBeDefined()

    await pool.forceReinit(renderer)

    expect(mockReinitialize).toHaveBeenCalledTimes(1)
    // Only the renderer's own page/browser recovery ran - the pool's shared
    // browser was launched once at initialize() and never relaunched.
    expect(mockLaunch).toHaveBeenCalledTimes(1)
  })

  it('is a no-op for a null/undefined renderer', async () => {
    const pool = new RendererPool(1)
    await pool.initialize()

    await expect(pool.forceReinit(null)).resolves.toBeUndefined()
    expect(mockReinitialize).not.toHaveBeenCalled()
  })

  it('hands the reinitialized renderer to the next acquire() after release', async () => {
    const pool = new RendererPool(1)
    await pool.initialize()

    const renderer = await pool.acquire()
    await pool.forceReinit(renderer)
    pool.release(renderer)

    const nextRenderer = await pool.acquire()
    expect(nextRenderer).toBe(renderer)
  })

  it('propagates reinit failures to the caller instead of silently losing the slot', async () => {
    const pool = new RendererPool(1)
    await pool.initialize()
    const renderer = await pool.acquire()

    mockReinitialize.mockRejectedValueOnce(new Error('chrome crashed harder'))

    await expect(pool.forceReinit(renderer)).rejects.toThrow(
      'chrome crashed harder'
    )
  })
})
