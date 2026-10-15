import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * The worker must drive exactly one Chromium. A restore that re-queues a
 * thousand thumbnails used to leave one full browser per renderer family per
 * worker because each family launched its own; these cover the shared-manager
 * contract that replaced that: one lazy launch, reused across jobs, replaced
 * only when it has crashed or disconnected, and one render slot.
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
  config: { maxConcurrentRenderJobs: 1 },
}))

const createdBrowsers = []

const mockLaunch = vi.fn(() => {
  const browser = {
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
  createdBrowsers.push(browser)
  return Promise.resolve(browser)
})

vi.mock('puppeteer', () => ({
  default: { launch: (...args) => mockLaunch(...args) },
}))

vi.mock('../puppeteerRenderer.js', () => {
  const PuppeteerRenderer = vi.fn()
  PuppeteerRenderer.getLaunchOptions = vi.fn(() => ({}))
  return { PuppeteerRenderer }
})

const { BrowserManager } = await import('../browserManager.js')

describe('BrowserManager', () => {
  let manager

  beforeEach(() => {
    vi.clearAllMocks()
    createdBrowsers.length = 0
    manager = new BrowserManager()
  })

  it('launches once and reuses the browser across jobs', async () => {
    await manager.newPage()
    await manager.newPage()

    expect(mockLaunch).toHaveBeenCalledTimes(1)
  })

  it('shares a single launch between concurrent first requests', async () => {
    await Promise.all([
      manager.getBrowser(),
      manager.getBrowser(),
      manager.getBrowser(),
    ])

    expect(mockLaunch).toHaveBeenCalledTimes(1)
  })

  it('relaunches only after the browser disconnects', async () => {
    const first = await manager.getBrowser()
    first.emitDisconnected()

    const second = await manager.getBrowser()

    expect(mockLaunch).toHaveBeenCalledTimes(2)
    expect(second).not.toBe(first)
  })

  it('relaunches when the cached browser reports it is disconnected', async () => {
    const first = await manager.getBrowser()
    first.connected = false

    const second = await manager.getBrowser()

    expect(mockLaunch).toHaveBeenCalledTimes(2)
    expect(second).not.toBe(first)
  })

  it('caps concurrent render slots at the configured limit', async () => {
    await manager.acquireSlot()

    let secondAcquired = false
    const second = manager.acquireSlot().then(() => {
      secondAcquired = true
    })

    // Let any pending microtasks run; the second slot must still be waiting.
    await Promise.resolve()
    expect(secondAcquired).toBe(false)

    manager.releaseSlot()
    await second
    expect(secondAcquired).toBe(true)
  })

  it('closes the browser on dispose', async () => {
    const browser = await manager.getBrowser()

    await manager.dispose()

    expect(browser.close).toHaveBeenCalledTimes(1)
    expect(manager.browser).toBeNull()
  })
})
