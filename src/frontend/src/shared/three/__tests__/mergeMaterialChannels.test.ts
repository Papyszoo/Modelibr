import * as THREE from 'three'

import { mergeMaterialChannels } from '../mergeMaterialChannels'

/**
 * Guards the phase 0 "apply a Modelibr material without dropping the model's
 * own detail" rule. Building a fresh MeshPhysicalMaterial from a texture set
 * used to discard every glTF map the set did not cover, and `COLOR_0`. These
 * tests break if the merge stops filling unset channels or stops deriving
 * `vertexColors` from the geometry's `color` attribute.
 */

function geometryWithColor(): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute(
    'position',
    new THREE.BufferAttribute(new Float32Array(9), 3)
  )
  geometry.setAttribute(
    'color',
    new THREE.BufferAttribute(new Float32Array(9), 3)
  )
  return geometry
}

function geometryWithoutColor(): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute(
    'position',
    new THREE.BufferAttribute(new Float32Array(9), 3)
  )
  return geometry
}

describe('mergeMaterialChannels', () => {
  it('keeps the original maps, normal scale and COLOR_0 a Modelibr material does not set', () => {
    const map = new THREE.Texture()
    const normalMap = new THREE.Texture()
    const roughnessMap = new THREE.Texture()
    const original = new THREE.MeshStandardMaterial({
      map,
      normalMap,
      normalScale: new THREE.Vector2(2, 3),
    })
    const next = new THREE.MeshPhysicalMaterial({ roughnessMap })

    const result = mergeMaterialChannels(original, next, geometryWithColor())

    expect(result).toBe(next)
    expect(result.map).toBe(map)
    expect(result.normalMap).toBe(normalMap)
    expect(result.normalScale.x).toBe(2)
    expect(result.normalScale.y).toBe(3)
    // The channel the Modelibr material did set still wins.
    expect(result.roughnessMap).toBe(roughnessMap)
    expect(result.vertexColors).toBe(true)
  })

  it("keeps the Modelibr material's own map over the original", () => {
    const originalMap = new THREE.Texture()
    const modelibrMap = new THREE.Texture()
    const original = new THREE.MeshStandardMaterial({ map: originalMap })
    const next = new THREE.MeshPhysicalMaterial({ map: modelibrMap })

    const result = mergeMaterialChannels(original, next, geometryWithoutColor())

    expect(result.map).toBe(modelibrMap)
  })

  it('turns vertex colours off when the geometry has no color attribute', () => {
    const original = new THREE.MeshStandardMaterial({})
    // Starts on so the assertion fails if the merge never runs.
    const next = new THREE.MeshPhysicalMaterial({ vertexColors: true })

    mergeMaterialChannels(original, next, geometryWithoutColor())

    expect(next.vertexColors).toBe(false)
  })
})
