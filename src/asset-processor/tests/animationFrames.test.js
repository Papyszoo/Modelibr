import { describe, expect, it } from 'vitest'

import { config } from '../config.js'
import { planAnimationFrames } from '../puppeteerRenderer.js'

const limits = config.animationClip

/**
 * The frame plan of an animated model thumbnail. It decides how many stills a
 * clip is sampled at and how long each is held, so a model thumbnail plays at
 * the clip's real speed instead of the encoder's global rate.
 */
describe('planAnimationFrames', () => {
  // The loop has to reach almost to the end of the clip and the delays have to
  // add up to its real length, otherwise the motion reads as too fast or slow.
  it('spreads frames evenly across the clip and plays it in real time', () => {
    const plan = planAnimationFrames(2, {
      targetFps: 15,
      maxFrames: 90,
      minFrames: 2,
    })

    expect(plan.times[0]).toBe(0)
    expect(plan.times.at(-1)).toBeCloseTo(2 - 2 / plan.frameCount, 6)
    expect((plan.frameDelayMs * plan.frameCount) / 1000).toBeCloseTo(2, 6)
  })

  // The committed fixtures: a 1.0 s skinned clip and a 2.0 s morph clip.
  it('samples a 1.0 s clip at 15 frames / ~66.7 ms', () => {
    const plan = planAnimationFrames(1, limits)

    expect(plan.frameCount).toBe(15)
    expect(plan.frameDelayMs).toBeCloseTo(66.7, 1)
  })

  it('samples a 2.0 s clip at 30 frames / ~66.7 ms', () => {
    const plan = planAnimationFrames(2, limits)

    expect(plan.frameCount).toBe(30)
    expect(plan.frameDelayMs).toBeCloseTo(66.7, 1)
  })

  // Regression guard for file size: a long clip keeps the real speed by lowering
  // the rate (each frame held longer) rather than dropping the tail.
  it('caps a long clip at max frames and holds each longer', () => {
    const plan = planAnimationFrames(60, limits)

    expect(plan.frameCount).toBe(90)
    expect(plan.frameDelayMs).toBeCloseTo(60000 / 90, 6)
    expect((plan.frameDelayMs * plan.frameCount) / 1000).toBeCloseTo(60, 6)
  })

  it('always yields at least min frames, even for a 0.1 s clip', () => {
    expect(planAnimationFrames(0.1, limits).frameCount).toBe(2)
  })

  it('refuses a duration the clip could not measure', () => {
    for (const bad of [0, -1, NaN, Infinity, undefined]) {
      expect(() => planAnimationFrames(bad, limits)).toThrow(/duration/)
    }
  })
})
