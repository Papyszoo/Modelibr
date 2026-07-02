/**
 * Type declarations for the shared scene-lighting rig. Implementation in
 * `./sceneLighting.js` is plain ESM; this shim lets TS-aware callers (the
 * frontend viewer) import it without `// @ts-expect-error`.
 */
import type * as THREE from 'three'

export interface AmbientLightDescriptor {
  color: number
  intensity: number
}

export interface DirectionalLightDescriptor {
  color: number
  intensity: number
  position: [number, number, number]
  castShadow?: boolean
  shadowMapSize?: number
}

export interface PointLightDescriptor {
  color: number
  intensity: number
  position: [number, number, number]
}

export interface SpotLightDescriptor {
  color: number
  intensity: number
  position: [number, number, number]
  angle: number
  penumbra: number
  castShadow?: boolean
}

export interface SceneLightingDescriptor {
  ambient: AmbientLightDescriptor
  directional: DirectionalLightDescriptor
  point: PointLightDescriptor
  spot: SpotLightDescriptor
  /** Applied to `scene.environmentIntensity` (the IBL contribution). */
  environmentIntensity: number
}

export interface SceneLightingSettings {
  /** Absolute ambient light intensity. */
  ambientIntensity?: number
  /** Multiplier on the directional/point/spot triplet. */
  directionalIntensity?: number
  /** Absolute scene.environmentIntensity. */
  environmentIntensity?: number
}

export interface SceneLightRig {
  ambient: THREE.AmbientLight
  directional: THREE.DirectionalLight
  point: THREE.PointLight
  spot: THREE.SpotLight
  lights: THREE.Light[]
}

export const DEFAULT_LIGHTING: SceneLightingDescriptor

export const ENVIRONMENT_PREVIEW_LIGHTING: {
  ambient: number
  directional: number
  point: number
  spot: number
}

export function resolveSceneLighting(
  settings?: SceneLightingSettings,
  base?: SceneLightingDescriptor
): SceneLightingDescriptor

export function buildSceneLights(
  three: Pick<
    typeof THREE,
    'AmbientLight' | 'DirectionalLight' | 'PointLight' | 'SpotLight'
  >,
  descriptor?: SceneLightingDescriptor
): SceneLightRig
