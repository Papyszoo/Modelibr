import { useState } from 'react'
import { Tree, TreeDragDropEvent } from 'primereact/tree'
import { TreeNode } from 'primereact/treenode'
import { Button } from 'primereact/button'
import { StageConfig, StageObject, StageGroup } from './SceneEditor'
import './StageHierarchy.css'

interface StageHierarchyProps {
  stageConfig: StageConfig
  selectedObjectId: string | null
  onSelectObject: (id: string | null) => void
  onDeleteObject: (id: string) => void
  onUpdateGroup: (groupId: string, updates: Partial<StageGroup>) => void
}

/**
 * Build hierarchy tree from stage configuration
 */
function buildHierarchyTree(stageConfig: StageConfig): TreeNode[] {
  const nodes: TreeNode[] = []

  // Create group nodes with their children
  const groupNodes = new Map<string, TreeNode>()

  stageConfig.groups.forEach(group => {
    const node: TreeNode = {
      key: group.id,
      label: (
        <div className="hierarchy-node-label">
          <span className="node-name">{group.name}</span>
          <span className="node-type">Group</span>
        </div>
      ),
      icon: 'pi pi-folder',
      data: group,
      children: [],
      droppable: true,
    }
    groupNodes.set(group.id, node)
  })

  // Helper to create tree node for objects
  const createObjectNode = (
    obj: StageObject,
    type: string,
    icon: string
  ): TreeNode => {
    return {
      key: obj.id,
      label: (
        <div className="hierarchy-node-label">
          <span className="node-name">{obj.id.split('-')[0]}</span>
          <span className="node-type">{type}</span>
        </div>
      ),
      icon,
      data: obj,
      draggable: true,
      droppable: false,
    }
  }

  // Track which objects are children of groups
  const childrenIds = new Set<string>()
  stageConfig.groups.forEach(group => {
    group.children.forEach(childId => childrenIds.add(childId))
  })

  // Add children to group nodes
  stageConfig.groups.forEach(group => {
    const groupNode = groupNodes.get(group.id)
    if (groupNode) {
      group.children.forEach(childId => {
        // Find the child object
        const childMesh = stageConfig.meshes.find(m => m.id === childId)
        const childLight = stageConfig.lights.find(l => l.id === childId)

        if (childMesh) {
          groupNode.children?.push(
            createObjectNode(childMesh, 'Mesh', 'pi pi-box')
          )
        } else if (childLight) {
          groupNode.children?.push(
            createObjectNode(childLight, 'Light', 'pi pi-sun')
          )
        }
      })
    }
  })

  // Add all groups to root
  groupNodes.forEach(node => nodes.push(node))

  // Add meshes that are not children of any group
  stageConfig.meshes
    .filter(mesh => !childrenIds.has(mesh.id))
    .forEach(mesh => {
      nodes.push(createObjectNode(mesh, 'Mesh', 'pi pi-box'))
    })

  // Add lights that are not children of any group
  stageConfig.lights
    .filter(light => !childrenIds.has(light.id))
    .forEach(light => {
      nodes.push(createObjectNode(light, 'Light', 'pi pi-sun'))
    })

  // Add helpers
  stageConfig.helpers.forEach(helper => {
    nodes.push(createObjectNode(helper, 'Helper', 'pi pi-eye'))
  })

  return nodes
}

function StageHierarchy({
  stageConfig,
  selectedObjectId,
  onSelectObject,
  onDeleteObject,
  onUpdateGroup,
}: StageHierarchyProps) {
  const [selectedKeys, setSelectedKeys] = useState<{ [key: string]: boolean }>(
    {}
  )

  // Update selected keys when selectedObjectId changes
  const currentSelectedKeys = selectedObjectId
    ? { [selectedObjectId]: true }
    : {}

  if (
    stageConfig.lights.length === 0 &&
    stageConfig.meshes.length === 0 &&
    stageConfig.groups.length === 0 &&
    stageConfig.helpers.length === 0
  ) {
    return (
      <div className="stage-hierarchy-empty">
        <p>No objects in scene</p>
        <p className="hint">Add components using the library button</p>
      </div>
    )
  }

  const treeData = buildHierarchyTree(stageConfig)

  const handleSelectionChange = (e: { value: unknown }) => {
    const value = e.value

    // Check if clicking on already selected node to deselect
    const clickedKey =
      typeof value === 'string' ? value : Object.keys(value || {})[0]
    if (clickedKey && selectedKeys[clickedKey]) {
      // Deselect if already selected
      setSelectedKeys({})
      onSelectObject(null)
    } else {
      const newSelectedKeys =
        typeof value === 'string'
          ? { [value]: true }
          : (value as { [key: string]: boolean }) || {}
      setSelectedKeys(newSelectedKeys)
      const selectedId = Object.keys(newSelectedKeys)[0]
      onSelectObject(selectedId || null)
    }
  }

  const handleDragDrop = (e: TreeDragDropEvent) => {
    // Get the dragged node and drop target
    const dragNode = e.dragNode
    const dropNode = e.dropNode

    if (!dragNode || !dropNode) return

    const draggedId = dragNode.key as string
    const targetGroupId = dropNode.key as string

    // Ensure target is a group
    const targetGroup = stageConfig.groups.find(g => g.id === targetGroupId)
    if (!targetGroup) return

    // Check if dragged item is a mesh or light
    const isMesh = stageConfig.meshes.some(m => m.id === draggedId)
    const isLight = stageConfig.lights.some(l => l.id === draggedId)

    if (isMesh || isLight) {
      // Remove from any existing parent group
      stageConfig.groups.forEach(group => {
        if (group.children.includes(draggedId) && group.id !== targetGroupId) {
          const updatedChildren = group.children.filter(id => id !== draggedId)
          onUpdateGroup(group.id, { children: updatedChildren })
        }
      })

      // Add to target group if not already there
      if (!targetGroup.children.includes(draggedId)) {
        onUpdateGroup(targetGroupId, {
          children: [...targetGroup.children, draggedId],
        })
      }
    }
  }

  return (
    <div className="stage-hierarchy">
      <div className="hierarchy-tree">
        <Tree
          value={treeData}
          selectionMode="single"
          selectionKeys={currentSelectedKeys}
          onSelectionChange={handleSelectionChange}
          dragdropScope="stage-hierarchy"
          onDragDrop={handleDragDrop}
          className="hierarchy-tree-component"
        />
      </div>

      {selectedObjectId && (
        <div className="hierarchy-actions">
          <Button
            icon="pi pi-trash"
            label="Delete"
            className="p-button-danger p-button-sm"
            onClick={() => {
              onDeleteObject(selectedObjectId)
              setSelectedKeys({})
            }}
          />
        </div>
      )}
    </div>
  )
}

export default StageHierarchy
