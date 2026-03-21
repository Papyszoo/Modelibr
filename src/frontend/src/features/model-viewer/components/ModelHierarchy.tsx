import './ModelHierarchy.css'

import { Tree } from 'primereact/tree'
import { type TreeNode } from 'primereact/treenode'
import { useCallback, type JSX } from 'react'

import { useModelObject } from '@/features/model-viewer/hooks/useModelObject'
import { type HierarchyNode } from '@/features/model-viewer/hooks/useModelHierarchy'

interface ModelHierarchyProps {
  hierarchy: HierarchyNode | null
}

function getNodeTypeClass(type: string): string {
  const t = type.toLowerCase()
  if (t === 'mesh' || t === 'skinnedmesh') return 'node-type-mesh'
  if (t === 'group') return 'node-type-group'
  if (t === 'scene') return 'node-type-scene'
  if (t === 'object3d' || t === 'bone') return 'node-type-object3d'
  return ''
}

/**
 * Convert HierarchyNode to PrimeReact TreeNode format
 */
function convertToTreeNode(node: HierarchyNode): TreeNode {
  const treeNode: TreeNode = {
    key: node.id,
    label: node.name,
    children: node.children.map(child => convertToTreeNode(child)),
    data: node,
  }

  return treeNode
}

export function ModelHierarchy({ hierarchy }: ModelHierarchyProps) {
  const { selectedNodeId, setSelectedNodeId, setHoveredNodeId } =
    useModelObject()

  const selectedKeys = selectedNodeId ? { [selectedNodeId]: true } : {}

  const handleSelectionChange = useCallback(
    (e: { value: string | { [key: string]: boolean } | null }) => {
      const value = e.value
      const clickedKey =
        typeof value === 'string' ? value : Object.keys(value || {})[0]
      if (clickedKey && clickedKey === selectedNodeId) {
        setSelectedNodeId(null)
      } else if (clickedKey) {
        setSelectedNodeId(clickedKey)
      } else {
        setSelectedNodeId(null)
      }
    },
    [selectedNodeId, setSelectedNodeId]
  )

  const nodeTemplate = useCallback(
    (node: TreeNode): JSX.Element => {
      const data = node.data as HierarchyNode
      return (
        <div
          className="hierarchy-node-label"
          onMouseEnter={() => setHoveredNodeId(data.id)}
          onMouseLeave={() => setHoveredNodeId(null)}
        >
          <span className="node-name">{data.name}</span>
          <span className={`node-type ${getNodeTypeClass(data.type)}`}>
            {data.type}
          </span>
        </div>
      )
    },
    [setHoveredNodeId]
  )

  if (!hierarchy) {
    return (
      <div className="model-hierarchy-empty">
        <p>No model loaded</p>
      </div>
    )
  }

  const treeData = [convertToTreeNode(hierarchy)]
  const selectedNode = selectedNodeId
    ? findNodeById(hierarchy, selectedNodeId)
    : null

  return (
    <div className="model-hierarchy">
      <div className="hierarchy-tree">
        <Tree
          value={treeData}
          selectionMode="single"
          selectionKeys={selectedKeys}
          onSelectionChange={handleSelectionChange}
          nodeTemplate={nodeTemplate}
          className="hierarchy-tree-component"
        />
      </div>

      {selectedNode && (
        <div className="hierarchy-details">
          <h4>Details</h4>
          <div className="detail-grid">
            <div className="detail-item">
              <span className="detail-label">Name:</span>
              <span className="detail-value">{selectedNode.name}</span>
            </div>
            <div className="detail-item">
              <span className="detail-label">Type:</span>
              <span className="detail-value">{selectedNode.type}</span>
            </div>
            {selectedNode.meshInfo && (
              <>
                <div className="detail-item">
                  <span className="detail-label">Vertices:</span>
                  <span className="detail-value">
                    {selectedNode.meshInfo.vertices.toLocaleString()}
                  </span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Faces:</span>
                  <span className="detail-value">
                    {selectedNode.meshInfo.faces.toLocaleString()}
                  </span>
                </div>
                {selectedNode.meshInfo.materials.length > 0 && (
                  <div className="detail-item detail-item-full">
                    <span className="detail-label">Materials:</span>
                    <span className="detail-value">
                      {selectedNode.meshInfo.materials.join(', ')}
                    </span>
                  </div>
                )}
              </>
            )}
            {selectedNode.materialInfo && (
              <>
                <div className="detail-item">
                  <span className="detail-label">Material Type:</span>
                  <span className="detail-value">
                    {selectedNode.materialInfo.type}
                  </span>
                </div>
                {selectedNode.materialInfo.color && (
                  <div className="detail-item">
                    <span className="detail-label">Color:</span>
                    <span className="detail-value">
                      <span
                        className="color-preview"
                        style={{
                          backgroundColor: selectedNode.materialInfo.color,
                        }}
                      />
                      {selectedNode.materialInfo.color}
                    </span>
                  </div>
                )}
                {selectedNode.materialInfo.map && (
                  <div className="detail-item">
                    <span className="detail-label">Texture Map:</span>
                    <span className="detail-value">Yes</span>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * Find a node by ID in the hierarchy
 */
function findNodeById(node: HierarchyNode, id: string): HierarchyNode | null {
  if (node.id === id) {
    return node
  }

  for (const child of node.children) {
    const found = findNodeById(child, id)
    if (found) {
      return found
    }
  }

  return null
}
