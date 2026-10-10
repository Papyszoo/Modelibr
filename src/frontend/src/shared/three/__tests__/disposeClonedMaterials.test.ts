import * as THREE from 'three'

import { disposeClonedMaterials } from '../disposeClonedMaterials'

/**
 * The rule the scene viewer, the model viewer and the textured viewer all rely
 * on: a rebuilt clone owns only the materials a build introduced. Disposing the
 * ones it still SHARES with the loaded source blanks the original - and every
 * other placement of the same asset - which is why this exists as one helper.
 */
describe('disposeClonedMaterials', () => {
  it('disposes the materials the clone introduced', () => {
    const source = new THREE.Mesh(
      new THREE.BoxGeometry(),
      new THREE.MeshStandardMaterial()
    )
    const clone = new THREE.Group()
    const own = new THREE.MeshStandardMaterial()
    clone.add(new THREE.Mesh(new THREE.BoxGeometry(), own))
    const dispose = jest.spyOn(own, 'dispose')

    disposeClonedMaterials(clone, source)

    expect(dispose).toHaveBeenCalledTimes(1)
  })

  it('leaves materials shared with the source alone', () => {
    const shared = new THREE.MeshStandardMaterial()
    const source = new THREE.Mesh(new THREE.BoxGeometry(), shared)
    const clone = source.clone(true) as THREE.Mesh
    const dispose = jest.spyOn(shared, 'dispose')

    disposeClonedMaterials(clone, source)

    expect(dispose).not.toHaveBeenCalled()
    expect(clone.material).toBe(shared)
  })

  it('handles a mesh with a material array', () => {
    const a = new THREE.MeshStandardMaterial()
    const b = new THREE.MeshStandardMaterial()
    const source = new THREE.Mesh(new THREE.BoxGeometry(), a)
    const clone = new THREE.Group()
    clone.add(new THREE.Mesh(new THREE.BoxGeometry(), [a, b]))
    const disposeA = jest.spyOn(a, 'dispose')
    const disposeB = jest.spyOn(b, 'dispose')

    disposeClonedMaterials(clone, source)

    expect(disposeA).not.toHaveBeenCalled()
    expect(disposeB).toHaveBeenCalledTimes(1)
  })
})
