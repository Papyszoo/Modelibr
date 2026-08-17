import type { SceneNode } from '../../types'
import {
  bindingForSlot,
  bindNodeMaterial,
  boundSlotNames,
} from '../sceneDressing'

function node(overrides: Partial<SceneNode> = {}): SceneNode {
  return {
    id: 'sofa',
    transform: {
      position: { x: 0, y: 0, z: 0 },
      rotationEuler: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    },
    visible: true,
    ...overrides,
  }
}

describe('bindNodeMaterial', () => {
  it('binds the default slot onto the node itself', () => {
    const patch = bindNodeMaterial(node(), null, { materialId: 7 })

    expect(patch).toEqual({ material: { materialId: 7, slot: null } })
  })

  it('strips a slot label off a binding used as the default', () => {
    // Copying a slot's binding onto the default must not leave it labelled -
    // read back out, a labelled default would be indistinguishable from an
    // override of that slot, and would then dress only that one part.
    const patch = bindNodeMaterial(node(), null, {
      materialId: 7,
      slot: 'cushions',
    })

    expect(patch.material?.slot).toBeNull()
  })

  it('clears the default binding', () => {
    const patch = bindNodeMaterial(
      node({ material: { materialId: 7 } }),
      null,
      null
    )

    expect(patch).toEqual({ material: null })
  })

  it('adds a slot override carrying its own slot name', () => {
    const patch = bindNodeMaterial(node(), 'cushions', { materialId: 7 })

    expect(patch.materialSlots).toEqual([{ materialId: 7, slot: 'cushions' }])
  })

  it('replaces an override rather than appending a second one', () => {
    const current = node({
      materialSlots: [{ textureSetId: 3, slot: 'cushions' }],
    })

    const patch = bindNodeMaterial(current, 'cushions', { materialId: 7 })

    expect(patch.materialSlots).toEqual([{ materialId: 7, slot: 'cushions' }])
  })

  it('matches an existing slot case-insensitively, as the server does', () => {
    const current = node({
      materialSlots: [{ materialId: 3, slot: 'Cushions' }],
    })

    const patch = bindNodeMaterial(current, 'cushions', { materialId: 7 })

    expect(patch.materialSlots).toHaveLength(1)
  })

  it('removes a cleared override instead of storing a null entry', () => {
    // A null entry in the array fails the document validator, so clearing has
    // to delete the entry - the same thing ApplySceneMaterialCommand does.
    const current = node({
      materialSlots: [
        { materialId: 7, slot: 'cushions' },
        { textureSetId: 3, slot: 'frame' },
      ],
    })

    const patch = bindNodeMaterial(current, 'cushions', null)

    expect(patch.materialSlots).toEqual([{ textureSetId: 3, slot: 'frame' }])
  })

  it('drops the list entirely when the last override is cleared', () => {
    // A node that was never dressed and one whose dressing was undone have to
    // be the same document, or the editor reports itself dirty forever.
    const current = node({ materialSlots: [{ materialId: 7, slot: 'seat' }] })

    const patch = bindNodeMaterial(current, 'seat', null)

    expect(patch.materialSlots).toBeUndefined()
  })

  it('is a no-op patch when clearing a slot that holds nothing', () => {
    expect(bindNodeMaterial(node(), 'seat', null)).toEqual({})
  })

  it('leaves the default binding untouched when a slot is bound', () => {
    const current = node({ material: { textureSetId: 3 } })

    const patch = bindNodeMaterial(current, 'seat', { materialId: 7 })

    expect(patch.material).toBeUndefined()
    expect(patch.materialSlots).toEqual([{ materialId: 7, slot: 'seat' }])
  })
})

describe('bindingForSlot', () => {
  it('reads the default binding for a null slot', () => {
    expect(bindingForSlot(node({ material: { materialId: 7 } }), null)).toEqual(
      {
        materialId: 7,
      }
    )
  })

  it('reads an override by slot name, case-insensitively', () => {
    const current = node({
      materialSlots: [{ materialId: 7, slot: 'Cushions' }],
    })

    expect(bindingForSlot(current, 'cushions')).toEqual({
      materialId: 7,
      slot: 'Cushions',
    })
  })

  it('does not fall back to the default binding for an undressed slot', () => {
    // The default does dress that slot at render time, but the panel has to
    // say the slot has no override - otherwise clearing it looks available
    // when there is nothing there to clear.
    const current = node({ material: { materialId: 7 } })

    expect(bindingForSlot(current, 'cushions')).toBeNull()
  })
})

describe('boundSlotNames', () => {
  it('lists overrides in document order, ignoring the default', () => {
    const current = node({
      material: { materialId: 1 },
      materialSlots: [
        { materialId: 7, slot: 'cushions' },
        { textureSetId: 3, slot: 'frame' },
      ],
    })

    expect(boundSlotNames(current)).toEqual(['cushions', 'frame'])
  })

  it('is empty for an undressed node', () => {
    expect(boundSlotNames(node())).toEqual([])
  })
})
