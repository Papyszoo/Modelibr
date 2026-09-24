import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { config } from '../config.js'
import {
  buildSceneRenderUrl,
  MAX_SCENE_RENDER_DIAGNOSTIC_LENGTH,
  SceneRenderer,
} from '../sceneRenderer.js'

/**
 * The render URL is worth asserting on its own because getting it wrong does not
 * look like an error: the app serves its normal self for an unrecognised query
 * string, never publishes `window.__SCENE_RENDER__`, and the renderer reports a
 * timeout. "Timed out" would then send someone hunting a slow scene instead of a
 * malformed URL.
 */
describe('buildSceneRenderUrl', () => {
  it('asks for render mode, the scene and the viewpoint', () => {
    const url = new URL(
      buildSceneRenderUrl('http://frontend', {
        sceneId: 12,
        viewpoint: 'front',
      })
    )

    expect(url.searchParams.get('render')).toBe('scene')
    expect(url.searchParams.get('sceneId')).toBe('12')
    expect(url.searchParams.get('view')).toBe('front')
  })

  it('defaults the viewpoint rather than omitting it', () => {
    const url = new URL(buildSceneRenderUrl('http://frontend', { sceneId: 1 }))

    expect(url.searchParams.get('view')).toBe('iso')
  })

  it('works whether or not the configured address has a trailing slash', () => {
    const withSlash = buildSceneRenderUrl('http://frontend:3002/', {
      sceneId: 3,
    })
    const without = buildSceneRenderUrl('http://frontend:3002', { sceneId: 3 })

    expect(withSlash).toBe(without)
  })

  it('keeps a base path, so the app can be served from a sub-path', () => {
    const url = new URL(buildSceneRenderUrl('http://host/app/', { sceneId: 4 }))

    expect(url.pathname).toBe('/app/')
  })

  it('refuses a scene id that is not a positive integer', () => {
    // Better to fail here than to drive a browser at a URL the page will reject,
    // wait out the whole timeout and report it as a render failure.
    for (const bad of [0, -1, 'abc', null, undefined, 1.5]) {
      expect(() =>
        buildSceneRenderUrl('http://frontend', { sceneId: bad })
      ).toThrow(/positive integer/)
    }
  })

  it('tells the page which API to use, because its own is wrong here', () => {
    // The bundle is built with the address a user's browser uses. This browser
    // is inside the worker container, where that address is the worker itself -
    // so without this the page loads and every request fails at once.
    const url = new URL(
      buildSceneRenderUrl('http://frontend', {
        sceneId: 12,
        apiBaseUrl: 'http://webapi:8080',
      })
    )

    expect(url.searchParams.get('api')).toBe('http://webapi:8080')
  })

  it('omits the API override when there is nothing to say', () => {
    const url = new URL(buildSceneRenderUrl('http://frontend', { sceneId: 12 }))

    expect(url.searchParams.has('api')).toBe(false)
  })
})

describe('SceneRenderer', () => {
  const originalFrontendUrl = config.sceneRender.frontendUrl
  const originalTimeoutMs = config.sceneRender.timeoutMs

  let page
  let renderer
  let jobLogger

  beforeEach(() => {
    config.sceneRender.frontendUrl = 'http://frontend'
    config.sceneRender.timeoutMs = 125

    page = {
      setViewport: vi.fn().mockResolvedValue(undefined),
      on: vi.fn(),
      goto: vi.fn().mockResolvedValue(undefined),
      waitForFunction: vi.fn().mockResolvedValue(undefined),
      evaluate: vi.fn().mockResolvedValue({
        ready: true,
        nodesExpected: 2,
        nodesLoaded: 2,
        nodesFailed: 0,
      }),
      screenshot: vi.fn().mockResolvedValue(Buffer.from('rendered-scene')),
      close: vi.fn().mockResolvedValue(undefined),
    }
    renderer = new SceneRenderer({ newPage: vi.fn().mockResolvedValue(page) })
    jobLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
  })

  afterAll(() => {
    config.sceneRender.frontendUrl = originalFrontendUrl
    config.sceneRender.timeoutMs = originalTimeoutMs
  })

  it('photographs a page only after it reports render-ready', async () => {
    const result = await renderer.render({ sceneId: 12 }, jobLogger)

    expect(page.waitForFunction).toHaveBeenCalledWith(expect.any(Function), {
      timeout: 125,
      polling: 250,
    })
    expect(page.screenshot).toHaveBeenCalledOnce()
    expect(result).toMatchObject({
      image: Buffer.from('rendered-scene'),
      status: { ready: true, nodesLoaded: 2, nodesFailed: 0 },
      width: 768,
      height: 768,
    })
    expect(result).not.toHaveProperty('timedOut')
  })

  it('fails a readiness timeout without evaluating or photographing the page', async () => {
    page.waitForFunction.mockRejectedValueOnce(
      new Error('Waiting failed: 125ms exceeded')
    )

    await expect(renderer.render({ sceneId: 12 }, jobLogger)).rejects.toThrow(
      'Scene 12 did not become render-ready within 125ms; no image was captured'
    )

    expect(page.evaluate).not.toHaveBeenCalled()
    expect(page.screenshot).not.toHaveBeenCalled()
    expect(page.close).toHaveBeenCalledOnce()
    expect(jobLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('no image was captured'),
      expect.objectContaining({ cause: 'Waiting failed: 125ms exceeded' })
    )
  })

  it('fails a published renderer error with bounded diagnostics and no image', async () => {
    page.evaluate.mockResolvedValueOnce({
      ready: true,
      nodesExpected: 0,
      nodesLoaded: 0,
      nodesFailed: 0,
      error: 'x'.repeat(5000),
    })

    let failure
    try {
      await renderer.render({ sceneId: 12 }, jobLogger)
    } catch (error) {
      failure = error
    }

    expect(failure).toBeInstanceOf(Error)
    expect(failure.message).toContain('Scene 12 could not be drawn: xxx')
    expect(failure.message.length).toBeLessThan(2000)
    expect(failure.message.length).toBeLessThan(
      MAX_SCENE_RENDER_DIAGNOSTIC_LENGTH + 100
    )
    expect(page.screenshot).not.toHaveBeenCalled()
  })
})
