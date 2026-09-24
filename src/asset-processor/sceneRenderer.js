/*
 * The callbacks passed to `page.evaluate` / `page.waitForFunction` are
 * serialised and run in the browser, not in this Node process, so `window` is
 * defined where it matters and undefined to ESLint. Same directive, same reason,
 * as puppeteerRenderer.js.
 */
/* eslint-disable no-undef */
import puppeteer from 'puppeteer'

import { config } from './config.js'
import logger from './logger.js'
import { PuppeteerRenderer } from './puppeteerRenderer.js'

/**
 * Renders a saved scene by photographing the real application.
 *
 * **This deliberately does not assemble the scene itself.** The app already
 * knows how to draw one - which files a node resolves to, how a loose glTF finds
 * its buffers, which texture set overrides a material, and where an asset's
 * measured origin puts it on the floor. Re-implementing that here would create a
 * second renderer free to disagree with the one the user looks at, and an agent
 * checking its own work against a render that disagrees with the editor learns
 * nothing. So the worker drives `?render=scene` and takes a picture.
 *
 * The page publishes `window.__SCENE_RENDER__` and flips `ready` once every
 * visible node has stopped loading - failures included, because a node that did
 * not load is part of what the scene currently looks like. A page that does not
 * reach that state is a failed render, not a render of its current loading state.
 */
export class SceneRenderer {
  /**
   * @param {import('puppeteer').Browser|null} sharedBrowser - Reuse a browser
   *   from the pool rather than launching one. Scene renders and thumbnail
   *   renders compete for the same GPU/software-WebGL budget, so sharing keeps
   *   that contention in one place.
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
   * Photograph one scene.
   *
   * @param {object} request
   * @param {number} request.sceneId
   * @param {string} [request.viewpoint] - iso | front | side | top.
   * @param {number} [request.width]
   * @param {number} [request.height]
   * @param {object} [jobLogger]
   * @returns {Promise<{image: Buffer, status: object, width: number, height: number}>}
   */
  async render(request, jobLogger = logger) {
    const {
      sceneId,
      viewpoint = 'iso',
      width = config.sceneRender.width,
      height = config.sceneRender.height,
    } = request

    const frontendUrl = config.sceneRender.frontendUrl
    if (!frontendUrl) {
      throw new Error(
        'FRONTEND_URL is not configured; the scene renderer photographs the ' +
          'running app and cannot work without its address'
      )
    }

    if (!this.browser) {
      await this.initialize()
    }

    const url = buildSceneRenderUrl(frontendUrl, {
      sceneId,
      viewpoint,
      apiBaseUrl: config.apiBaseUrl,
    })
    const page = await this.browser.newPage()
    const pageErrors = []

    try {
      await page.setViewport({ width, height, deviceScaleFactor: 1 })
      page.on('pageerror', error => pageErrors.push(error.message))

      jobLogger.info('Loading scene render page', { sceneId, viewpoint, url })
      await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: config.sceneRender.timeoutMs,
      })

      try {
        await page.waitForFunction(
          () => window.__SCENE_RENDER__ && window.__SCENE_RENDER__.ready,
          { timeout: config.sceneRender.timeoutMs, polling: 250 }
        )
      } catch (error) {
        // Readiness is the truth boundary for this image. Photographing a page that is
        // still loading would turn a failed render into a plausible-looking answer to a
        // question the page has not finished answering. Do not even take diagnostic
        // screenshots here: there is no separately addressed diagnostic store to receive
        // them, and the bytes must never become a normal render artifact by accident.
        const message = `Scene ${sceneId} did not become render-ready within ${config.sceneRender.timeoutMs}ms; no image was captured`
        jobLogger.warn(message, {
          sceneId,
          timeoutMs: config.sceneRender.timeoutMs,
          cause: boundRendererDiagnostic(error?.message ?? error),
        })
        throw new Error(message, { cause: error })
      }

      const status = (await page.evaluate(
        () => window.__SCENE_RENDER__ ?? null
      )) ?? {
        ready: false,
        nodesExpected: 0,
        nodesLoaded: 0,
        nodesFailed: 0,
      }

      if (!status.ready) {
        throw new Error(
          `Scene ${sceneId} published a render status that was not ready; no image was captured`
        )
      }

      if (status.error) {
        const diagnostic = boundRendererDiagnostic(status.error)
        throw new Error(`Scene ${sceneId} could not be drawn: ${diagnostic}`)
      }

      const image = await page.screenshot({ type: 'png' })

      jobLogger.info('Scene rendered', {
        sceneId,
        viewpoint,
        width,
        height,
        nodesLoaded: status.nodesLoaded,
        nodesFailed: status.nodesFailed,
        bytes: image.length,
      })

      if (pageErrors.length) {
        jobLogger.warn('Scene render page reported errors', {
          sceneId,
          errors: pageErrors.slice(0, 5),
        })
      }

      // width/height come back with the picture rather than being re-derived by the
      // caller: they are the viewport this was actually shot at, and a caller reading
      // them from config would be guessing right only while nothing overrides them.
      return { image, status, width, height }
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

// ThumbnailJob's domain error limit is 2,000 characters. Leave room for the scene id and
// message prefix so a verbose browser/network diagnostic can be reported as the render
// failure without making the backend reject the job update that records it.
export const MAX_SCENE_RENDER_DIAGNOSTIC_LENGTH = 1900

function boundRendererDiagnostic(value) {
  const diagnostic = String(value ?? 'no diagnostic').trim()
  if (diagnostic.length <= MAX_SCENE_RENDER_DIAGNOSTIC_LENGTH) {
    return diagnostic
  }

  return `${diagnostic.slice(0, MAX_SCENE_RENDER_DIAGNOSTIC_LENGTH - 3)}...`
}

/**
 * The URL that draws one scene with no editor chrome.
 *
 * Exported so it can be asserted without a browser: getting this wrong is the
 * failure that looks like "the renderer timed out" rather than "the URL was
 * wrong", because the app happily serves its normal self for an unrecognised
 * query string and simply never publishes a status.
 */
export function buildSceneRenderUrl(
  frontendUrl,
  { sceneId, viewpoint = 'iso', apiBaseUrl }
) {
  if (!Number.isInteger(Number(sceneId)) || Number(sceneId) <= 0) {
    throw new Error(`sceneId must be a positive integer, got "${sceneId}"`)
  }

  const base = frontendUrl.endsWith('/') ? frontendUrl : `${frontendUrl}/`
  const url = new URL(base)
  url.searchParams.set('render', 'scene')
  url.searchParams.set('sceneId', String(sceneId))
  url.searchParams.set('view', String(viewpoint))

  // The API address the page should use, which is not the one it was built
  // with. VITE_API_BASE_URL is baked in for the browser a user runs - a host
  // address, reachable because the user is on the host. This browser is inside
  // the worker container, where that address is the worker itself, so every
  // request fails at once and the page reports a network error rather than
  // timing out. We know an address that works, because we use it.
  if (apiBaseUrl) {
    url.searchParams.set('api', apiBaseUrl)
  }

  return url.toString()
}
