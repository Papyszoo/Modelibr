import * as THREE from 'three'

import {
  buildSceneLights,
  DEFAULT_LIGHTING,
  resolveSceneLighting,
} from '../../../../../asset-processor/lib/sceneLighting.js'

/**
 * Tests for the shared cross-runtime light rig (asset-processor/lib).
 *
 * The bug these guard against: the viewer used to stack drei <Stage>'s lights
 * on top of a manual rig, so the ambient/directional/environment controls were
 * swamped and "did nothing". The fix routes every control through this single
 * rig. So the meaningful contract is: turning a control up must put more light
 * into the scene (a lighter surface), and the values must reach the actual
 * THREE light objects the renderer shades with.
 *
 * We assert on intensities rather than rendered pixels because THREE's lighting
 * is monotonic in these values: every term is a non-negative additive light
 * contribution, so a strictly larger total is a strictly brighter (lighter)
 * result for any material — without needing a GPU/WebGL in jsdom.
 */

/**
 * Sum of every additive light contribution in a resolved rig. A faithful,
 * deliberately simple proxy for "how bright is the scene": THREE adds ambient,
 * each direct light's contribution, and the IBL (environmentIntensity) together,
 * so more total here == a lighter pixel.
 */
function totalSceneLight(descriptor: ReturnType<typeof resolveSceneLighting>) {
  return (
    descriptor.ambient.intensity +
    descriptor.directional.intensity +
    descriptor.point.intensity +
    descriptor.spot.intensity +
    descriptor.environmentIntensity
  )
}

describe('resolveSceneLighting', () => {
  it('returns the canonical rig when no settings are given (viewer default == thumbnail)', () => {
    const rig = resolveSceneLighting()

    expect(rig.ambient.intensity).toBe(DEFAULT_LIGHTING.ambient.intensity)
    expect(rig.directional.intensity).toBe(
      DEFAULT_LIGHTING.directional.intensity
    )
    expect(rig.point.intensity).toBe(DEFAULT_LIGHTING.point.intensity)
    expect(rig.spot.intensity).toBe(DEFAULT_LIGHTING.spot.intensity)
    expect(rig.environmentIntensity).toBe(DEFAULT_LIGHTING.environmentIntensity)
  })

  it('treats ambientIntensity as an absolute value and makes the scene lighter when raised', () => {
    const dim = resolveSceneLighting({ ambientIntensity: 0.2 })
    const bright = resolveSceneLighting({ ambientIntensity: 0.8 })

    expect(bright.ambient.intensity).toBeGreaterThan(dim.ambient.intensity)
    expect(bright.ambient.intensity).toBe(0.8)
    // The whole scene gets lighter, and only the ambient term changed.
    expect(totalSceneLight(bright)).toBeGreaterThan(totalSceneLight(dim))
  })

  it('treats environmentIntensity as an absolute value and makes the scene lighter when raised', () => {
    const dim = resolveSceneLighting({ environmentIntensity: 0.1 })
    const bright = resolveSceneLighting({ environmentIntensity: 1.5 })

    expect(bright.environmentIntensity).toBeGreaterThan(
      dim.environmentIntensity
    )
    expect(bright.environmentIntensity).toBe(1.5)
    expect(totalSceneLight(bright)).toBeGreaterThan(totalSceneLight(dim))
  })

  it('treats directionalIntensity as a multiplier scaling the whole directional triplet', () => {
    const base = resolveSceneLighting({ directionalIntensity: 1 })
    const doubled = resolveSceneLighting({ directionalIntensity: 2 })

    expect(doubled.directional.intensity).toBeCloseTo(
      base.directional.intensity * 2
    )
    expect(doubled.point.intensity).toBeCloseTo(base.point.intensity * 2)
    expect(doubled.spot.intensity).toBeCloseTo(base.spot.intensity * 2)
    // Ambient and environment are independent of the directional control.
    expect(doubled.ambient.intensity).toBe(base.ambient.intensity)
    expect(doubled.environmentIntensity).toBe(base.environmentIntensity)
    expect(totalSceneLight(doubled)).toBeGreaterThan(totalSceneLight(base))
  })

  it('turning every control to zero produces a fully dark rig (no hidden baked-in light)', () => {
    const dark = resolveSceneLighting({
      ambientIntensity: 0,
      directionalIntensity: 0,
      environmentIntensity: 0,
    })

    expect(totalSceneLight(dark)).toBe(0)
  })
})

describe('buildSceneLights', () => {
  it('builds exactly the four canonical lights — no extras (guards against re-stacking a second rig)', () => {
    const rig = buildSceneLights(THREE, DEFAULT_LIGHTING)

    expect(rig.lights).toHaveLength(4)
    expect(rig.ambient).toBeInstanceOf(THREE.AmbientLight)
    expect(rig.directional).toBeInstanceOf(THREE.DirectionalLight)
    expect(rig.point).toBeInstanceOf(THREE.PointLight)
    expect(rig.spot).toBeInstanceOf(THREE.SpotLight)
  })

  it('passes the resolved intensities through to the real THREE light objects the renderer shades with', () => {
    const resolved = resolveSceneLighting({
      ambientIntensity: 0.9,
      directionalIntensity: 2,
    })
    const rig = buildSceneLights(THREE, resolved)

    // What the user dialed in is exactly what reaches the renderer.
    expect(rig.ambient.intensity).toBe(0.9)
    expect(rig.directional.intensity).toBeCloseTo(
      DEFAULT_LIGHTING.directional.intensity * 2
    )
  })

  it('configures positions, shadows and spot cone from the descriptor', () => {
    const rig = buildSceneLights(THREE, DEFAULT_LIGHTING)

    expect(rig.directional.position.toArray()).toEqual(
      DEFAULT_LIGHTING.directional.position
    )
    expect(rig.directional.castShadow).toBe(true)
    expect(rig.directional.shadow.mapSize.width).toBe(
      DEFAULT_LIGHTING.directional.shadowMapSize
    )
    expect(rig.spot.angle).toBe(DEFAULT_LIGHTING.spot.angle)
    expect(rig.spot.penumbra).toBe(DEFAULT_LIGHTING.spot.penumbra)
    expect(rig.spot.castShadow).toBe(true)
    expect(rig.point.position.toArray()).toEqual(
      DEFAULT_LIGHTING.point.position
    )
  })
})
