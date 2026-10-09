import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import {
  FRAMING_COVERAGE,
  RENDER_FOV_DEGREES,
  computeFramingDistance,
  sampleAnimatedBounds,
} from '../lib/modelFraming.js'

/**
 * Framing is what stops an animated thumbnail from rendering the model as a
 * small dot: the camera distance has to fit the union of the clip's bounds to
 * 70-80% of the camera's vertical field of view, and the union itself has to be
 * measured with live world matrices or a post-normalization scale is counted
 * twice and the camera is pushed twice as far away.
 */
describe('computeFramingDistance', () => {
  const fovHalfTangent = Math.tan((RENDER_FOV_DEGREES * Math.PI) / 360)

  /** Screen fraction the box height occupies at `distance`. */
  function coveredFraction(height, distance) {
    return height / (2 * distance * fovHalfTangent)
  }

  // The contract the animated path relies on: a unit box ends up spanning
  // 70-80% of the vertical FOV.
  it('frames a unit box at 70-80% of the vertical FOV', () => {
    const distance = computeFramingDistance({ x: 1, y: 1, z: 1 })
    const coverage = coveredFraction(1, distance)

    expect(coverage).toBeGreaterThanOrEqual(0.7)
    expect(coverage).toBeLessThanOrEqual(0.8)
    expect(coverage).toBeCloseTo(FRAMING_COVERAGE, 6)
    expect(distance).toBeCloseTo(1 / (2 * fovHalfTangent * FRAMING_COVERAGE), 6)
  })

  it('keeps the production coverage inside the 70-80% band', () => {
    expect(FRAMING_COVERAGE).toBeGreaterThanOrEqual(0.7)
    expect(FRAMING_COVERAGE).toBeLessThanOrEqual(0.8)
  })

  // The wider camera-facing axis is the one that must fit; the depth axis does
  // not project onto the square frame.
  it('fits the wider of the two camera-facing axes, ignoring depth', () => {
    const wide = computeFramingDistance({ x: 4, y: 1, z: 1 })
    const tall = computeFramingDistance({ x: 1, y: 4, z: 1 })
    const square = computeFramingDistance({ x: 4, y: 4, z: 1 })

    expect(wide).toBeCloseTo(square, 6)
    expect(tall).toBeCloseTo(square, 6)
    expect(coveredFraction(4, wide)).toBeCloseTo(FRAMING_COVERAGE, 6)
  })

  it('never places the camera closer than the requested minimum', () => {
    expect(computeFramingDistance({ x: 1, y: 1 }, { minDistance: 5 })).toBe(5)
  })

  it('falls back to the minimum for a box with no extent', () => {
    expect(computeFramingDistance({ x: 0, y: 0 }, { minDistance: 5 })).toBe(5)
    expect(computeFramingDistance(null, { minDistance: 5 })).toBe(5)
  })
})

describe('sampleAnimatedBounds', () => {
  globalThis.self = globalThis
  globalThis.ProgressEvent = class ProgressEvent {
    constructor(type, init = {}) {
      this.type = type
      Object.assign(this, init)
    }
  }
  globalThis.createImageBitmap = async () => ({
    width: 4,
    height: 4,
    close() {},
  })

  function loadFixture(name) {
    const source = readFileSync(
      new URL(`../test/fixtures/animated/${name}.gltf`, import.meta.url),
      'utf8'
    )
    return new Promise((resolve, reject) => {
      new GLTFLoader().parse(
        source,
        '',
        gltf => {
          gltf.scene.animations = gltf.animations
          resolve(gltf)
        },
        reject
      )
    })
  }

  /** Scale the model to normalizeModel's 2-unit view box. */
  function normalizeToViewBox(model) {
    const size = new THREE.Box3()
      .setFromObject(model)
      .getSize(new THREE.Vector3())
    model.scale.multiplyScalar(2 / Math.max(size.x, size.y, size.z))
  }

  function sampleUnion(model) {
    const clip = model.animations[0]
    const mixer = new THREE.AnimationMixer(model)
    mixer.clipAction(clip).play()
    return sampleAnimatedBounds(THREE, model, mixer, {
      duration: clip.duration,
      samples: 12,
    })
  }

  // Regression: precise Box3 on a SkinnedMesh only refreshes bindMatrixInverse
  // through its own updateMatrixWorld. Without it the post-normalization root
  // scale is applied twice, so the union comes back ~2x too big (z ~4 instead of
  // 2) and the camera lands twice as far out. The wave also has to widen x.
  it('measures skinned union without double-counting the normalized scale', async () => {
    const gltf = await loadFixture('combined')
    normalizeToViewBox(gltf.scene)

    const union = sampleUnion(gltf.scene)
    const size = union.getSize(new THREE.Vector3())

    expect(size.z).toBeCloseTo(2, 5)
    expect(size.x).toBeGreaterThan(3)
    expect(size.x).toBeLessThan(4)
    expect(size.x).toBeCloseTo(3.232, 2)
  })
})
