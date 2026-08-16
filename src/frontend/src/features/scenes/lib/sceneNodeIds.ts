import type { SceneDocument } from '../types'

/**
 * The next free id with a given prefix, matching the server's scheme
 * (`model-42-1`, `model-42-2`).
 *
 * Readable rather than a GUID for the same reason the server generates them
 * that way: these ids appear in the hierarchy, in undo payloads and in an
 * agent's transcript, and `a3f9…` tells nobody which node is the lamp post.
 */
export function nextNodeId(document: SceneDocument, prefix: string): string {
  const taken = new Set(document.nodes.map(node => node.id))

  for (let i = 1; ; i++) {
    const candidate = `${prefix}-${i}`
    if (!taken.has(candidate)) {
      return candidate
    }
  }
}

export function nextLightId(document: SceneDocument, prefix: string): string {
  const taken = new Set(document.lights.map(light => light.id))

  for (let i = 1; ; i++) {
    const candidate = `${prefix}-${i}`
    if (!taken.has(candidate)) {
      return candidate
    }
  }
}

/**
 * Where to drop the next node so it does not land inside the last one.
 *
 * Nodes are laid out in a row along X, stepped by the width of the asset being
 * placed. This is a spreading default, not a layout: placing everything at the
 * origin would bury each new asset inside the previous one and report an
 * overlap the user did not create. Moving it afterwards is the point.
 */
export function nextPlacementX(
  document: SceneDocument,
  assetWidth: number | null
): number {
  const step = Math.max(assetWidth ?? 1, 1)
  return document.nodes.length * step
}
