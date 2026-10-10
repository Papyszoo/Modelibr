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
 */
export class BrowserManager {
  constructor() {
    this.browser = null
    this._launching = null
    this._active = 0
    this._waiters = []
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
    if (next) next()
  }

  /** Close the shared browser (graceful shutdown). */
  async dispose() {
    logger.info('Disposing shared Chromium browser')
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
