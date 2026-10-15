import { PuppeteerRenderer } from './puppeteerRenderer.js'
import { browserManager } from './browserManager.js'
import { config } from './config.js'
import logger from './logger.js'

/**
 * Hands out renderer slots that all share the worker's single browser, and
 * caps how many jobs may render at once (see browserManager).
 *
 * A page belongs to a job: it is opened on the renderer when the job first uses
 * it and closed in `release()`, so a job's WebGL scene is not held between jobs.
 * `acquire()` blocks while all slots are busy.
 *
 * Usage:
 *   const pool = new RendererPool()
 *   await pool.initialize()
 *
 *   const renderer = await pool.acquire()
 *   try {
 *     await renderer.loadModel(...)
 *     const frames = await renderer.renderOrbitFrames(...)
 *   } finally {
 *     await pool.release(renderer)
 *   }
 */
export class RendererPool {
  /**
   * @param {number} [poolSize] - Number of renderer slots.
   *   Defaults to config.maxConcurrentJobs (typically 3).
   */
  constructor(poolSize) {
    this.poolSize = poolSize || config.maxConcurrentJobs || 3
    /** @type {PuppeteerRenderer[]} */
    this.available = []
    /** @type {PuppeteerRenderer[]} */
    this.allRenderers = []
    /** @type {Array<(renderer: PuppeteerRenderer) => void>} */
    this._waiting = []
    this._initialized = false
  }

  /**
   * Create the renderer slots on the shared browser. No page is opened here -
   * a page belongs to the job that renders with it.
   */
  async initialize() {
    if (this._initialized) return

    logger.info('Initializing renderer pool', { poolSize: this.poolSize })

    const browser = await browserManager.getBrowser()

    for (let i = 0; i < this.poolSize; i++) {
      const renderer = new PuppeteerRenderer(browser)
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
   * Acquire an exclusive renderer from the pool and one render slot. If all
   * renderers are in use, the call blocks until one is released.
   * @returns {Promise<PuppeteerRenderer>}
   */
  async acquire() {
    if (!this._initialized) {
      await this.initialize()
    }

    let renderer
    if (this.available.length > 0) {
      renderer = this.available.shift()
    } else {
      // All renderers busy - wait for one to be released
      renderer = await new Promise(resolve => {
        this._waiting.push(resolve)
      })
    }

    // The shared browser may have been relaunched after a crash while this
    // renderer sat idle; hand it the current one so its page recovery works.
    renderer.browser = await browserManager.getBrowser()
    await browserManager.acquireSlot()
    return renderer
  }

  /**
   * Return a renderer after use: close the job's page and give the slot back.
   * @param {PuppeteerRenderer} renderer
   */
  async release(renderer) {
    if (renderer) {
      await renderer.closePage()
    }

    const waiter = this._waiting.shift()
    if (waiter) {
      // Hand directly to the next waiting caller
      waiter(renderer)
    } else {
      this.available.push(renderer)
    }

    browserManager.releaseSlot()
  }

  /**
   * Force a specific renderer to reinitialize - used when the job holding
   * it times out. Reuses the renderer's own crash-recovery machinery (the
   * same path taken when a page detaches/crashes mid-render) so the pool
   * gets back a USABLE renderer instead of one still stuck mid-render.
   *
   * This only repairs the renderer in place; it does not touch `available`
   * or `_waiting`. The caller (the abandoned job's own processor, reacting
   * to the same abort) is still responsible for eventually calling
   * `release()` once its try/finally unwinds.
   * @param {PuppeteerRenderer} renderer
   */
  async forceReinit(renderer) {
    if (!renderer) return
    logger.warn('Force-reinitializing renderer pool slot (job aborted)')
    await renderer.reinitialize()
  }

  /**
   * Close every slot's page. The shared browser itself is worker-wide and is
   * closed by browserManager on shutdown, not here.
   */
  async dispose() {
    logger.info('Disposing renderer pool')

    for (const renderer of this.allRenderers) {
      try {
        await renderer.closePage()
      } catch (e) {
        logger.debug('Error closing pool page', { error: e.message })
      }
    }

    this.available = []
    this.allRenderers = []
    this._waiting = []
    this._initialized = false
    logger.info('Renderer pool disposed')
  }
}
