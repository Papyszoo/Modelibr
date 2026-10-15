import type { VfxComponent, VfxEmitter, VfxParticles } from '../../types'
import {
  createParticleBuffers,
  emitterMaxRadius,
  emitterRadii,
  maxKeyframeValue,
  particleRandom,
  sampleEmitterOrigin,
  sampleParticles,
  sampleTrack,
} from '../vfxRuntime'

const particles = (overrides: Partial<VfxParticles> = {}): VfxParticles => ({
  mode: 'continuous',
  rate: 10,
  count: 20,
  lifetime: 1,
  speed: 2,
  spread: 30,
  gravity: -9.8,
  sizeStart: 1,
  sizeEnd: 0,
  colorStart: '#ff0000',
  colorEnd: '#0000ff',
  opacityStart: 1,
  opacityEnd: 0,
  blending: 'additive',
  seed: 7,
  ...overrides,
})

/** A particles component. The emitter sits on the component, as the server stores it. */
const emitter = (
  p: VfxParticles,
  componentEmitter?: VfxEmitter,
  start = 0,
  duration = 1
): VfxComponent => ({
  id: 'sparks',
  type: 'particles',
  name: 'Sparks',
  start,
  duration,
  particles: p,
  emitter: componentEmitter,
})

describe('sampleTrack', () => {
  it('interpolates linearly and clamps at both ends', () => {
    const keys: [number, number][] = [
      [0, 0],
      [1, 10],
    ]
    expect(sampleTrack(keys, -1, 5)).toBe(0)
    expect(sampleTrack(keys, 0.25, 5)).toBeCloseTo(2.5)
    expect(sampleTrack(keys, 2, 5)).toBe(10)
  })

  it('falls back when there are no keys', () => {
    expect(sampleTrack(undefined, 0.5, 3)).toBe(3)
    expect(sampleTrack([], 0.5, 3)).toBe(3)
  })
})

describe('maxKeyframeValue', () => {
  it('takes the largest track value, zero when empty', () => {
    expect(
      maxKeyframeValue([
        [0, 2],
        [1, 9],
      ])
    ).toBe(9)
    expect(maxKeyframeValue([])).toBe(0)
    expect(maxKeyframeValue(undefined)).toBe(0)
  })
})

describe('sampleParticles', () => {
  it('is a pure function of time, so scrubbing reproduces playback', () => {
    const component = emitter(particles())
    const a = createParticleBuffers(100)
    const b = createParticleBuffers(100)
    const countA = sampleParticles(component, component.particles!, 0.42, a)
    const countB = sampleParticles(component, component.particles!, 0.42, b)
    expect(countA).toBe(countB)
    expect(Array.from(a.positions.slice(0, countA * 3))).toEqual(
      Array.from(b.positions.slice(0, countB * 3))
    )
  })

  it('emits rate particles per second while the component plays', () => {
    const component = emitter(particles({ rate: 10, lifetime: 5 }))
    const out = createParticleBuffers(100)
    // Born at 0, 0.1, ... 0.4 by t = 0.45.
    expect(sampleParticles(component, component.particles!, 0.45, out)).toBe(5)
  })

  it('stops emitting at the end of the component but lets particles live out their lifetime', () => {
    const component = emitter(
      particles({ rate: 10, lifetime: 1 }),
      undefined,
      0,
      0.5
    )
    const out = createParticleBuffers(100)
    // Births at 0..0.4 (five); at t = 1.2 only those born after 0.2 are alive.
    expect(sampleParticles(component, component.particles!, 1.2, out)).toBe(2)
    expect(sampleParticles(component, component.particles!, 1.5, out)).toBe(0)
  })

  it('releases a burst at the component start and nothing before it', () => {
    const component = emitter(
      particles({ mode: 'burst', count: 12 }),
      undefined,
      0.5
    )
    const out = createParticleBuffers(100)
    expect(sampleParticles(component, component.particles!, 0.4, out)).toBe(0)
    expect(sampleParticles(component, component.particles!, 0.6, out)).toBe(12)
    expect(sampleParticles(component, component.particles!, 1.6, out)).toBe(0)
  })

  it('interpolates size, colour and opacity over each particle life', () => {
    const component = emitter(particles({ mode: 'burst', count: 1 }))
    const out = createParticleBuffers(4)
    sampleParticles(component, component.particles!, 0.5, out)
    expect(out.sizes[0]).toBeCloseTo(0.5)
    expect(out.alphas[0]).toBeCloseTo(0.5)
    expect(out.colors[0]).toBeCloseTo(0.5)
    expect(out.colors[2]).toBeCloseTo(0.5)
  })

  it('never writes more particles than the buffer holds', () => {
    const component = emitter(particles({ mode: 'burst', count: 5000 }))
    const out = createParticleBuffers(10)
    expect(sampleParticles(component, component.particles!, 0.1, out)).toBe(10)
  })
})

describe('particleRandom', () => {
  it('is stable for the same inputs and stays in 0..1', () => {
    const value = particleRandom(3, 17, 1)
    expect(particleRandom(3, 17, 1)).toBe(value)
    expect(value).toBeGreaterThanOrEqual(0)
    expect(value).toBeLessThan(1)
    expect(particleRandom(3, 18, 1)).not.toBe(value)
  })
})

const SAMPLES = 10000

describe('sampleEmitterOrigin', () => {
  const disc: VfxEmitter = { shape: 'disc', radius: 4 }
  const ring: VfxEmitter = { shape: 'ring', innerRadius: 2, outerRadius: 4 }

  // Regression: drawing the radius uniformly instead of by area piled the
  // spawns up at the centre, so a ground puddle came out as a blob not a disc.
  it('fills a disc uniformly by area and never leaves it', () => {
    let insideHalf = 0
    let inside = 0
    for (let index = 0; index < SAMPLES; index++) {
      const [x, z] = sampleEmitterOrigin(disc, 7, index, 0, 4)
      const r = Math.hypot(x, z)
      if (r <= 4 + 1e-6) inside++
      if (r <= 2) insideHalf++
    }

    expect(inside).toBe(SAMPLES)
    // Area inside half the radius is a quarter of the disc.
    expect(insideHalf / SAMPLES).toBeCloseTo(0.25, 1)
  })

  it('fills a ring between inner and outer radius, uniform by area', () => {
    let inside = 0
    let innerHalf = 0
    for (let index = 0; index < SAMPLES; index++) {
      const [x, z] = sampleEmitterOrigin(ring, 7, index, 2, 4)
      const r = Math.hypot(x, z)
      if (r >= 2 - 1e-6 && r <= 4 + 1e-6) inside++
      if (r <= 3) innerHalf++
    }

    expect(inside).toBe(SAMPLES)
    // Area up to r = 3 over the band 2..4 is (9 - 4) / (16 - 4) = 5/12.
    expect(innerHalf / SAMPLES).toBeCloseTo(5 / 12, 1)
  })

  it('is deterministic per seed, and a point emitter stays at the origin', () => {
    expect(sampleEmitterOrigin(disc, 7, 7, 0, 4)).toEqual(
      sampleEmitterOrigin(disc, 7, 7, 0, 4)
    )
    expect(sampleEmitterOrigin({ shape: 'point' }, 7, 7, 0, 4)).toEqual([0, 0])
    expect(sampleEmitterOrigin(undefined, 7, 7, 0, 4)).toEqual([0, 0])
  })
})

describe('emitterRadii', () => {
  it('overrides a disc radius with the radius track', () => {
    const keys: [number, number][] = [
      [0, 2],
      [1, 10],
    ]
    expect(
      emitterRadii({ shape: 'disc', radius: 5 }, keys, 0.5).outer
    ).toBeCloseTo(6)
  })

  it('scales a ring inner radius by the same factor as its outer radius', () => {
    const radii = emitterRadii(
      { shape: 'ring', innerRadius: 2, outerRadius: 4 },
      [[0, 8]],
      0
    )
    expect(radii.outer).toBeCloseTo(8)
    expect(radii.inner).toBeCloseTo(4)
  })

  it('has no radius for a point emitter', () => {
    expect(emitterRadii(undefined, undefined, 0)).toEqual({
      inner: 0,
      outer: 0,
    })
  })
})

describe('emitterMaxRadius', () => {
  it('takes the larger of the authored radius and the radius track', () => {
    const disc: VfxEmitter = { shape: 'disc', radius: 3 }
    expect(
      emitterMaxRadius(disc, [
        [0, 2],
        [1, 9],
      ])
    ).toBe(9)
    expect(emitterMaxRadius(disc, undefined)).toBe(3)
    expect(emitterMaxRadius(undefined, undefined)).toBe(0)
  })
})

describe('sampleParticles with a ground emitter', () => {
  it('offsets spawn positions onto the disc while staying a pure function of time', () => {
    const component = emitter(
      particles({
        speed: 0,
        lifetime: 2,
      }),
      { shape: 'disc', radius: 3 }
    )
    const a = createParticleBuffers(50)
    const b = createParticleBuffers(50)
    const countA = sampleParticles(component, component.particles!, 0.5, a)
    sampleParticles(component, component.particles!, 0.5, b)

    expect(Array.from(a.positions.slice(0, countA * 3))).toEqual(
      Array.from(b.positions.slice(0, countA * 3))
    )
    for (let i = 0; i < countA; i++) {
      expect(
        Math.hypot(a.positions[i * 3], a.positions[i * 3 + 2])
      ).toBeLessThan(3.0001)
    }
  })

  // The definition the server and the Godot export store: a component-level
  // emitter plus a radius track on the particles component. The preview read the
  // emitter from inside `particles` and spawned every particle at the origin.
  it('spawns inside the disc for a definition shaped like the backend stores it', () => {
    const component = emitter(particles({ speed: 0, lifetime: 2 }), {
      shape: 'disc',
      radius: 1.5,
    })
    component.tracks = { radius: [[0, 1.5]] }

    const out = createParticleBuffers(50)
    const count = sampleParticles(component, component.particles!, 0.5, out)
    expect(count).toBeGreaterThan(0)
    for (let i = 0; i < count; i++) {
      expect(
        Math.hypot(out.positions[i * 3], out.positions[i * 3 + 2])
      ).toBeLessThanOrEqual(1.5001)
    }
  })

  // Regression: the spawn radius was evaluated at the current frame, so a
  // growing emitter dragged every particle already in flight outward.
  it('places each particle with the radius in force at its own birth time', () => {
    const component = emitter(
      particles({ speed: 0, gravity: 0, lifetime: 3, rate: 10 }),
      { shape: 'disc', radius: 1 }
    )
    component.tracks = {
      radius: [
        [0, 1],
        [2, 3],
      ],
    }

    // Particle 0 is born at 0. At t = 0.5 the track reads 1.5; at t = 1.5 it
    // reads 2.5. Its spawn must be the same in both frames: the radius at birth.
    const a = createParticleBuffers(50)
    const b = createParticleBuffers(50)
    const countA = sampleParticles(component, component.particles!, 0.5, a)
    const countB = sampleParticles(component, component.particles!, 1.5, b)
    expect(countA).toBeGreaterThan(0)
    expect(countB).toBeGreaterThan(0)
    expect(a.positions[0]).toBeCloseTo(b.positions[0], 6)
    expect(a.positions[2]).toBeCloseTo(b.positions[2], 6)
    expect(Math.hypot(a.positions[0], a.positions[2])).toBeLessThanOrEqual(
      1.0001
    )
  })
})
