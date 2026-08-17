import { describe, expect, it } from 'vitest'

import { buildSceneRenderUrl } from '../sceneRenderer.js'

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
