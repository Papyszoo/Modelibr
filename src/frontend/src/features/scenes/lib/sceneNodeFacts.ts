import type { SceneNodeView, SceneView } from '../types'

/**
 * The server's derived facts for each node, keyed by node id.
 *
 * Kept separate from the draft document because moving a node does not change
 * how big its asset is - so a caller can keep drawing correctly without waiting
 * for a round trip.
 *
 * Extracted rather than duplicated: both the editor and the headless render view
 * need exactly this map, and a second copy would be free to drift from the one
 * the editor draws from - which is the whole thing render-back exists to rule out.
 */
export function buildSceneNodeFacts(
  view: SceneView | null | undefined
): Map<string, SceneNodeView> {
  const facts = new Map<string, SceneNodeView>()
  for (const node of view?.nodes ?? []) {
    facts.set(node.nodeId, node)
  }
  return facts
}
