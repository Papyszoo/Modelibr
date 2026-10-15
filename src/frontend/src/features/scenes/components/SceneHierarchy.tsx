import './SceneHierarchy.css'

import { Badge } from 'primereact/badge'
import { Button } from 'primereact/button'
import { ContextMenu } from 'primereact/contextmenu'
import { type MenuItem } from 'primereact/menuitem'
import { type JSX, useMemo, useRef, useState } from 'react'

import { EmptyState } from '@/shared/components'

import type {
  SceneDocument,
  SceneNode,
  SceneNodeView,
  SceneOverlap,
} from '../types'

interface SceneHierarchyProps {
  document: SceneDocument
  nodeFacts: Map<string, SceneNodeView>
  /** Nodes whose asset failed to load in the viewport, keyed by node id. */
  failedNodes: Map<string, string>
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
  failedNodes,
  overlaps,
  selectedNodeId,
  onSelectNode,
  onToggleVisible,
  onRemoveNode,
}: SceneHierarchyProps): JSX.Element {
  const [contextNode, setContextNode] = useState<SceneNode | null>(null)
  const contextMenu = useRef<ContextMenu>(null)

  const openNodeMenu = (event: React.MouseEvent, node: SceneNode): void => {
    event.preventDefault()
    setContextNode(node)
    contextMenu.current?.show(event)
  }

  // The hierarchy rows get the same right-click menu every other card has:
  // select, toggle visibility and remove, rather than only the inline buttons.
  const contextMenuItems = useMemo<MenuItem[]>(
    () => [
      {
        label: 'Select',
        icon: 'pi pi-cursor',
        command: () => {
          if (contextNode) onSelectNode(contextNode.id)
        },
      },
      {
        label: contextNode?.visible ? 'Hide' : 'Show',
        icon: contextNode?.visible ? 'pi pi-eye-slash' : 'pi pi-eye',
        command: () => {
          if (contextNode) onToggleVisible(contextNode.id, !contextNode.visible)
        },
      },
      { separator: true },
      {
        label: 'Remove',
        icon: 'pi pi-trash',
        command: () => {
          if (contextNode) onRemoveNode(contextNode.id)
        },
      },
    ],
    [contextNode, onSelectNode, onToggleVisible, onRemoveNode]
  )

  // Only the overlaps the server does NOT expect to be there are warnings.
  // `likelyIntentional` covers resting contact, declared anchors and grazes, so
  // flagging those would report a lamp standing on a table as a mistake.
  const overlapping = new Set(
    overlaps
      .filter(overlap => !overlap.likelyIntentional)
      .flatMap(overlap => [overlap.nodeIdA, overlap.nodeIdB])
  )

  return (
    <section className="scene-hierarchy">
      <header className="scene-hierarchy-header">
        <h3>Scene</h3>
        {document.nodes.length > 0 ? (
          <Badge value={document.nodes.length} severity="secondary" />
        ) : null}
      </header>

      {document.nodes.length === 0 ? (
        <EmptyState
          variant="compact"
          icon="pi-box"
          title="Nothing placed yet"
          message="Pick a model from the library above, or add a blockout box."
        />
      ) : (
        <ul className="scene-hierarchy-list" data-testid="scene-hierarchy">
          {document.nodes.map(node => {
            const facts = nodeFacts.get(node.id)
            const boundsUnknown =
              Boolean(node.asset) && facts?.sourceDimensions == null
            const loadFailure = failedNodes.get(node.id)

            return (
              <li
                key={node.id}
                data-testid="scene-node-row"
                data-node-id={node.id}
                onContextMenu={event => openNodeMenu(event, node)}
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
                  <span className="scene-hierarchy-name">
                    <i
                      className={node.asset ? 'pi pi-box' : 'pi pi-stop'}
                      aria-hidden
                    />
                    {node.name ?? node.id}
                  </span>
                  <span className="scene-hierarchy-meta">
                    {node.asset
                      ? `${node.asset.assetType} ${node.asset.assetId}${
                          node.asset.versionId
                            ? ` · v${node.asset.versionId}`
                            : ''
                        }`
                      : `blockout · ${node.primitive?.shape ?? 'unknown'}`}
                  </span>
                  {boundsUnknown || overlapping.has(node.id) || loadFailure ? (
                    <span className="scene-hierarchy-flags">
                      {loadFailure ? (
                        <span
                          className="scene-hierarchy-flag scene-hierarchy-flag--error"
                          title={loadFailure}
                        >
                          failed to load
                        </span>
                      ) : null}
                      {boundsUnknown ? (
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
                    </span>
                  ) : null}
                </button>

                <div className="scene-hierarchy-actions">
                  <Button
                    icon={node.visible ? 'pi pi-eye' : 'pi pi-eye-slash'}
                    text
                    rounded
                    size="small"
                    aria-label={node.visible ? 'Hide node' : 'Show node'}
                    tooltip={node.visible ? 'Hide' : 'Show'}
                    onClick={() => onToggleVisible(node.id, !node.visible)}
                  />
                  <Button
                    icon="pi pi-trash"
                    text
                    rounded
                    size="small"
                    severity="danger"
                    aria-label="Remove node"
                    tooltip="Remove"
                    onClick={() => onRemoveNode(node.id)}
                  />
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <ContextMenu
        ref={contextMenu}
        model={contextMenuItems}
        onHide={() => setContextNode(null)}
      />
    </section>
  )
}
