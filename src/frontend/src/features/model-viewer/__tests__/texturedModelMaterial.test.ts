import * as THREE from 'three'

import type { TextureSetDto } from '@/types'

import {
  applyMaterialTextures,
  buildMaterialFromTextures,
} from '../components/materialTextures'

/**
 * Integration tests for the viewer's REAL texture → material apply path
 * (`applyMaterialTextures` → `buildMaterialFromTextures` → the shared
 * resolveTextureMaterialConfig / ensureAoMapUv2). Uses real THREE objects — the
 * material/geometry construction is GPU-free, so this runs in jsdom without a
 * WebGL context.
 *
 * These guard the two viewer↔worker drifts that made model 6 dark:
 *   1. metalness gated on the base-color map → textured non-metal = black mirror
 *   2. AO map applied without a uv2 set → AO killed all indirect light
 * They assert the actual material/geometry the viewer produces, so they catch a
 * regression even if someone re-inlines a buggy copy and bypasses the helpers.
 */

const SEP = '::'

function texturedMesh(materialName = 'Mat') {
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute(
    'position',
    new THREE.BufferAttribute(new Float32Array(9), 3)
  )
  geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(6), 2))
  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({ name: materialName })
  )
  const group = new THREE.Group()
  group.add(mesh)
  return { group, mesh }
}

/** Build the namespaced loaded-textures record the apply path expects. */
function loadedTextures(matName: string, slots: string[]) {
  const out: Record<string, THREE.Texture> = {}
  for (const slot of slots) out[`${matName}${SEP}${slot}`] = new THREE.Texture()
  return out
}

/** Only the keys are read from the texture-set map; contents are stubbed. */
const matSet = (name: string): Record<string, TextureSetDto> => ({
  [name]: {} as unknown as TextureSetDto,
})

describe('viewer texture → material apply path', () => {
  it('base-color + AO (no metalness map) → lit dielectric with uv2, NOT a black mirror', () => {
    const { group, mesh } = texturedMesh('Mat')

    applyMaterialTextures(
      group,
      matSet('Mat'),
      loadedTextures('Mat', ['map', 'aoMap']),
      true
    )

    const mat = mesh.material as THREE.MeshPhysicalMaterial
    // Dielectric → responds to ambient / direct / IBL (the metalness-drift fix).
    expect(mat.metalness).toBe(0)
    expect(mat.aoMap).not.toBeNull()
    // Second UV set present so AO doesn't collapse indirect light (the uv2 fix).
    expect(mesh.geometry.getAttribute('uv2')).toBeDefined()
  })

  it('a metalness map is what makes it metallic', () => {
    const { group, mesh } = texturedMesh('Mat')

    applyMaterialTextures(
      group,
      matSet('Mat'),
      loadedTextures('Mat', ['map', 'metalnessMap']),
      true
    )

    expect((mesh.material as THREE.MeshPhysicalMaterial).metalness).toBe(1)
  })

  it('does not add a uv2 set when there is no AO map (no needless attribute)', () => {
    const { group, mesh } = texturedMesh('Mat')

    applyMaterialTextures(
      group,
      matSet('Mat'),
      loadedTextures('Mat', ['map']),
      true
    )

    expect(mesh.geometry.getAttribute('uv2')).toBeUndefined()
  })

  it('buildMaterialFromTextures: specular channel gated on the specular map', () => {
    const base = buildMaterialFromTextures(
      loadedTextures('Mat', ['map']),
      'Mat'
    )
    expect(base.specularIntensity).toBe(0)
    expect(base.roughness).toBe(0.8)

    const withSpec = buildMaterialFromTextures(
      loadedTextures('Mat', ['map', 'specularColorMap']),
      'Mat'
    )
    expect(withSpec.specularIntensity).toBe(1)
  })
})
