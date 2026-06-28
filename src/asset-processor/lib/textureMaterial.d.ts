/**
 * Type declarations for the shared texture-set → material helpers.
 * Implementation in `./textureMaterial.js` is plain ESM; this shim lets the
 * TypeScript frontend import it without `// @ts-expect-error`.
 */
import type * as THREE from 'three'

export interface TexturePresence {
  /** Truthy when a base-color/albedo map is present. */
  baseColorMap?: unknown
  /** Truthy when a metalness map is present. */
  metalnessMap?: unknown
  /** Truthy when a roughness map is present. */
  roughnessMap?: unknown
  /** Truthy when a specular-color map is present. */
  specularColorMap?: unknown
}

export interface TextureMaterialConfig {
  /** Whether a base-color map drives the albedo (caller uses white if so). */
  hasBaseColorMap: boolean
  /** 1 only when a metalness map is present, else 0 (dielectric). */
  metalness: number
  /** 1 when a roughness map is present, else a matte default. */
  roughness: number
  envMapIntensity: number
  /** 1 only when a specular-color map is present, else 0. */
  specularIntensity: number
}

export function resolveTextureMaterialConfig(
  maps?: TexturePresence
): TextureMaterialConfig

/**
 * Copy `uv` -> `uv2` when missing so an AO map samples the second UV set
 * instead of collapsing indirect lighting. Idempotent; mutates in place.
 */
export function ensureAoMapUv2(
  geometry: THREE.BufferGeometry | null | undefined
): void
