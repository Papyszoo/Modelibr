import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * Idle close (BROWSER_IDLE_TIMEOUT_MS): an idle native app still holds ~3.7 GB
 * because the shared browser stays open. When the LAST render slot is released
 * the manager starts a countdown and closes the browser if no job starts; the
 * next job relaunches it lazily. These cover the contract that must hold so a
 * running job is never left with a half-closed browser:
 *
 * - the timeout closes the browser, 0 disables it;
 * - a job after the close relaunches a fresh browser;
 * - a job arriving DURING the close waits for it and gets a working browser;
 * - a held slot (a job owning a page) blocks the close;
 * - per-job page ownership still holds (release closes the job's page).
 */

vi.mock('../logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  },
}))

vi.mock('../config.js', () => ({
  config: {
    maxConcurrentRenderJobs: 1,
    maxConcurrentJobs: 3,
    browserIdleTimeoutMs: 60000,
  },
}))

const createdBrowsers = []

function makeBrowser() {
  return {
    connected: true,
    newPage: vi.fn().mockResolvedValue({ close: vi.fn() }),
    close: vi.fn().mockResolvedValue(undefined),
    _disconnected: [],
    once(event, callback) {
      if (event === 'disconnected') this._disconnected.push(callback)
    },
    emitDisconnected() {
      this.connected = false
      for (const callback of this._disconnected) callback()
    },
  }
}

const mockLaunch = vi.fn(() => {
  const browser = makeBrowser()
  createdBrowsers.push(browser)
  return Promise.resolve(browser)
})

vi.mock('puppeteer', () => ({
  default: { launch: (...args) => mockLaunch(...args) },
}))

const mockClosePage = vi.fn()

vi.mock('../puppeteerRenderer.js', () => {
  const PuppeteerRenderer = vi.fn(function (sharedBrowser) {
    this.browser = sharedBrowser || null
    this.page = { closed: false }
    this.closePage = (...args) => mockClosePage(...args)
  })
  PuppeteerRenderer.getLaunchOptions = vi.fn(() => ({}))
  return { PuppeteerRenderer }
})

const { BrowserManager, browserManager } = await import('../browserManager.js')
const { RendererPool } = await import('../rendererPool.js')
const { config } = await import('../config.js')

function resetSingleton() {
  browserManager.browser = null
  browserManager._launching = null
  browserManager._active = 0
  browserManager._waiters = []
  browserManager._idleTimer = null
  browserManager._closing = null
  browserManager._disposed = false
}

describe('BrowserManager idle close', () => {
  let manager

  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    createdBrowsers.length = 0
    config.browserIdleTimeoutMs = 60000
    resetSingleton()
    manager = new BrowserManager()
  })

  afterEach(() => {
    browserManager._clearIdleTimer()
    vi.useRealTimers()
  })

  it('closes the browser after the idle timeout', async () => {
    await manager.getBrowser()
    expect(createdBrowsers).toHaveLength(1)

    await vi.advanceTimersByTimeAsync(59999)
    expect(createdBrowsers[0].close).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1)
    expect(createdBrowsers[0].close).toHaveBeenCalledTimes(1)
    expect(manager.browser).toBeNull()
  })

  it('relaunches a fresh browser on the next job after an idle close', async () => {
    await manager.getBrowser()
    await vi.advanceTimersByTimeAsync(60000)
    expect(createdBrowsers).toHaveLength(1)

    const page = await manager.newPage()

    expect(createdBrowsers).toHaveLength(2)
    expect(page).toBeDefined()
    expect(manager.browser).toBe(createdBrowsers[1])
  })

  it('makes a job arriving during the close wait, then serve it a fresh browser', async () => {
    await manager.getBrowser()

    // Hold the idle close open long enough for a job to arrive mid-shutdown.
    let finishClose
    createdBrowsers[0].close.mockImplementation(
      () =>
        new Promise(resolve => {
          finishClose = resolve
        })
    )

    await vi.advanceTimersByTimeAsync(60000)
    expect(manager.browser).toBeNull()

    let gotBrowser = false
    const pending = manager.getBrowser().then(browser => {
      gotBrowser = true
      return browser
    })

    // It must NOT resolve while the old browser is still closing.
    await Promise.resolve()
    await Promise.resolve()
    expect(gotBrowser).toBe(false)

    finishClose()
    const browser = await pending

    expect(gotBrowser).toBe(true)
    expect(createdBrowsers).toHaveLength(2)
    expect(browser).toBe(createdBrowsers[1])
  })

  it('never closes while a job holds a render slot (its page)', async () => {
    await manager.getBrowser()
    await manager.acquireSlot()

    await vi.advanceTimersByTimeAsync(1000000)
    expect(createdBrowsers[0].close).not.toHaveBeenCalled()

    manager.releaseSlot()
    await vi.advanceTimersByTimeAsync(60000)
    expect(createdBrowsers[0].close).toHaveBeenCalledTimes(1)
  })

  it('does not close when the timeout is 0 (disabled)', async () => {
    config.browserIdleTimeoutMs = 0

    await manager.getBrowser()
    await vi.advanceTimersByTimeAsync(1000000)

    expect(createdBrowsers[0].close).not.toHaveBeenCalled()
    expect(manager.browser).toBe(createdBrowsers[0])
  })

  it('still closes each job page when the slot is released', async () => {
    const pool = new RendererPool(1)
    await pool.initialize()

    const renderer = await pool.acquire()
    await pool.release(renderer)

    expect(mockClosePage).toHaveBeenCalledTimes(1)
  })
})
