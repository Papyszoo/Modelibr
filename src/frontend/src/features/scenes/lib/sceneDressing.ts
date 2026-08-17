import type { SceneMaterialBinding, SceneNode } from '../types'

/**
 * The key the default binding is stored under in a `NodeDressing` map. The
 * scene document expresses it as a binding with no slot, which dresses every
 * slot no override names.
 */
export const DEFAULT_SLOT_KEY = ''

/**
 * The node patch that binds `binding` to `slot`, or clears it when `binding` is
 * null. A null `slot` is the node's default binding.
 *
 * This mirrors `ApplySceneMaterialCommandHandler` deliberately: the editor and
 * `apply_material` write the same document, and a node dressed by hand has to
 * come out identical to one an agent dressed. The rules that matter are that a
 * cleared slot is **removed** rather than stored as a null - a null entry would
 * fail the document validator - and that an emptied list becomes null, so a
 * node that was never dressed and one whose dressing was undone are the same
 * document.
 */
export function bindNodeMaterial(
  node: SceneNode,
  slot: string | null,
  binding: SceneMaterialBinding | null
): Partial<SceneNode> {
  if (slot === null) {
    // The default binding is the one with no slot. Stripping it here means a
    // binding cannot arrive labelled with the slot it was copied from and then
    // read back as an override of that slot.
    return { material: binding === null ? null : { ...binding, slot: null } }
  }

  const slots = [...(node.materialSlots ?? [])]
  const index = slots.findIndex(
    entry => (entry.slot ?? '').toLowerCase() === slot.toLowerCase()
  )

  if (binding === null) {
    if (index < 0) {
      return {}
    }
    slots.splice(index, 1)
  } else {
    // The slot travels on the binding, as the server stores it - a binding
    // that did not carry its own slot could not be told apart from the
    // default one once it was read back out of the array.
    const next: SceneMaterialBinding = { ...binding, slot }
    if (index < 0) {
      slots.push(next)
    } else {
      slots[index] = next
    }
  }

  return { materialSlots: slots.length === 0 ? undefined : slots }
}

/** The binding currently dressing `slot`, or null. A null `slot` is the default. */
export function bindingForSlot(
  node: SceneNode,
  slot: string | null
): SceneMaterialBinding | null {
  if (slot === null) {
    return node.material ?? null
  }

  return (
    node.materialSlots?.find(
      entry => (entry.slot ?? '').toLowerCase() === slot.toLowerCase()
    ) ?? null
  )
}

/**
 * Every slot the node has an override for, in document order.
 *
 * Offered alongside the model's own material names rather than instead of them:
 * an agent may have dressed a slot this version no longer has, and a binding the
 * panel does not list is one the user cannot remove.
 */
export function boundSlotNames(node: SceneNode): string[] {
  const names: string[] = []
  for (const entry of node.materialSlots ?? []) {
    const slot = entry.slot ?? ''
    if (slot !== '' && !names.includes(slot)) {
      names.push(slot)
    }
  }
  return names
}
