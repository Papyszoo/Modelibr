import type { VfxDefinition } from '../types'
import {
  componentVisibleUntil,
  createParticleBuffers,
  sampleParticles,
  sampleTrack,
} from './vfxRuntime'

/**
 * How the worker's animated thumbnail is composed: which stretch of time it
 * covers and where the camera stands. Both derive from the definition alone, so
 * the same effect always yields the same thumbnail.
 */

/**
 * The seconds of effect time one thumbnail loop shows.
 *
 * A looping effect wraps at its duration - that is exactly what the editor and
 * the game do - so one cycle is the whole effect. A one-shot effect is shown
 * until nothing of it is visible any more: particles released near the end
 * outlive the timeline by their lifetime, and cutting there would drop the tail
 * the effect actually has.
 */
export function thumbnailWindowSeconds(definition: VfxDefinition): number {
  if (definition.loop) return definition.duration

  return definition.components.reduce(
    (end, component) => Math.max(end, componentVisibleUntil(component)),
    definition.duration
  )
}

export interface EffectBounds {
  center: [number, number, number]
  /** Radius of a sphere around `center` that holds the whole effect. */
  radius: number
}

/** Where an empty effect, or one that draws nothing, is framed. */
const FALLBACK_BOUNDS: EffectBounds = { center: [0, 0.8, 0], radius: 1.5 }
/** Tiny effects are not zoomed past this, so a spark does not fill the frame. */
const MIN_RADIUS = 0.75
/** Half-extent assumed for a mesh, whose true size is only known once loaded. */
const MESH_HALF_EXTENT = 0.75
const PARTICLE_SAMPLES = 48
/** At most this many particles per sample are kept; a thousand add nothing a hundred do not. */
const PARTICLES_PER_SAMPLE = 200
/** Particles fainter than this are not part of what the eye sees. */
const VISIBLE_ALPHA = 0.15
/**
 * Stray particles (the few thrown furthest, or still falling long after the
 * burst) are left out of the framing, so the effect fills the picture instead of
 * being shrunk to fit its single farthest speck.
 */
const OUTLIER_FRACTION = 0.03

/**
 * A bounding sphere for what the effect visibly draws over `windowSeconds`.
 *
 * Particles are measured by sampling the real runtime across the window and
 * trimming the outliers; lights count as points and meshes as a box of assumed
 * size scaled by their scale track (their geometry is not known until the model
 * has loaded, and the thumbnail must be framed before the first picture is taken).
 */
export function computeEffectBounds(
  definition: VfxDefinition,
  windowSeconds: number
): EffectBounds {
  const min = [Infinity, Infinity, Infinity]
  const max = [-Infinity, -Infinity, -Infinity]
  const grow = (x: number, y: number, z: number, margin: number) => {
    min[0] = Math.min(min[0], x - margin)
    min[1] = Math.min(min[1], y - margin)
    min[2] = Math.min(min[2], z - margin)
    max[0] = Math.max(max[0], x + margin)
    max[1] = Math.max(max[1], y + margin)
    max[2] = Math.max(max[2], z + margin)
  }

  const buffers = createParticleBuffers()

  for (const component of definition.components) {
    const [px, py, pz] = component.position ?? [0, 0, 0]

    if (component.type === 'particles' && component.particles) {
      grow(px, py, pz, 0.05)
      const axes: number[][] = [[], [], []]
      let sizeSum = 0

      for (let i = 0; i <= PARTICLE_SAMPLES; i++) {
        const time = (windowSeconds * i) / PARTICLE_SAMPLES
        const count = sampleParticles(
          component,
          component.particles,
          time,
          buffers
        )
        const stride = Math.max(1, Math.ceil(count / PARTICLES_PER_SAMPLE))
        for (let p = 0; p < count; p += stride) {
          if (buffers.alphas[p] < VISIBLE_ALPHA) continue
          axes[0].push(buffers.positions[p * 3])
          axes[1].push(buffers.positions[p * 3 + 1])
          axes[2].push(buffers.positions[p * 3 + 2])
          sizeSum += Math.max(buffers.sizes[p], 0)
        }
      }

      const kept = axes[0].length
      if (kept > 0) {
        const margin = sizeSum / kept / 2
        const [x0, x1] = trimmedRange(axes[0])
        const [y0, y1] = trimmedRange(axes[1])
        const [z0, z1] = trimmedRange(axes[2])
        grow(x0, y0, z0, margin)
        grow(x1, y1, z1, margin)
      }
    } else if (component.type === 'mesh') {
      const scale = Math.max(
        ...(component.tracks?.scale?.map(([, value]) => value) ?? [1]),
        sampleTrack(component.tracks?.scale, 0, 1)
      )
      grow(px, py, pz, MESH_HALF_EXTENT * Math.max(scale, 0.1))
    } else if (component.type === 'light') {
      grow(px, py, pz, 0.2)
    }
  }

  if (!Number.isFinite(min[0])) return FALLBACK_BOUNDS

  const center: [number, number, number] = [
    (min[0] + max[0]) / 2,
    (min[1] + max[1]) / 2,
    (min[2] + max[2]) / 2,
  ]
  const half = Math.hypot(
    (max[0] - min[0]) / 2,
    (max[1] - min[1]) / 2,
    (max[2] - min[2]) / 2
  )
  return { center, radius: Math.max(half, MIN_RADIUS) }
}

/** The range holding all but the outermost `OUTLIER_FRACTION` of values at each end. */
function trimmedRange(values: number[]): [number, number] {
  const sorted = Float64Array.from(values).sort()
  const cut = Math.floor(sorted.length * OUTLIER_FRACTION)
  return [sorted[cut], sorted[sorted.length - 1 - cut]]
}

export interface ThumbnailCamera {
  position: [number, number, number]
  target: [number, number, number]
  fov: number
}

const CAMERA_FOV = 40
const CAMERA_AZIMUTH = (35 * Math.PI) / 180
const CAMERA_ELEVATION = (20 * Math.PI) / 180
/** Breathing room around the bounding sphere. */
const FRAMING_MARGIN = 1.12

/** A fixed three-quarter view that fits the whole bounding sphere in frame. */
export function frameThumbnailCamera(bounds: EffectBounds): ThumbnailCamera {
  const distance =
    (bounds.radius / Math.sin((CAMERA_FOV * Math.PI) / 360)) * FRAMING_MARGIN
  const [cx, cy, cz] = bounds.center

  return {
    position: [
      cx + distance * Math.sin(CAMERA_AZIMUTH) * Math.cos(CAMERA_ELEVATION),
      cy + distance * Math.sin(CAMERA_ELEVATION),
      cz + distance * Math.cos(CAMERA_AZIMUTH) * Math.cos(CAMERA_ELEVATION),
    ],
    target: bounds.center,
    fov: CAMERA_FOV,
  }
}

/** Pixels per world unit at distance 1 for a viewport `heightPx` tall. */
export function pointScaleFor(heightPx: number, fov: number): number {
  return heightPx / (2 * Math.tan((fov * Math.PI) / 360))
}
