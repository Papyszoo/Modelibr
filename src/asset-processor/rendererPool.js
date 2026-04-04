import puppeteer from 'puppeteer'
import { PuppeteerRenderer } from './puppeteerRenderer.js'
import { config } from './config.js'
import logger from './logger.js'

/**
 * Pool of PuppeteerRenderer instances sharing a single browser.
 *
 * Each renderer has its own page (and therefore its own WebGL context),
 * so concurrent jobs never interfere with each other's scenes.
 *
 * Usage:
 *   const pool = new RendererPool()
 *   await pool.initialize()
 *
 *   const renderer = await pool.acquire()   // blocks if all slots busy
 *   try {
 *     await renderer.loadModel(...)
 *     const frames = await renderer.renderOrbitFrames(...)
 *   } finally {
 *     pool.release(renderer)
 *   }
 */
export class RendererPool {
  /**
   * @param {number} [poolSize] - Number of renderer instances.
   *   Defaults to config.maxConcurrentJobs (typically 3).
   */
  constructor(poolSize) {
    this.poolSize = poolSize || config.maxConcurrentJobs || 3
    this.browser = null
    /** @type {PuppeteerRenderer[]} */
    this.available = []
    /** @type {PuppeteerRenderer[]} */
    this.allRenderers = []
    /** @type {Array<(renderer: PuppeteerRenderer) => void>} */
    this._waiting = []
    this._initialized = false
  }

  /**
   * Launch the shared browser and create the renderer pool.
   */
  async initialize() {
    if (this._initialized) return

    logger.info('Initializing renderer pool', { poolSize: this.poolSize })

    this.browser = await puppeteer.launch(PuppeteerRenderer.getLaunchOptions())

    for (let i = 0; i < this.poolSize; i++) {
      const renderer = new PuppeteerRenderer(this.browser)
      await renderer.initialize()
      this.available.push(renderer)
      this.allRenderers.push(renderer)
      logger.debug('Renderer pool slot initialized', {
        slot: i + 1,
        total: this.poolSize,
      })
    }

    this._initialized = true
    logger.info('Renderer pool ready', { poolSize: this.poolSize })
  }

  /**
   * Acquire an exclusive renderer from the pool.
   * If all renderers are in use, the call blocks until one is released.
   * @returns {Promise<PuppeteerRenderer>}
   */
  async acquire() {
    if (!this._initialized) {
      await this.initialize()
    }

    if (this.available.length > 0) {
      return this.available.shift()
    }

    // All renderers busy — wait for one to be released
    return new Promise(resolve => {
      this._waiting.push(resolve)
    })
  }

  /**
   * Return a renderer to the pool after use.
   * @param {PuppeteerRenderer} renderer
   */
  release(renderer) {
    const waiter = this._waiting.shift()
    if (waiter) {
      // Hand directly to the next waiting caller
      waiter(renderer)
    } else {
      this.available.push(renderer)
    }
  }

  /**
   * Shut down all renderers and the shared browser.
   */
  async dispose() {
    logger.info('Disposing renderer pool')

    for (const renderer of this.allRenderers) {
      try {
        if (renderer.page) {
          await renderer.page.close()
          renderer.page = null
        }
      } catch (e) {
        logger.debug('Error closing pool page', { error: e.message })
      }
    }

    this.available = []
    this.allRenderers = []
    this._waiting = []

    if (this.browser) {
      try {
        await this.browser.close()
      } catch (e) {
        logger.debug('Error closing pool browser', { error: e.message })
      }
      this.browser = null
    }

    this._initialized = false
    logger.info('Renderer pool disposed')
  }
}
