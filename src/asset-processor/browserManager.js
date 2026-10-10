import puppeteer from 'puppeteer'

import { PuppeteerRenderer } from './puppeteerRenderer.js'
import { config } from './config.js'
import logger from './logger.js'

/**
 * The one Chromium instance a worker drives, and the one render slot it runs.
 *
 * Every renderer family in the worker - model / texture-set / environment-map
 * thumbnails, geometry extraction, scene renders and vfx renders - takes its
 * pages from here. They used to each launch their own browser: a restore that
 * re-queued a thousand thumbnails left the host with a full Chromium (tens of
 * processes, gigabytes) per family per worker, ten of them across two workers.
 * One browser with short-lived, job-scoped pages keeps that memory in one place
 * and makes crash/restart a single decision.
 *
 * Lifecycle: launched lazily on the first page request, reused across jobs,
 * replaced only when it has crashed or disconnected, and closed on shutdown.
 * A page belongs to the job that opened it and is closed when the job releases
 * its render slot.
 *
 * Idle close: an idle native app still holds ~3.7 GB because the browser stays
 * open. When the last render job releases its slot, a timer
 * (BROWSER_IDLE_TIMEOUT_MS, default 60000; 0 disables) starts; if no job starts
 * before it fires, the browser is closed and the next job relaunches it lazily.
 * It is never closed while a job holds a page (a held render slot). A job that
 * arrives while an idle close is in flight waits for that close, then gets a
 * fresh browser.
 */
export class BrowserManager {
  constructor() {
    this.browser = null
    this._launching = null
    this._active = 0
    this._waiters = []
    this._idleTimer = null
    this._closing = null
    this._disposed = false
  }

  /**
   * How long the browser may sit with no render job before it is closed.
   * 0 (or a missing/invalid value, e.g. in tests) disables the idle close.
   */
  get idleTimeoutMs() {
    const value = config.browserIdleTimeoutMs
    return Number.isFinite(value) && value > 0 ? value : 0
  }

  /**
   * How many render jobs may hold a page at once. Defaults to one so a worker
   * drives Chromium with a single WebGL context regardless of how many jobs the
   * queue has in flight; an operator can raise it via MAX_CONCURRENT_RENDER_JOBS.
   */
  get concurrencyLimit() {
    return Math.max(1, config.maxConcurrentRenderJobs || 1)
  }

  /**
   * Is this browser still alive? Puppeteer exposes `connected` (boolean) on a
   * real Browser; the optional helpers keep stubs usable in tests.
   */
  _isUsable(browser) {
    if (!browser) return false
    if (typeof browser.connected === 'boolean') return browser.connected
    if (typeof browser.isConnected === 'function') return browser.isConnected()
    return true
  }

  /**
   * The shared browser, launching it on first use. A browser that has crashed or
   * disconnected is replaced here and only here.
   * @returns {Promise<import('puppeteer').Browser>}
   */
  async getBrowser() {
    // A job can arrive while the idle browser is being closed. Wait for that
    // close to finish so we never hand back a browser that is mid-shutdown,
    // then fall through to launch a fresh one.
    while (this._closing) {
      await this._closing
    }

    if (this._isUsable(this.browser)) return this.browser

    // Concurrent first-callers share one launch instead of racing two browsers.
    if (!this._launching) {
      this._launching = this._launch().finally(() => {
        this._launching = null
      })
    }
    return this._launching
  }

  async _launch() {
    if (this.browser) {
      logger.warn('Shared browser is gone; relaunching')
      const dead = this.browser
      this.browser = null
      try {
        await dead.close()
      } catch (error) {
        logger.debug('Error closing dead shared browser', {
          error: error.message,
        })
      }
    }

    logger.info('Launching shared Chromium browser')
    const browser = await puppeteer.launch(PuppeteerRenderer.getLaunchOptions())

    // A browser can die on its own (crash, OOM). Forget it the moment it does,
    // so the next page request launches a replacement instead of reusing a corpse.
    browser.once?.('disconnected', () => {
      if (this.browser === browser) {
        logger.warn('Shared Chromium browser disconnected')
        this.browser = null
      }
    })

    this.browser = browser
    // A launch with no job waiting (e.g. the renderer pool warming up) starts
    // the idle countdown immediately; inside a job `_active` is non-zero and
    // the timer is armed only when the last job releases.
    if (this._active === 0) this._armIdleTimer()
    return browser
  }

  /**
   * Open a page on the shared browser. The caller owns it and must close it.
   * @returns {Promise<import('puppeteer').Page>}
   */
  async newPage() {
    const browser = await this.getBrowser()
    return browser.newPage()
  }

  /**
   * Take the single render slot, waiting for it when another job holds it.
   * Paired with {@link releaseSlot} in a finally.
   */
  async acquireSlot() {
    // A job is starting: cancel any idle countdown.
    this._clearIdleTimer()
    if (this._active < this.concurrencyLimit) {
      this._active++
      return
    }
    await new Promise(resolve => this._waiters.push(resolve))
    this._active++
  }

  /** Give the render slot back and wake the next waiter, if any. */
  releaseSlot() {
    if (this._active > 0) this._active--
    const next = this._waiters.shift()
    if (next) {
      // Handed straight to the next job - still busy, so never idle here.
      next()
      return
    }
    // Only the last job letting go makes the browser idle.
    if (this._active === 0) this._armIdleTimer()
  }

  /** Cancel a pending idle close, if any. */
  _clearIdleTimer() {
    if (this._idleTimer) {
      clearTimeout(this._idleTimer)
      this._idleTimer = null
    }
  }

  /**
   * Schedule the idle close. A no-op while disabled, disposed, a job is active
   * (holds a page), or there is no browser to close.
   */
  _armIdleTimer() {
    this._clearIdleTimer()
    const timeoutMs = this.idleTimeoutMs
    if (this._disposed || timeoutMs <= 0) return
    if (this._active > 0 || !this.browser) return

    this._idleTimer = setTimeout(() => {
      this._idleTimer = null
      this._closeIdleBrowser().catch(error => {
        logger.debug('Error closing idle shared browser', {
          error: error.message,
        })
      })
    }, timeoutMs)
    // Don't let an idle worker be kept alive by the idle timer itself.
    this._idleTimer.unref?.()
  }

  /**
   * Close the shared browser after an idle period. Re-checks that no job holds
   * a page; any that arrived while the timer was pending will have moved
   * `_active` past zero and a fresh browser is launched for them instead.
   */
  async _closeIdleBrowser() {
    if (this._active > 0 || !this.browser) return

    const browser = this.browser
    this.browser = null
    logger.info('Closing idle shared Chromium browser', {
      idleTimeoutMs: this.idleTimeoutMs,
    })

    // Assign before yielding so a job arriving now sees the in-flight close
    // and waits for it (getBrowser) rather than racing this browser's teardown.
    const closing = Promise.resolve()
      .then(() => browser.close())
      .catch(error => {
        logger.debug('Error closing idle shared browser', {
          error: error.message,
        })
      })
    this._closing = closing
    try {
      await closing
    } finally {
      if (this._closing === closing) this._closing = null
    }
  }

  /** Close the shared browser (graceful shutdown). */
  async dispose() {
    logger.info('Disposing shared Chromium browser')
    this._disposed = true
    this._clearIdleTimer()
    // Let any in-flight idle close finish before tearing the browser down.
    if (this._closing) {
      try {
        await this._closing
      } catch {
        // Already logged by _closeIdleBrowser.
      }
    }
    const browser = this.browser
    this.browser = null
    this._waiters = []
    this._active = 0
    if (!browser) return
    try {
      await browser.close()
    } catch (error) {
      logger.debug('Error closing shared browser', { error: error.message })
    }
  }
}

export const browserManager = new BrowserManager()
