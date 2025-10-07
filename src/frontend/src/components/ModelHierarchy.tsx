import { useState } from 'react'
import { Tree } from 'primereact/tree'
import { TreeNode } from 'primereact/treenode'
import { HierarchyNode } from '../hooks/useModelHierarchy'
import './ModelHierarchy.css'

interface ModelHierarchyProps {
  hierarchy: HierarchyNode | null
}

/**
 * Convert HierarchyNode to PrimeReact TreeNode format
 */
function convertToTreeNode(node: HierarchyNode): TreeNode {
  const label = (
    <div className="hierarchy-node-label">
      <span className="node-name">{node.name}</span>
      <span className="node-type">{node.type}</span>
    </div>
  )

  const treeNode: TreeNode = {
    key: node.id,
    label,
    children: node.children.map(child => convertToTreeNode(child)),
    data: node,
  }

  return treeNode
}

function ModelHierarchy({ hierarchy }: ModelHierarchyProps) {
  const [selectedKeys, setSelectedKeys] = useState<{ [key: string]: boolean }>(
    {}
  )

  if (!hierarchy) {
    return (
      <div className="model-hierarchy-empty">
        <p>No model loaded</p>
      </div>
    )
  }

  const treeData = [convertToTreeNode(hierarchy)]
  const selectedKey = Object.keys(selectedKeys)[0] || null
  const selectedNode = selectedKey ? findNodeById(hierarchy, selectedKey) : null

  return (
    <div className="model-hierarchy">
      <div className="hierarchy-tree">
        <Tree
          value={treeData}
          selectionMode="single"
          selectionKeys={selectedKeys}
          onSelectionChange={e => {
            // PrimeReact Tree returns the value as either an object or the key itself
            // Normalize it to always be an object
            const value = e.value
            if (typeof value === 'string') {
              setSelectedKeys({ [value]: true })
            } else {
              setSelectedKeys(value || {})
            }
          }}
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

export default ModelHierarchy
