import type { VfxComponent, VfxParticles } from '../../types'
import {
  createParticleBuffers,
  particleRandom,
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

const emitter = (p: VfxParticles, start = 0, duration = 1): VfxComponent => ({
  id: 'sparks',
  type: 'particles',
  name: 'Sparks',
  start,
  duration,
  particles: p,
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
    const component = emitter(particles({ rate: 10, lifetime: 1 }), 0, 0.5)
    const out = createParticleBuffers(100)
    // Births at 0..0.4 (five); at t = 1.2 only those born after 0.2 are alive.
    expect(sampleParticles(component, component.particles!, 1.2, out)).toBe(2)
    expect(sampleParticles(component, component.particles!, 1.5, out)).toBe(0)
  })

  it('releases a burst at the component start and nothing before it', () => {
    const component = emitter(particles({ mode: 'burst', count: 12 }), 0.5)
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
