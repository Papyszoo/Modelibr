import type { VfxComponent, VfxDefinition } from '../../types'
import {
  computeEffectBounds,
  frameThumbnailCamera,
  pointScaleFor,
  thumbnailWindowSeconds,
} from '../vfxFraming'

const sparks = (overrides: Partial<VfxComponent> = {}): VfxComponent => ({
  id: 'sparks',
  type: 'particles',
  name: 'Sparks',
  start: 0,
  duration: 1,
  position: [0, 0, 0],
  particles: {
    mode: 'continuous',
    rate: 40,
    count: 10,
    lifetime: 1,
    speed: 2,
    spread: 20,
    gravity: -2,
    sizeStart: 0.2,
    sizeEnd: 0,
    colorStart: '#ffffff',
    colorEnd: '#ff0000',
    opacityStart: 1,
    opacityEnd: 0.5,
    blending: 'additive',
    seed: 3,
  },
  ...overrides,
})

const effect = (
  overrides: Partial<VfxDefinition> = {},
  components: VfxComponent[] = [sparks()]
): VfxDefinition => ({
  version: 1,
  duration: 2,
  loop: false,
  components,
  ...overrides,
})

describe('thumbnailWindowSeconds', () => {
  // Regression: the loop must show the WHOLE effect. A looping effect wraps at its
  // duration, so that is one cycle - not the longer tail a one-shot would have.
  it('covers exactly one cycle of a looping effect', () => {
    expect(thumbnailWindowSeconds(effect({ loop: true, duration: 8 }))).toBe(8)
  })

  it('covers a one-shot effect through the end of its last particle', () => {
    // Emission stops at 1 s but the last particle lives 1 s more.
    expect(thumbnailWindowSeconds(effect({ duration: 1 }))).toBe(2)
  })

  it('never ends before the effect duration', () => {
    const quiet = effect({ duration: 6 }, [])
    expect(thumbnailWindowSeconds(quiet)).toBe(6)
  })

  it('ignores particle lifetime on a looping effect', () => {
    const looping = effect({ loop: true, duration: 2 }, [
      sparks({ start: 1, duration: 1 }),
    ])
    expect(thumbnailWindowSeconds(looping)).toBe(2)
  })
})

describe('computeEffectBounds', () => {
  it('frames the default spot for an effect that draws nothing', () => {
    const bounds = computeEffectBounds(effect({}, []), 2)
    expect(bounds.center).toEqual([0, 0.8, 0])
    expect(bounds.radius).toBeGreaterThan(0)
  })

  it('grows with how far the particles travel', () => {
    const slow = sparks()
    const fast = sparks({
      particles: { ...sparks().particles!, speed: 10 },
    })

    const small = computeEffectBounds(effect({}, [slow]), 2)
    const large = computeEffectBounds(effect({}, [fast]), 2)

    expect(large.radius).toBeGreaterThan(small.radius * 2)
  })

  it('moves the centre with the emitter position', () => {
    const moved = sparks({ position: [10, 0, 0] })
    const bounds = computeEffectBounds(effect({}, [moved]), 2)
    expect(bounds.center[0]).toBeGreaterThan(8)
  })

  it('does not zoom past a minimum radius for a tiny effect', () => {
    const tiny = sparks({
      particles: { ...sparks().particles!, speed: 0, sizeStart: 0.01 },
    })
    expect(
      computeEffectBounds(effect({}, [tiny]), 2).radius
    ).toBeGreaterThanOrEqual(0.75)
  })
})

describe('frameThumbnailCamera', () => {
  it('stands far enough back that the whole bounding sphere fits the view', () => {
    const bounds = { center: [0, 1, 0] as [number, number, number], radius: 3 }
    const camera = frameThumbnailCamera(bounds)

    const distance = Math.hypot(
      camera.position[0] - bounds.center[0],
      camera.position[1] - bounds.center[1],
      camera.position[2] - bounds.center[2]
    )
    // The sphere subtends asin(radius / distance); it must stay inside half the fov.
    const halfFov = (camera.fov * Math.PI) / 360
    expect(Math.asin(bounds.radius / distance)).toBeLessThan(halfFov)
    expect(camera.target).toEqual(bounds.center)
  })

  it('is the same view for the same effect', () => {
    const bounds = computeEffectBounds(effect(), 2)
    expect(frameThumbnailCamera(bounds)).toEqual(frameThumbnailCamera(bounds))
  })
})

describe('pointScaleFor', () => {
  it('scales particle sizes with the canvas height', () => {
    expect(pointScaleFor(512, 40)).toBeCloseTo(pointScaleFor(256, 40) * 2)
  })
})
