import { describe, expect, it } from 'vitest'

import { config } from '../config.js'
import { buildVfxRenderUrl, planVfxFrames } from '../vfxRenderer.js'

const limits = config.vfxRender

describe('planVfxFrames', () => {
  // The thumbnail is of the WHOLE effect, so the spread has to reach almost to the end
  // of the window and the delays have to add up to its real length.
  it('spreads frames evenly across the whole window and plays it in real time', () => {
    const plan = planVfxFrames(2, limits)

    expect(plan.times[0]).toBe(0)
    expect(plan.times.at(-1)).toBeCloseTo(2 - 2 / plan.frameCount)
    expect((plan.frameDelayMs * plan.frameCount) / 1000).toBeCloseTo(2, 1)
  })

  it('uses the target frame rate for a short effect', () => {
    const plan = planVfxFrames(2, { targetFps: 15, maxFrames: 90 })

    expect(plan.frameCount).toBe(30)
    expect(plan.frameDelayMs).toBe(67)
  })

  // Regression guard for file size: an 8 s effect is shown in full (not a 1-2 s excerpt)
  // and a 60 s one stays bounded by lowering the rate rather than dropping the tail.
  it('shows an 8 s effect in full and caps the frame count for a 60 s one', () => {
    const eight = planVfxFrames(8, { targetFps: 15, maxFrames: 90 })
    expect(eight.frameCount).toBe(90)
    expect(eight.times.at(-1)).toBeGreaterThan(7.8)

    const minute = planVfxFrames(60, { targetFps: 15, maxFrames: 90 })
    expect(minute.frameCount).toBe(90)
    expect(minute.times.at(-1)).toBeGreaterThan(59)
    expect(minute.frameDelayMs).toBe(667)
  })

  it('always has at least two frames, even for a 0.1 s flash', () => {
    expect(planVfxFrames(0.1, limits).frameCount).toBe(2)
  })

  it('refuses a window the page could not measure', () => {
    for (const bad of [0, -1, NaN, undefined]) {
      expect(() => planVfxFrames(bad, limits)).toThrow(/time window/)
    }
  })
})

describe('buildVfxRenderUrl', () => {
  it('asks for render mode and the effect', () => {
    const url = new URL(buildVfxRenderUrl('http://frontend', { vfxId: 12 }))

    expect(url.searchParams.get('render')).toBe('vfx')
    expect(url.searchParams.get('vfxId')).toBe('12')
  })

  it('tells the page which API to use, because its own is wrong inside the worker', () => {
    const url = new URL(
      buildVfxRenderUrl('http://frontend', {
        vfxId: 12,
        apiBaseUrl: 'http://webapi:8080',
      })
    )

    expect(url.searchParams.get('api')).toBe('http://webapi:8080')
  })

  it('works with or without a trailing slash and keeps a base path', () => {
    expect(buildVfxRenderUrl('http://f:3002/', { vfxId: 1 })).toBe(
      buildVfxRenderUrl('http://f:3002', { vfxId: 1 })
    )
    expect(
      new URL(buildVfxRenderUrl('http://host/app/', { vfxId: 1 })).pathname
    ).toBe('/app/')
  })

  it('refuses an id that is not a positive integer', () => {
    for (const bad of [0, -1, 'abc', null, undefined, 1.5]) {
      expect(() =>
        buildVfxRenderUrl('http://frontend', { vfxId: bad })
      ).toThrow(/positive integer/)
    }
  })
})
