import * as THREE from 'three'

import { ModelAnimationController } from '../ModelAnimationController'

/**
 * Regression: the controller labelled an unnamed morph mesh "Mesh", while the
 * worker extractor and the backend store `mesh.name || ''` for the same mesh.
 * Named meshes agreed; only unnamed ones disagreed, so the panel offered shape
 * keys under a name no other surface used.
 */
describe('ModelAnimationController shape-key mesh names', () => {
  function controllerFor(name: string): ModelAnimationController {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(),
      new THREE.MeshStandardMaterial()
    )
    mesh.name = name
    mesh.morphTargetDictionary = { Squash: 0 }
    mesh.morphTargetInfluences = [0]
    const root = new THREE.Group()
    root.add(mesh)

    const controller = new ModelAnimationController()
    controller.setRoot(root, [])
    return controller
  }

  it('keeps an unnamed morph mesh nameless', () => {
    const controller = controllerFor('')
    expect(controller.getSnapshot().shapeKeyGroups[0].meshName).toBe('')
  })

  it('keeps the mesh name the model actually carries', () => {
    const controller = controllerFor('Body')
    expect(controller.getSnapshot().shapeKeyGroups[0].meshName).toBe('Body')
  })
})
