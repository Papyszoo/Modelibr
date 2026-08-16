import './SceneHierarchy.css'

import { type JSX } from 'react'

import type { SceneDocument, SceneNodeView, SceneOverlap } from '../types'

interface SceneHierarchyProps {
  document: SceneDocument
  nodeFacts: Map<string, SceneNodeView>
  overlaps: SceneOverlap[]
  selectedNodeId: string | null
  onSelectNode: (nodeId: string | null) => void
  onToggleVisible: (nodeId: string, visible: boolean) => void
  onRemoveNode: (nodeId: string) => void
}

/**
 * The scene's contents as a list, with the server's warnings attached to the
 * nodes they are about.
 *
 * Overlaps are surfaced here rather than only in a panel because the node they
 * concern is the thing the user is looking for - a warning list that names ids
 * makes the reader do the join themselves.
 */
export function SceneHierarchy({
  document,
  nodeFacts,
  overlaps,
  selectedNodeId,
  onSelectNode,
  onToggleVisible,
  onRemoveNode,
}: SceneHierarchyProps): JSX.Element {
  const overlapping = new Set(
    overlaps.flatMap(overlap => [overlap.nodeIdA, overlap.nodeIdB])
  )

  if (document.nodes.length === 0) {
    return (
      <div className="scene-hierarchy scene-hierarchy--empty">
        <p>No assets placed yet.</p>
        <p className="scene-hierarchy-hint">
          Place one from the library, or let an agent build the scene over MCP.
        </p>
      </div>
    )
  }

  return (
    <ul className="scene-hierarchy" data-testid="scene-hierarchy">
      {document.nodes.map(node => {
        const facts = nodeFacts.get(node.id)
        const label = node.name ?? node.id

        return (
          <li
            key={node.id}
            className={
              node.id === selectedNodeId
                ? 'scene-hierarchy-row scene-hierarchy-row--selected'
                : 'scene-hierarchy-row'
            }
          >
            <button
              type="button"
              className="scene-hierarchy-label"
              onClick={() => onSelectNode(node.id)}
              title={node.id}
            >
              <span className="scene-hierarchy-name">{label}</span>
              <span className="scene-hierarchy-meta">
                {node.asset
                  ? `${node.asset.assetType} ${node.asset.assetId}${
                      node.asset.versionId ? ` · v${node.asset.versionId}` : ''
                    }`
                  : `primitive · ${node.primitive?.shape ?? 'unknown'}`}
              </span>
              {facts && facts.sourceDimensions === null && node.asset ? (
                <span
                  className="scene-hierarchy-flag"
                  title="This asset has no derived bounds, so overlap and scale checks skip it."
                >
                  bounds unknown
                </span>
              ) : null}
              {overlapping.has(node.id) ? (
                <span className="scene-hierarchy-flag scene-hierarchy-flag--warn">
                  overlapping
                </span>
              ) : null}
            </button>

            <div className="scene-hierarchy-actions">
              <button
                type="button"
                aria-label={node.visible ? 'Hide node' : 'Show node'}
                onClick={() => onToggleVisible(node.id, !node.visible)}
              >
                <i className={node.visible ? 'pi pi-eye' : 'pi pi-eye-slash'} />
              </button>
              <button
                type="button"
                aria-label="Remove node"
                onClick={() => onRemoveNode(node.id)}
              >
                <i className="pi pi-trash" />
              </button>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
