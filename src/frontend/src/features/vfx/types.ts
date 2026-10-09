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

export type VfxTrackName =
  | 'scale'
  | 'opacity'
  | 'rotationY'
  | 'intensity'
  | 'radius'

/** Where a particles emitter spawns, on the component's local XZ plane. */
export type VfxEmitterShape = 'point' | 'disc' | 'ring'

export interface VfxEmitter {
  shape: VfxEmitterShape
  /** Disc only: spawns uniformly by area inside this radius. */
  radius?: number
  /** Ring only: the inner edge of the band. */
  innerRadius?: number
  /** Ring only: the outer edge of the band. */
  outerRadius?: number
}

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

/** A flat ground primitive kind; when set, the radius fields replace a model. */
export type VfxMeshKind = 'disc' | 'ring'

/** The grey a primitive mesh keeps until a colour is authored, so old effects render unchanged. */
export const DEFAULT_PRIMITIVE_COLOR = '#8a93a6'

export interface VfxMesh {
  kind?: VfxMeshKind
  modelId?: number
  versionId?: number | null
  /** Disc only: its radius, 0 < r <= 20. */
  radius?: number
  /** Ring only: the inner radius, 0 <= Ri < Ro. */
  innerRadius?: number
  /** Ring only: the outer radius. */
  outerRadius?: number
  /** Primitive only: albedo colour; absent keeps the default grey. */
  color?: string
  /** Primitive only: emission strength, 0-10; emission colour is `color`. */
  emissiveIntensity?: number
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
  /** Where a particles component spawns, on its local XZ plane; absent means a point. */
  emitter?: VfxEmitter
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

/** Which tracks each component type may carry, before the conditional radius. */
export const VFX_TRACKS: Record<VfxComponentType, VfxTrackName[]> = {
  particles: [],
  mesh: ['scale', 'opacity', 'rotationY'],
  light: ['intensity'],
  sound: [],
}

/** True for a flat ground primitive, which references no library model. */
export function isPrimitiveMesh(mesh: VfxMesh | undefined): boolean {
  return mesh?.kind === 'disc' || mesh?.kind === 'ring'
}

/** True when a particles emitter spreads over the ground. */
export function isRadiusEmitter(emitter: VfxEmitter | undefined): boolean {
  const shape = emitter?.shape
  return shape === 'disc' || shape === 'ring'
}

/** The outward radius of a primitive: a disc's radius or a ring's outer radius. */
export function meshOuterRadius(mesh: VfxMesh): number {
  return mesh.kind === 'ring' ? (mesh.outerRadius ?? 0) : (mesh.radius ?? 0)
}

/**
 * The tracks a component may carry. A radius track is allowed only where there
 * is a radius to animate: a disc/ring emitter or a flat primitive mesh.
 */
export function vfxTracksFor(component: VfxComponent): VfxTrackName[] {
  const base = VFX_TRACKS[component.type]
  const hasRadius =
    isRadiusEmitter(component.emitter) || isPrimitiveMesh(component.mesh)
  return hasRadius ? [...base, 'radius'] : base
}
