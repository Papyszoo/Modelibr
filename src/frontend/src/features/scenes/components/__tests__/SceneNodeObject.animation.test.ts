import { readFileSync } from 'node:fs'
import path from 'node:path'
import { TextDecoder, TextEncoder } from 'node:util'

import { renderHook } from '@testing-library/react'
import type * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader'

import { cloneSkinnedModel } from '@/shared/three/cloneSkinnedModel'
import type { SlotMaterials } from '@/shared/three/parameterMaterial'
import type { MaterialTextureSets } from '@/shared/three/textureSetMaterial'

import { usePlacedModel } from '../../hooks/usePlacedModel'
import {
  applyShapeKeyWeights,
  createSceneNodeAnimation,
} from '../../lib/sceneNodeAnimation'
import type { SceneAnimation } from '../../types'

/**
 * Drives the runtime `SceneNodeObject` wraps, against the committed animated
 * fixtures loaded through GLTFLoader exactly as the scene loads them.
 *
 * The regressions these guard:
 *   - a clip named by the document never reaching a mixer (node frozen)
 *   - one mixer shared between two instances of the same rigged model
 *   - a missing clip throwing instead of rendering static (and warning per frame)
 *   - shape-key weights not landing on `morphTargetInfluences`
 *   - render mode advancing with the wall clock, so two renders disagree
 *   - a shape-key change rebuilding the clone, mixer and clip
 *   - a removed animation freezing the clone in its last pose
 *   - a missing-clip warning deduped across two nodes that share an asset
 */

// jsdom has no createImageBitmap; GLTFLoader decodes the fixtures' embedded PNGs
// with it. A 4x4 stub is enough - nothing here reads a pixel.
;(globalThis as { createImageBitmap?: unknown }).createImageBitmap =
  async () => ({
    width: 4,
    height: 4,
    close() {},
  })
// jsdom has no TextDecoder/TextEncoder; three uses them for the glTF JSON and
// buffer.
;(globalThis as { TextDecoder?: unknown }).TextDecoder = TextDecoder
;(globalThis as { TextEncoder?: unknown }).TextEncoder = TextEncoder

// jsdom's fetch/Request/Headers are missing, and three's loaders fetch the
// fixtures' data: URIs. These minimal shims serve a data: URL as bytes so the
// loader sees a normal 200 response; nothing leaves the process.
interface FakeResponseInit {
  url: string
}

function dataUrlBytes(url: string): Uint8Array {
  const comma = url.indexOf(',')
  const meta = url.slice(5, comma)
  const payload = decodeURIComponent(url.slice(comma + 1))
  return /;base64/.test(meta)
    ? new Uint8Array(Buffer.from(payload, 'base64'))
    : new TextEncoder().encode(payload)
}

class FakeRequest {
  url: string
  constructor(input: object | string) {
    this.url =
      typeof input === 'string' ? input : (input as FakeResponseInit).url
  }
}

class FakeHeaders {
  get(): string | null {
    return null
  }
}

;(globalThis as { Request?: unknown }).Request = FakeRequest
;(globalThis as { Headers?: unknown }).Headers = FakeHeaders
;(globalThis as { fetch?: unknown }).fetch = async (
  input: FakeRequest | string
) => {
  const url = typeof input === 'string' ? input : input.url
  const bytes = dataUrlBytes(url)
  return {
    status: 200,
    headers: new FakeHeaders(),
    body: undefined,
    arrayBuffer: async () =>
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    blob: async () => new Blob([bytes], { type: 'application/octet-stream' }),
    text: async () => new TextDecoder().decode(bytes),
    json: async () => JSON.parse(new TextDecoder().decode(bytes)),
  }
}

const FIXTURE_DIR = path.resolve(
  __dirname,
  '../../../../../../asset-processor/test/fixtures/animated'
)

interface LoadedFixture {
  scene: THREE.Group
  animations: THREE.AnimationClip[]
}

function parseFixture(fileName: string): Promise<LoadedFixture> {
  const source = readFileSync(path.join(FIXTURE_DIR, fileName), 'utf8')
  return new Promise((resolve, reject) => {
    new GLTFLoader().parse(
      source,
      '',
      gltf => resolve({ scene: gltf.scene, animations: gltf.animations }),
      reject
    )
  })
}

function jointOf(root: THREE.Object3D): THREE.Object3D {
  const joint = root.getObjectByName('Joint_Child')
  if (!joint) {
    throw new Error('fixture lost its Joint_Child node')
  }
  return joint
}

/**
 * Largest per-component difference between two quaternions. `Quaternion.angleTo`
 * loses precision near zero (acos of a dot product one ulp below 1 reads as
 * ~4e-4 rad), so it cannot distinguish "same pose" from "microscopically
 * different" - and "same pose" is exactly what these assertions are about.
 */
function poseDelta(a: THREE.Quaternion, b: THREE.Quaternion): number {
  const left = a.toArray()
  const right = b.toArray()
  return Math.max(...left.map((value, index) => Math.abs(value - right[index])))
}

function morphMeshOf(root: THREE.Object3D): THREE.Mesh {
  let mesh: THREE.Mesh | null = null
  root.traverse(child => {
    if (!mesh && (child as THREE.Mesh).isMesh) {
      mesh = child as THREE.Mesh
    }
  })
  if (!mesh) {
    throw new Error('fixture lost its mesh')
  }
  return mesh
}

describe('SceneNodeObject animation runtime', () => {
  it("plays the 'Wave' clip it was named, through a mixer on the clone", async () => {
    const { scene, animations } = await parseFixture('combined.gltf')
    const clone = cloneSkinnedModel(scene)
    const joint = jointOf(clone)
    const before = joint.quaternion.clone()

    const runtime = createSceneNodeAnimation(
      clone,
      animations,
      { clip: 'Wave', loop: true, speed: 1, timeOffset: 0 },
      'wave-test'
    )

    expect(runtime).not.toBeNull()
    expect(runtime!.action.getClip().name).toBe('Wave')

    runtime!.advance(0.5)

    // Halfway through Wave the joint is at 45 degrees; a runtime that never
    // reached the mixer leaves the rest pose in place.
    expect(joint.quaternion.equals(before)).toBe(false)
  })

  it('keeps two instances of one rigged model independent', async () => {
    // Regression: a mixer created on the shared loaded object poses both
    // copies from whichever instance was set up last.
    const { scene, animations } = await parseFixture('combined.gltf')
    const first = cloneSkinnedModel(scene)
    const second = cloneSkinnedModel(scene)

    const runtimeFirst = createSceneNodeAnimation(
      first,
      animations,
      { clip: 'Wave', loop: true, speed: 1, timeOffset: 0 },
      'instance-a'
    )
    createSceneNodeAnimation(
      second,
      animations,
      { clip: 'Wave', loop: true, speed: 1, timeOffset: 0 },
      'instance-b'
    )

    const secondBefore = jointOf(second).quaternion.clone()
    runtimeFirst!.advance(0.5)

    expect(jointOf(first).quaternion.equals(jointOf(second).quaternion)).toBe(
      false
    )
    expect(jointOf(second).quaternion.equals(secondBefore)).toBe(true)
  })

  it('renders static and warns exactly once when the named clip is not on the model', async () => {
    const { scene, animations } = await parseFixture('combined.gltf')
    const clone = cloneSkinnedModel(scene)
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})

    const first = createSceneNodeAnimation(
      clone,
      animations,
      { clip: 'NoSuchClip', loop: true, speed: 1, timeOffset: 0 },
      'missing-clip-test'
    )
    const second = createSceneNodeAnimation(
      clone,
      animations,
      { clip: 'NoSuchClip', loop: true, speed: 1, timeOffset: 0 },
      'missing-clip-test'
    )

    expect(first).toBeNull()
    expect(second).toBeNull()
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('NoSuchClip'))

    // And with no runtime there is nothing to advance: the node holds its pose.
    const before = jointOf(clone).quaternion.clone()
    first?.advance(5)
    expect(jointOf(clone).quaternion.equals(before)).toBe(true)

    warn.mockRestore()
  })

  it('warns once per node when two nodes share an asset and name the same unknown clip', async () => {
    // Regression: the dedupe key was the asset, so a second node naming the
    // same missing clip on the same model was never reported at all.
    const { scene, animations } = await parseFixture('combined.gltf')
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    const missing = { clip: 'NoSuchClip', loop: true, speed: 1, timeOffset: 0 }

    // Two reports for one node collapse to one; a second node reports its own.
    createSceneNodeAnimation(
      cloneSkinnedModel(scene),
      animations,
      missing,
      'per-node-warn-one'
    )
    createSceneNodeAnimation(
      cloneSkinnedModel(scene),
      animations,
      missing,
      'per-node-warn-one'
    )
    createSceneNodeAnimation(
      cloneSkinnedModel(scene),
      animations,
      missing,
      'per-node-warn-two'
    )

    expect(warn).toHaveBeenCalledTimes(2)

    warn.mockRestore()
  })

  it('sets shape-key weights by name on every mesh', async () => {
    const { scene } = await parseFixture('combined.gltf')
    const clone = cloneSkinnedModel(scene)
    const mesh = morphMeshOf(clone)

    applyShapeKeyWeights(clone, { Squash: 0.5 })

    const squash = mesh.morphTargetDictionary!.Squash
    const stretch = mesh.morphTargetDictionary!.Stretch
    expect(mesh.morphTargetInfluences![squash]).toBeCloseTo(0.5, 5)
    // A key the map does not name keeps the model's own default.
    expect(mesh.morphTargetInfluences![stretch]).toBe(0)
  })

  it('does not advance with real time in render mode, and t=0 is the timeOffset pose', async () => {
    const { scene, animations } = await parseFixture('combined.gltf')
    const offsetClone = cloneSkinnedModel(scene)
    const otherClone = cloneSkinnedModel(scene)

    const runtime = createSceneNodeAnimation(
      offsetClone,
      animations,
      { clip: 'Wave', loop: true, speed: 1, timeOffset: 0 },
      'render-test'
    )

    runtime!.setTime(0.4)
    const atPointFour = jointOf(offsetClone).quaternion.clone()

    // Real time passing (the editor's live-clock path) must not move the pose
    // set by setTime: a later setTime at the same t returns the same pose.
    runtime!.advance(0.1)
    expect(
      poseDelta(jointOf(offsetClone).quaternion, atPointFour)
    ).toBeGreaterThan(0.01)
    runtime!.setTime(0.4)
    expect(
      poseDelta(jointOf(offsetClone).quaternion, atPointFour)
    ).toBeLessThan(1e-6)

    // The render page's default t = 0 shows the node's configured start
    // offset: an offset of 0.25 at t=0 poses like offset 0 at t=0.25.
    const offsetCloneAgain = cloneSkinnedModel(scene)
    const withOffset = createSceneNodeAnimation(
      offsetCloneAgain,
      animations,
      { clip: 'Wave', loop: true, speed: 1, timeOffset: 0.25 },
      'offset-test'
    )
    const withoutOffset = createSceneNodeAnimation(
      otherClone,
      animations,
      { clip: 'Wave', loop: true, speed: 1, timeOffset: 0 },
      'zero-test'
    )

    withOffset!.setTime(0)
    withoutOffset!.setTime(0.25)

    expect(
      poseDelta(
        jointOf(offsetCloneAgain).quaternion,
        jointOf(otherClone).quaternion
      )
    ).toBeLessThan(1e-6)
  })
})

describe('usePlacedModel', () => {
  /**
   * Load inputs held referentially equal across rerenders. The point of these
   * tests is that a change to a per-frame prop must not rebuild the load, so
   * everything that is not under test has to keep the same identity.
   */
  function stableLoad() {
    const materialTextureSets: MaterialTextureSets = {}
    const slotMaterials: SlotMaterials = {}
    const loadedTextures: Record<string, THREE.Texture | null> = {}
    return { materialTextureSets, slotMaterials, loadedTextures }
  }

  it('keeps the clone, mixer and clip when a shape-key weight changes', async () => {
    // Regression: `shapeKeys` sat in the clone memo's dependency array, so each
    // step of a shape-key slider re-cloned the model, re-applied its materials,
    // rebuilt the mixer and restarted the clip from the top.
    const { scene, animations } = await parseFixture('combined.gltf')
    const animation: SceneAnimation = {
      clip: 'Wave',
      loop: true,
      speed: 1,
      timeOffset: 0,
    }
    const load = stableLoad()

    const { result, rerender } = renderHook(
      ({ shapeKeys }: { shapeKeys: Record<string, number> }) =>
        usePlacedModel({
          object: scene,
          clips: animations,
          animation,
          shapeKeys,
          ...load,
          texturesReady: false,
          nodeId: 'shape-key-node',
        }),
      { initialProps: { shapeKeys: { Squash: 0 } } }
    )

    const clone = result.current.clone
    const runtime = result.current.nodeAnimation!
    runtime.action.time = 0.3

    rerender({ shapeKeys: { Squash: 0.6 } })

    // Same clone, same mixer...
    expect(result.current.clone).toBe(clone)
    expect(result.current.nodeAnimation!.mixer).toBe(runtime.mixer)
    // ...and the clip kept its scrub position instead of restarting at 0.
    expect(result.current.nodeAnimation!.action.time).toBeCloseTo(0.3, 5)
    // The new weight did land on the clone's morph target.
    const mesh = morphMeshOf(clone)
    const squash = mesh.morphTargetDictionary!.Squash
    expect(mesh.morphTargetInfluences![squash]).toBeCloseTo(0.6, 5)
  })

  it('restores the bind pose and static shape keys when the animation is removed', async () => {
    // Regression: switching a node's clip to None stopped the mixer but left
    // the clone where the clip had put it - the bind pose was never restored,
    // and a morph the clip drove kept the clip's last value instead of the
    // node's own static weight.
    const { scene, animations } = await parseFixture('combined.gltf')
    const load = stableLoad()
    const pulse: SceneAnimation = {
      clip: 'Pulse',
      loop: true,
      speed: 1,
      timeOffset: 0,
    }
    // The rest pose, read from a clone the animation never touched.
    const bind = jointOf(cloneSkinnedModel(scene)).quaternion.clone()
    const zeroWeights = { Squash: 0 }
    const staticWeights = { Squash: 0.4 }

    const { result, rerender } = renderHook(
      ({
        animation,
        shapeKeys,
      }: {
        animation: SceneAnimation | null
        shapeKeys: Record<string, number>
      }) =>
        usePlacedModel({
          object: scene,
          clips: animations,
          animation,
          shapeKeys,
          ...load,
          texturesReady: false,
          nodeId: 'rest-pose-node',
        }),
      {
        initialProps: {
          animation: pulse as SceneAnimation | null,
          shapeKeys: zeroWeights,
        },
      }
    )

    const clone = result.current.clone
    const joint = jointOf(clone)
    const mesh = morphMeshOf(clone)
    const squash = mesh.morphTargetDictionary!.Squash

    // The clip drives the morph. Displace the bone as a superseded clip would
    // have left it, so the reset has to cover both halves.
    result.current.nodeAnimation!.advance(0.5)
    joint.quaternion.set(0.5, 0.5, 0.5, 0.5)
    expect(joint.quaternion.equals(bind)).toBe(false)
    expect(mesh.morphTargetInfluences![squash]).not.toBeCloseTo(0.4, 5)

    // Move the static weight while the clip is still playing, so the value the
    // mixer captured when it bound the morph is stale: removing the animation
    // must return the morph to the *current* static weight, not to whatever the
    // clip's binding happened to save.
    rerender({ animation: pulse, shapeKeys: staticWeights })

    rerender({ animation: null, shapeKeys: staticWeights })

    // No runtime, and the reset happened on the clone already on screen.
    expect(result.current.nodeAnimation).toBeNull()
    expect(result.current.clone).toBe(clone)
    // The bone quaternion is back at its bind value...
    expect(poseDelta(joint.quaternion, bind)).toBeLessThan(1e-6)
    // ...and the morph is back at the node's static weight.
    expect(mesh.morphTargetInfluences![squash]).toBeCloseTo(0.4, 5)
  })
})
