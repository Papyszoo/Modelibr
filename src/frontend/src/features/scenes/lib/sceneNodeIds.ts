import type { Aabb, SceneDocument, SceneNode, SceneNodeView } from '../types'
import { boundsOffset } from './sceneGeometry'

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
 * The measured size facts of a node that so far only exists in the draft.
 *
 * The server derives a node's footprint only when a document is saved; until
 * then there is no server box to measure. These are the same numbers that
 * footprint is built from - the asset's measured dimensions and where its
 * origin sits inside them - captured when the asset was placed.
 */
export type DraftNodeBounds = Pick<
  SceneNodeView,
  'sourceDimensions' | 'originConvention' | 'originInBounds'
>

/**
 * The node's right edge along X, from the best box available for it.
 *
 * The server's footprint wins when it exists - it is the box the overlap check
 * reports, rotation included. A node added since the last save has no footprint
 * yet, so its edge comes from the measured bounds through `boundsOffset`, the
 * same offset the viewport draws its selection box with. A blockout primitive
 * needs no measurement: the document carries its size, and primitives are
 * authored centered (`SceneNodeObject` reads them the same way).
 */
function rightEdgeX(
  node: SceneNode,
  serverFootprint: Aabb | null | undefined,
  measured: DraftNodeBounds | undefined
): number {
  if (serverFootprint) {
    return serverFootprint.max.x
  }

  const bounds = measured?.sourceDimensions ?? node.primitive?.size ?? null
  if (!bounds) {
    return node.transform.position.x
  }

  const [offsetX] = boundsOffset(
    bounds,
    node.primitive ? 'centered' : (measured?.originConvention ?? null),
    node.primitive ? null : (measured?.originInBounds ?? null)
  )
  const scaleX = node.transform.scale.x
  return (
    node.transform.position.x +
    scaleX * offsetX +
    Math.abs(scaleX) * (bounds.x / 2)
  )
}

/**
 * Where to drop the next node so it does not land inside the last one.
 *
 * The starting point is the right edge of what is already there, taken from
 * the server's own world-space footprints - the same boxes the overlap check
 * reports, so a node lands clear of them rather than at `count x own width`,
 * which buried a small asset inside every wider one before it. The new node's
 * box starts on that edge: its origin sits `originFractionX` of its own width
 * into its bounds (0.5 for a centred asset like a primitive), so the origin
 * goes `step * fraction` past the edge.
 *
 * Nodes added in the same unsaved draft have no server footprint yet, so
 * `draftBounds` carries what was measured when they were placed; that is what
 * keeps a box added beside a freshly placed model clear of it. The old
 * count-based spread is kept as a floor, not as the answer: a scene whose
 * nodes have no derived bounds has no edge to measure, and that is the spread
 * which separated those. This is a spreading default, not a layout - moving
 * the node afterwards is the point.
 */
export function nextPlacementX(
  document: SceneDocument,
  assetWidth: number | null,
  nodeFacts?: ReadonlyMap<string, Pick<SceneNodeView, 'footprint'>>,
  originFractionX: number | null = null,
  draftBounds?: ReadonlyMap<string, DraftNodeBounds>
): number {
  const step = Math.max(assetWidth ?? 1, 1)
  if (document.nodes.length === 0) {
    return 0
  }

  const rightEdge = document.nodes.reduce(
    (right, node) =>
      Math.max(
        right,
        rightEdgeX(
          node,
          nodeFacts?.get(node.id)?.footprint,
          draftBounds?.get(node.id)
        )
      ),
    0
  )

  const clearOfBounds = rightEdge + step * (originFractionX ?? 0.5)
  return Math.max(document.nodes.length * step, clearOfBounds)
}
