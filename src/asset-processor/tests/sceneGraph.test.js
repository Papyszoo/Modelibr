import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { extractSceneGraph } from '../lib/sceneGraph.js'

function meshNamed(name, geometry, materialName) {
  const material = new THREE.MeshStandardMaterial()
  material.name = materialName
  const mesh = new THREE.Mesh(geometry, material)
  mesh.name = name
  return mesh
}

function buildScene() {
  const root = new THREE.Group()
  root.name = 'Root'

  const chair = new THREE.Group()
  chair.name = 'Chair'
  const legGeometry = new THREE.BoxGeometry(0.1, 1, 0.1)
  // Two legs share the SAME geometry shape → their geometry hashes must match.
  chair.add(meshNamed('Leg', legGeometry.clone(), 'Wood'))
  chair.add(meshNamed('Leg', legGeometry.clone(), 'Wood'))
  chair.add(meshNamed('Seat', new THREE.BoxGeometry(1, 0.1, 1), 'Fabric'))
  root.add(chair)

  const armature = new THREE.Group()
  armature.name = 'Armature'
  const bone = new THREE.Bone()
  bone.name = 'RootBone'
  armature.add(bone)
  root.add(armature)

  root.animations = [new THREE.AnimationClip('Idle', 1.5, [])]
  return root
}

describe('extractSceneGraph', () => {
  const result = extractSceneGraph(buildScene(), THREE, { sourceFormat: 'glb' })

  it('emits one part per descendant object with stable part paths', () => {
    const paths = result.parts.map(p => p.partPath).sort()
    expect(paths).toEqual([
      '/Armature',
      '/Armature/RootBone',
      '/Chair',
      '/Chair/Leg[0]',
      '/Chair/Leg[1]',
      '/Chair/Seat',
    ])
  })

  it('classifies object types', () => {
    const byPath = Object.fromEntries(
      result.parts.map(p => [p.partPath, p.objectType])
    )
    expect(byPath['/Chair']).toBe('group')
    expect(byPath['/Chair/Leg[0]']).toBe('mesh')
    expect(byPath['/Armature/RootBone']).toBe('bone')
  })

  it('gives duplicate-geometry parts the same geometry hash', () => {
    const leg0 = result.parts.find(p => p.partPath === '/Chair/Leg[0]')
    const leg1 = result.parts.find(p => p.partPath === '/Chair/Leg[1]')
    const seat = result.parts.find(p => p.partPath === '/Chair/Seat')
    expect(leg0.geometryHash).toBeTruthy()
    expect(leg0.geometryHash).toBe(leg1.geometryHash)
    expect(seat.geometryHash).not.toBe(leg0.geometryHash)
  })

  it('nulls native-only fields on the three.js path', () => {
    const leg0 = result.parts.find(p => p.partPath === '/Chair/Leg[0]')
    expect(leg0.vertexGroups).toBeNull()
    expect(leg0.modifiers).toBeNull()
    expect(leg0.quadCount).toBeNull()
  })

  it('rolls up totals, materials, bones and animations', () => {
    expect(result.rollups.meshCount).toBe(3)
    expect(result.rollups.boneCount).toBe(1)
    expect(result.rollups.totalTriangles).toBeGreaterThan(0)
    expect(result.rollups.materialNames).toEqual(['Fabric', 'Wood'])
    expect(result.rollups.animationCount).toBe(1)
    expect(result.rollups.animations[0]).toMatchObject({
      name: 'Idle',
      duration: 1.5,
    })
    expect(result.rollups.unitConfidence).toBe('medium')
  })

  it('computes world bounds for the whole asset', () => {
    expect(result.rollups.worldBounds).not.toBeNull()
    expect(result.rollups.worldBounds.dimensions).toHaveLength(3)
  })

  it('reports the version stamps', () => {
    expect(result.extractorVersion).toBe(2)
    expect(result.geometryHashVersion).toBe(1)
    expect(result.partPathVersion).toBe(1)
  })

  it('emits a per-part world bounding box that reflects the node transform', () => {
    // Local geometry is a unit cube; a 3× scale must show up in the WORLD box,
    // not the local one — this is what makes derived part dimensions correct.
    const root = new THREE.Group()
    const mesh = meshNamed('Widget', new THREE.BoxGeometry(1, 1, 1), 'M')
    mesh.scale.set(3, 3, 3)
    root.add(mesh)

    const out = extractSceneGraph(root, THREE, { sourceFormat: 'glb' })
    const part = out.parts.find(p => p.partPath === '/Widget')

    // Local box stays unit-sized; world box is scaled.
    expect(part.boundingBox.max[0] - part.boundingBox.min[0]).toBeCloseTo(1)
    expect(part.worldBoundingBox).not.toBeNull()
    expect(part.worldBoundingBox.dimensions).toEqual([3, 3, 3])
  })
})
