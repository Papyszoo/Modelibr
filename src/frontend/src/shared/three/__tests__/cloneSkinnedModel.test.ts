import * as THREE from 'three'

import { cloneSkinnedModel } from '../cloneSkinnedModel'

/**
 * Guards the phase 0 rig fix: `Object3D.clone()` shares one `Skeleton` between
 * every copy, so two instances of a rigged model move together. These tests
 * break if the helper stops going through SkeletonUtils - a plain `.clone()`
 * leaves the clones' bones pointing at the source bones, and the second
 * assertion pair catches that.
 */

function buildRiggedModel(): THREE.Group {
  const root = new THREE.Group()

  const hip = new THREE.Bone()
  hip.name = 'hip'
  const shin = new THREE.Bone()
  shin.name = 'shin'
  hip.add(shin)
  root.add(hip)

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute(
    'position',
    new THREE.BufferAttribute(new Float32Array([0, 0, 0, 0, 1, 0, 1, 0, 0]), 3)
  )
  geometry.setAttribute(
    'skinIndex',
    new THREE.BufferAttribute(
      new Uint16Array([0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0]),
      4
    )
  )
  geometry.setAttribute(
    'skinWeight',
    new THREE.BufferAttribute(
      new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0.5, 0.5, 0, 0]),
      4
    )
  )

  const mesh = new THREE.SkinnedMesh(geometry, new THREE.MeshStandardMaterial())
  root.add(mesh)
  mesh.bind(new THREE.Skeleton([hip, shin]))

  return root
}

function skinnedMeshIn(root: THREE.Object3D): THREE.SkinnedMesh {
  let found: THREE.SkinnedMesh | null = null
  root.traverse(node => {
    if ((node as THREE.SkinnedMesh).isSkinnedMesh) {
      found = node as THREE.SkinnedMesh
    }
  })
  if (!found) throw new Error('no skinned mesh in clone')
  return found
}

function isDescendant(ancestor: THREE.Object3D, node: THREE.Object3D): boolean {
  let current: THREE.Object3D | null = node
  while (current) {
    if (current === ancestor) return true
    current = current.parent
  }
  return false
}

describe('cloneSkinnedModel', () => {
  it('gives each clone its own skeleton instead of sharing one', () => {
    const root = buildRiggedModel()

    const first = cloneSkinnedModel(root)
    const second = cloneSkinnedModel(root)

    const firstMesh = skinnedMeshIn(first)
    const secondMesh = skinnedMeshIn(second)

    expect(firstMesh.skeleton).not.toBe(secondMesh.skeleton)
    expect(firstMesh.skeleton.bones[0]).not.toBe(secondMesh.skeleton.bones[0])
    // A plain Object3D.clone() would leave these pointing at the source bone.
    expect(firstMesh.skeleton.bones[0]).not.toBe(root.getObjectByName('hip'))
  })

  it("keeps each clone's bones inside that clone", () => {
    const root = buildRiggedModel()

    for (const clone of [cloneSkinnedModel(root), cloneSkinnedModel(root)]) {
      const mesh = skinnedMeshIn(clone)
      for (const bone of mesh.skeleton.bones) {
        expect(isDescendant(clone, bone)).toBe(true)
      }
    }
  })
})
