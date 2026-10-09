/*
 * The callbacks passed to `page.evaluate` / `page.waitForFunction` are
 * serialised and run in the browser, not in this Node process, so `window` is
 * defined where it matters and undefined to ESLint. Same directive, same reason,
 * as sceneRenderer.js.
 */
/* eslint-disable no-undef */
import puppeteer from 'puppeteer'

import { config } from './config.js'
import logger from './logger.js'
import { PuppeteerRenderer } from './puppeteerRenderer.js'

/**
 * Renders a visual effect as a sequence of stills by photographing the real app.
 *
 * **This deliberately does not draw the effect itself.** The app's VFX runtime
 * is a pure function of time (every particle is derived from a seed, nothing is
 * simulated), and the editor preview already turns it into pixels. A second
 * renderer here would be free to disagree with the one the user looks at, so the
 * worker drives `?render=vfx` and steps the page's clock explicitly: no frame is
 * ever a recording of real-time playback, so a slow software-GL host and a fast
 * GPU produce the same thumbnail.
 *
 * The page publishes `window.__VFX_RENDER__` with `ready`, the number of seconds
 * one loop covers and a `setTime(t)` that resolves once that instant is drawn.
 */
export class VfxRenderer {
  /**
   * @param {import('puppeteer').Browser|null} sharedBrowser
   */
  constructor(sharedBrowser = null) {
    this.browser = sharedBrowser
    this._ownsBrowser = !sharedBrowser
  }

  async initialize() {
    if (!this.browser) {
      this.browser = await puppeteer.launch(
        PuppeteerRenderer.getLaunchOptions()
      )
    }
    return true
  }

  /**
   * Photograph one effect across its whole loop.
   *
   * @param {object} request
   * @param {number} request.vfxId
   * @param {object} [jobLogger]
   * @param {AbortSignal} [signal] - Stops between frames when the queue times the job out.
   * @returns {Promise<{frames: Array<{pixels: Buffer, width: number, height: number}>, windowSeconds: number, frameDelayMs: number}>}
   */
  async render({ vfxId }, jobLogger = logger, signal) {
    const { width, height, targetFps, maxFrames } = config.vfxRender
    const frontendUrl = config.sceneRender.frontendUrl
    const timeoutMs = config.sceneRender.timeoutMs

    if (!frontendUrl) {
      throw new Error(
        'FRONTEND_URL is not configured; the vfx renderer photographs the ' +
          'running app and cannot work without its address'
      )
    }

    if (!this.browser) {
      await this.initialize()
    }

    const url = buildVfxRenderUrl(frontendUrl, {
      vfxId,
      apiBaseUrl: config.apiBaseUrl,
    })
    const page = await this.browser.newPage()
    const pageErrors = []

    try {
      await page.setViewport({ width, height, deviceScaleFactor: 1 })
      page.on('pageerror', error => pageErrors.push(error.message))

      jobLogger.info('Loading vfx render page', { vfxId, url })
      await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: timeoutMs,
      })

      try {
        await page.waitForFunction(
          () => window.__VFX_RENDER__ && window.__VFX_RENDER__.ready,
          { timeout: timeoutMs, polling: 250 }
        )
      } catch (error) {
        // Photographing a page that is still loading would publish a plausible
        // picture of an effect whose assets had not arrived.
        const message = `Vfx ${vfxId} did not become render-ready within ${timeoutMs}ms; no frames were captured`
        jobLogger.warn(message, { vfxId, cause: error?.message })
        throw new Error(message, { cause: error })
      }

      const status = await page.evaluate(() => ({
        ready: window.__VFX_RENDER__.ready,
        windowSeconds: window.__VFX_RENDER__.windowSeconds,
        error: window.__VFX_RENDER__.error,
      }))

      if (status.error) {
        throw new Error(
          `Vfx ${vfxId} could not be drawn: ${String(status.error).slice(0, 1900)}`
        )
      }

      const plan = planVfxFrames(status.windowSeconds, { targetFps, maxFrames })
      jobLogger.info('Rendering vfx frames', {
        vfxId,
        windowSeconds: status.windowSeconds,
        frameCount: plan.frameCount,
        frameDelayMs: plan.frameDelayMs,
      })

      const frames = []
      for (const time of plan.times) {
        if (signal?.aborted) {
          throw new Error('Vfx render aborted by job timeout')
        }
        await page.evaluate(t => window.__VFX_RENDER__.setTime(t), time)
        const pixels = await page.screenshot({ type: 'png' })
        frames.push({ pixels, width, height })
      }

      if (pageErrors.length) {
        jobLogger.warn('Vfx render page reported errors', {
          vfxId,
          errors: pageErrors.slice(0, 5),
        })
      }

      return {
        frames,
        windowSeconds: status.windowSeconds,
        frameDelayMs: plan.frameDelayMs,
      }
    } finally {
      await page.close().catch(() => {})
    }
  }

  async dispose() {
    if (this._ownsBrowser && this.browser) {
      await this.browser.close().catch(() => {})
    }
    this.browser = null
  }
}

/**
 * Which instants of the effect to photograph, and how long to hold each.
 *
 * Frames are spread evenly over the whole window - `i * window / count` - so the
 * loop shows every moment of the effect and its last frame leads straight back
 * into the first. `targetFps` sets the density for short effects; `maxFrames`
 * bounds the file for long ones by lowering the rate (an effect of
 * window > maxFrames / targetFps seconds gets fewer frames per second, each held
 * longer, so the loop still takes the effect's real time).
 *
 * @param {number} windowSeconds
 * @param {{targetFps: number, maxFrames: number}} limits
 * @returns {{frameCount: number, times: number[], frameDelayMs: number}}
 */
export function planVfxFrames(windowSeconds, { targetFps, maxFrames }) {
  if (!Number.isFinite(windowSeconds) || windowSeconds <= 0) {
    throw new Error(
      `The vfx page reported an unusable time window: ${windowSeconds}`
    )
  }

  const frameCount = Math.min(
    maxFrames,
    Math.max(2, Math.ceil(windowSeconds * targetFps))
  )
  const step = windowSeconds / frameCount

  return {
    frameCount,
    times: Array.from({ length: frameCount }, (_, index) => index * step),
    frameDelayMs: Math.round(step * 1000),
  }
}

/**
 * The URL that draws one effect with no editor chrome.
 *
 * Exported so it can be asserted without a browser: a wrong URL looks like
 * "the renderer timed out", because the app serves its normal self for an
 * unrecognised query string and never publishes a status.
 */
export function buildVfxRenderUrl(frontendUrl, { vfxId, apiBaseUrl }) {
  if (!Number.isInteger(Number(vfxId)) || Number(vfxId) <= 0) {
    throw new Error(`vfxId must be a positive integer, got "${vfxId}"`)
  }

  const base = frontendUrl.endsWith('/') ? frontendUrl : `${frontendUrl}/`
  const url = new URL(base)
  url.searchParams.set('render', 'vfx')
  url.searchParams.set('vfxId', String(vfxId))

  // The API address this browser can reach; see buildSceneRenderUrl for why the
  // one baked into the bundle is wrong inside the worker container.
  if (apiBaseUrl) {
    url.searchParams.set('api', apiBaseUrl)
  }

  return url.toString()
}
