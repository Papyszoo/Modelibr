/**
 * A visual effect: timed components played on one timeline.
 *
 * Mirrors the server's v1 definition contract exactly - the server validates
 * every field and rejects the whole document with a list of problems, so the
 * editor never needs a second, looser shape of its own.
 */

export type VfxComponentType = 'particles' | 'mesh' | 'light' | 'sound'

/** `[time, value]`, time in seconds relative to the component's start. */
export type VfxKeyframe = [number, number]

export type VfxTrackName = 'scale' | 'opacity' | 'rotationY' | 'intensity'

export interface VfxParticles {
  mode: 'continuous' | 'burst'
  /** Particles per second, used when continuous. */
  rate: number
  /** Particles released at the component's start, used when burst. */
  count: number
  lifetime: number
  speed: number
  /** Cone half-angle around +Y, in degrees. */
  spread: number
  gravity: number
  sizeStart: number
  sizeEnd: number
  colorStart: string
  colorEnd: string
  opacityStart: number
  opacityEnd: number
  blending: 'additive' | 'normal'
  spriteId?: number | null
  seed: number
}

export interface VfxMesh {
  modelId: number
  versionId?: number | null
}

export interface VfxLight {
  color: string
  range: number
}

export interface VfxSound {
  soundId: number
  volume: number
}

export interface VfxComponent {
  id: string
  type: VfxComponentType
  name: string
  start: number
  duration: number
  position?: [number, number, number]
  particles?: VfxParticles
  mesh?: VfxMesh
  light?: VfxLight
  sound?: VfxSound
  tracks?: Partial<Record<VfxTrackName, VfxKeyframe[]>>
}

export interface VfxDefinition {
  version: 1
  duration: number
  loop: boolean
  components: VfxComponent[]
}

export interface VfxSummary {
  id: number
  name: string
  description?: string | null
  duration: number
  componentCount: number
  componentTypes: VfxComponentType[]
  updatedAt: string
  /** API-relative animated WebP loop of the whole effect; absent until the worker has rendered it. */
  thumbnailUrl?: string | null
}

export interface VfxDetail {
  id: number
  name: string
  description?: string | null
  definition: VfxDefinition
  createdAt: string
  updatedAt: string
  thumbnailUrl?: string | null
}

/** One validation problem, as the server reports it: where, and what. */
export interface VfxProblem {
  path: string
  message: string
}

/** Which tracks each component type may carry. */
export const VFX_TRACKS: Record<VfxComponentType, VfxTrackName[]> = {
  particles: [],
  mesh: ['scale', 'opacity', 'rotationY'],
  light: ['intensity'],
  sound: [],
}
