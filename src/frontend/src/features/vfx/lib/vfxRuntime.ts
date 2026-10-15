import type {
  VfxComponent,
  VfxEmitter,
  VfxKeyframe,
  VfxParticles,
} from '../types'

/**
 * Everything the preview draws is a pure function of time.
 *
 * No particle is simulated step by step: each one is born at a known moment
 * from a known seed, so its position at any time can be computed directly.
 * That is what makes scrubbing exact - dragging the playhead back to 0.42 s
 * shows the very frame playback showed at 0.42 s, and the Godot export can
 * reproduce the same emission from the same numbers.
 */

/** Hard ceiling on live particles per emitter, so one typo cannot hang the tab. */
export const MAX_PARTICLES = 5000

/** Linear interpolation over `[time, value]` keyframes, clamped at both ends. */
export function sampleTrack(
  keys: VfxKeyframe[] | undefined,
  time: number,
  fallback: number
): number {
  if (!keys || keys.length === 0) return fallback
  if (time <= keys[0][0]) return keys[0][1]
  const last = keys[keys.length - 1]
  if (time >= last[0]) return last[1]
  for (let i = 1; i < keys.length; i++) {
    const [t1, v1] = keys[i]
    if (time <= t1) {
      const [t0, v0] = keys[i - 1]
      const span = t1 - t0
      return span <= 0 ? v1 : v0 + ((time - t0) / span) * (v1 - v0)
    }
  }
  return last[1]
}

/** True while the component plays: from its start for its duration. */
export function isComponentActive(
  component: VfxComponent,
  time: number
): boolean {
  return time >= component.start && time < component.start + component.duration
}

/**
 * Deterministic 0..1 random number for particle `index` of an emitter.
 * `salt` picks an independent stream (direction, angle, speed jitter).
 */
export function particleRandom(
  seed: number,
  index: number,
  salt: number
): number {
  let h = Math.imul(seed | 0, 0x9e3779b1) ^ Math.imul(index, 0x85ebca6b)
  h ^= Math.imul(salt + 1, 0xc2b2ae35)
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d)
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b)
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}

/**
 * The effective inner and outer radii of a disc/ring emitter at component-local
 * `local` seconds. A radius track overrides the authored radius; on a ring the
 * inner radius scales by the same factor, so the band keeps its ratio.
 */
export function emitterRadii(
  emitter: VfxEmitter | undefined,
  radiusKeys: VfxKeyframe[] | undefined,
  local: number
): { inner: number; outer: number } {
  if (emitter?.shape === 'disc') {
    const radius = Math.max(
      0,
      sampleTrack(radiusKeys, local, emitter.radius ?? 0)
    )
    return { inner: 0, outer: radius }
  }
  if (emitter?.shape === 'ring') {
    const baseInner = emitter.innerRadius ?? 0
    const baseOuter = emitter.outerRadius ?? 0
    const outer = Math.max(0, sampleTrack(radiusKeys, local, baseOuter))
    const ratio = baseOuter > 0 ? baseInner / baseOuter : 0
    return { inner: outer * ratio, outer }
  }
  return { inner: 0, outer: 0 }
}

/** The largest value in a keyframe track, 0 when it is absent or empty. */
export function maxKeyframeValue(keys: VfxKeyframe[] | undefined): number {
  return (keys ?? []).reduce(
    (largest, [, value]) => Math.max(largest, value),
    0
  )
}

/** The largest outer radius a disc/ring emitter can reach, for framing. */
export function emitterMaxRadius(
  emitter: VfxEmitter | undefined,
  radiusKeys: VfxKeyframe[] | undefined
): number {
  const base =
    emitter?.shape === 'ring'
      ? (emitter.outerRadius ?? 0)
      : emitter?.shape === 'disc'
        ? (emitter.radius ?? 0)
        : 0
  return Math.max(base, maxKeyframeValue(radiusKeys))
}

/**
 * A particle's spawn offset on its emitter shape, on the component's local XZ
 * plane. A point emitter (or none) spawns at the origin; a disc and a ring place
 * the particle uniformly by area, drawing from the emitter's seeded random
 * stream so a render is reproducible.
 */
export function sampleEmitterOrigin(
  emitter: VfxEmitter | undefined,
  seed: number,
  index: number,
  innerRadius: number,
  outerRadius: number
): [number, number] {
  const shape = emitter?.shape ?? 'point'
  if (shape === 'point' || outerRadius <= 0) return [0, 0]

  const u = particleRandom(seed, index, 3)
  const angle = particleRandom(seed, index, 4) * Math.PI * 2
  const r =
    shape === 'ring'
      ? Math.sqrt(
          innerRadius * innerRadius +
            u * (outerRadius * outerRadius - innerRadius * innerRadius)
        )
      : outerRadius * Math.sqrt(u)

  return [r * Math.cos(angle), r * Math.sin(angle)]
}

export function hexToRgb(hex: string): [number, number, number] {
  const value = parseInt(hex.replace('#', ''), 16)
  return [
    ((value >> 16) & 255) / 255,
    ((value >> 8) & 255) / 255,
    (value & 255) / 255,
  ]
}

export interface ParticleBuffers {
  /** xyz per particle. */
  positions: Float32Array
  /** rgb per particle. */
  colors: Float32Array
  sizes: Float32Array
  alphas: Float32Array
}

export function createParticleBuffers(
  capacity = MAX_PARTICLES
): ParticleBuffers {
  return {
    positions: new Float32Array(capacity * 3),
    colors: new Float32Array(capacity * 3),
    sizes: new Float32Array(capacity),
    alphas: new Float32Array(capacity),
  }
}

/**
 * Writes the particles alive at `time` (effect time, seconds) into `out` and
 * returns how many were written.
 *
 * A continuous emitter releases one particle every 1/rate seconds while the
 * component plays; a burst releases `count` at the component's start. Emission
 * stops at the end of the component, but particles already released live out
 * their lifetime - the same rule Godot applies when `emitting` turns off.
 *
 * Each particle leaves the emitter inside a cone of `spread` degrees around +Y,
 * at 75-125% of `speed`, and falls under `gravity` along Y. The emitter is a
 * point unless it is a disc or ring, which spreads the spawn point over the
 * local XZ plane. The direction is the cone from that spawn point either way.
 */
export function sampleParticles(
  component: VfxComponent,
  particles: VfxParticles,
  time: number,
  out: ParticleBuffers
): number {
  const local = time - component.start
  if (local < 0 || particles.lifetime <= 0) return 0

  const [ox, oy, oz] = component.position ?? [0, 0, 0]
  const [r0, g0, b0] = hexToRgb(particles.colorStart)
  const [r1, g1, b1] = hexToRgb(particles.colorEnd)
  const cosSpread = Math.cos(
    (Math.min(180, Math.max(0, particles.spread)) * Math.PI) / 180
  )
  const capacity = out.sizes.length

  let first: number
  let last: number
  let birthOf: (index: number) => number

  if (particles.mode === 'burst') {
    if (local >= particles.lifetime) return 0
    first = 0
    last = Math.min(particles.count, capacity) - 1
    birthOf = () => 0
  } else {
    if (particles.rate <= 0) return 0
    const interval = 1 / particles.rate
    first = Math.max(0, Math.ceil((local - particles.lifetime) / interval))
    // Born at index * interval: no later than now, and strictly before the
    // component ends - a particle due exactly at `duration` is not emitted.
    last = Math.min(
      Math.floor(local / interval),
      Math.ceil(component.duration / interval) - 1
    )
    birthOf = index => index * interval
  }

  let written = 0
  for (let index = first; index <= last && written < capacity; index++) {
    const birth = birthOf(index)
    const age = local - birth
    if (age < 0 || age >= particles.lifetime) continue

    // The spawn radius is the one in force when this particle was born: a
    // radius track grows the emitter without dragging particles already in
    // flight along with it.
    const { inner: emitterInner, outer: emitterOuter } = emitterRadii(
      component.emitter,
      component.tracks?.radius,
      birth
    )

    const u1 = particleRandom(particles.seed, index, 0)
    const u2 = particleRandom(particles.seed, index, 1)
    const u3 = particleRandom(particles.seed, index, 2)

    // Uniform over the spherical cap of half-angle `spread`.
    const cosTheta = 1 - u1 * (1 - cosSpread)
    const sinTheta = Math.sqrt(Math.max(0, 1 - cosTheta * cosTheta))
    const phi = u2 * Math.PI * 2
    const speed = particles.speed * (0.75 + 0.5 * u3)

    const f = age / particles.lifetime
    const p = written * 3
    const [ex, ez] = sampleEmitterOrigin(
      component.emitter,
      particles.seed,
      index,
      emitterInner,
      emitterOuter
    )
    out.positions[p] = ox + ex + sinTheta * Math.cos(phi) * speed * age
    out.positions[p + 1] =
      oy + cosTheta * speed * age + 0.5 * particles.gravity * age * age
    out.positions[p + 2] = oz + ez + sinTheta * Math.sin(phi) * speed * age
    out.colors[p] = r0 + (r1 - r0) * f
    out.colors[p + 1] = g0 + (g1 - g0) * f
    out.colors[p + 2] = b0 + (b1 - b0) * f
    out.sizes[written] =
      particles.sizeStart + (particles.sizeEnd - particles.sizeStart) * f
    out.alphas[written] =
      particles.opacityStart +
      (particles.opacityEnd - particles.opacityStart) * f
    written++
  }
  return written
}

/** The time after which nothing of the component is visible any more. */
export function componentVisibleUntil(component: VfxComponent): number {
  const end = component.start + component.duration
  return component.type === 'particles' && component.particles
    ? end + component.particles.lifetime
    : end
}
