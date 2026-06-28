import {
  ensureAoMapUv2,
  resolveTextureMaterialConfig,
} from '../../../../../asset-processor/lib/textureMaterial.js'

/** Minimal geometry stub exposing the get/setAttribute surface the helper uses. */
function fakeGeometry(initial: Record<string, { clone: () => unknown }> = {}) {
  const attrs: Record<string, unknown> = { ...initial }
  return {
    attrs,
    setCalls: [] as string[],
    getAttribute(name: string) {
      return attrs[name] ?? undefined
    },
    setAttribute(name: string, value: unknown) {
      attrs[name] = value
      this.setCalls.push(name)
    },
  }
}

/**
 * Locks the texture-set → material gating rule shared by the worker thumbnail
 * and the frontend viewer.
 *
 * The regression this guards against: the viewer once gated metalness on the
 * base-color map, so a textured surface with no metalness map became fully
 * metallic — a black mirror lit only by the environment, while the worker
 * thumbnail rendered it correctly as a dielectric. The first test below is the
 * direct guard.
 */
describe('resolveTextureMaterialConfig', () => {
  it('a base-color map alone does NOT make the material metallic (the drift bug)', () => {
    const cfg = resolveTextureMaterialConfig({ baseColorMap: {} })

    expect(cfg.hasBaseColorMap).toBe(true)
    // Dielectric — responds to ambient/direct/IBL like the thumbnail does.
    expect(cfg.metalness).toBe(0)
    expect(cfg.roughness).toBe(0.8)
  })

  it('is fully dielectric and matte with no maps present', () => {
    const cfg = resolveTextureMaterialConfig()

    expect(cfg.hasBaseColorMap).toBe(false)
    expect(cfg.metalness).toBe(0)
    expect(cfg.roughness).toBe(0.8)
    expect(cfg.specularIntensity).toBe(0)
    expect(cfg.envMapIntensity).toBe(1.0)
  })

  it('becomes metallic only when a metalness map is present', () => {
    expect(resolveTextureMaterialConfig({ metalnessMap: {} }).metalness).toBe(1)
    expect(
      resolveTextureMaterialConfig({ baseColorMap: {}, metalnessMap: {} })
        .metalness
    ).toBe(1)
  })

  it('lets a roughness map drive roughness (1), else stays matte (0.8)', () => {
    expect(resolveTextureMaterialConfig({ roughnessMap: {} }).roughness).toBe(1)
    expect(resolveTextureMaterialConfig({ baseColorMap: {} }).roughness).toBe(
      0.8
    )
  })

  it('enables the specular channel only with a specular-color map', () => {
    expect(resolveTextureMaterialConfig().specularIntensity).toBe(0)
    expect(
      resolveTextureMaterialConfig({ specularColorMap: {} }).specularIntensity
    ).toBe(1)
  })

  it('treats null/undefined map slots as absent', () => {
    const cfg = resolveTextureMaterialConfig({
      baseColorMap: null,
      metalnessMap: undefined,
      roughnessMap: null,
    })

    expect(cfg.hasBaseColorMap).toBe(false)
    expect(cfg.metalness).toBe(0)
    expect(cfg.roughness).toBe(0.8)
  })
})

/**
 * Locks the AO → uv2 setup. Without it an AO map collapses all indirect light
 * (ambient + environment IBL) in the viewer, so those controls looked inert
 * while directional still worked.
 */
describe('ensureAoMapUv2', () => {
  it('copies uv -> uv2 when a geometry only has uv (so AO samples correctly)', () => {
    const cloned = { cloned: true }
    const geometry = fakeGeometry({ uv: { clone: () => cloned } })

    ensureAoMapUv2(geometry as never)

    expect(geometry.attrs.uv2).toBe(cloned)
  })

  it('is idempotent — does not overwrite an existing uv2', () => {
    const geometry = fakeGeometry({
      uv: { clone: () => ({}) },
      uv2: { clone: () => ({}) },
    })

    ensureAoMapUv2(geometry as never)

    expect(geometry.setCalls).toHaveLength(0)
  })

  it('is a no-op when there is no uv to copy', () => {
    const geometry = fakeGeometry()

    ensureAoMapUv2(geometry as never)

    expect(geometry.attrs.uv2).toBeUndefined()
    expect(geometry.setCalls).toHaveLength(0)
  })

  it('safely ignores a null geometry', () => {
    expect(() => ensureAoMapUv2(null as never)).not.toThrow()
  })
})
