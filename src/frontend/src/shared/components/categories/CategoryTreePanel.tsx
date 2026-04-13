import './CategoryTreeControls.css'

import { Tree } from 'primereact/tree'
import { useMemo } from 'react'

import { type HierarchicalCategory } from '@/shared/types/categories'
import {
  buildCategoryTree,
  buildExpandedKeys,
  getSelectedTreeId,
} from '@/shared/utils/categoryTree'

interface CategoryTreePanelProps<TCategory extends HierarchicalCategory> {
  categories: TCategory[]
  activeCategoryId: number | null
  dragOverCategoryId: number | null
  categoryCounts: Map<number, number>
  unassignedCount: number
  onCategoryChange: (categoryId: number) => void
  onCategoryDragOver: (
    event: React.DragEvent<HTMLDivElement>,
    categoryId: number | null
  ) => void
  onCategoryDragLeave: (event: React.DragEvent<HTMLDivElement>) => void
  onCategoryDrop: (
    event: React.DragEvent<HTMLDivElement>,
    categoryId: number | null
  ) => void
  unassignedCategoryId: number
  unassignedLabel?: string
  compact?: boolean
}

export function CategoryTreePanel<TCategory extends HierarchicalCategory>({
  categories,
  activeCategoryId,
  dragOverCategoryId,
  categoryCounts,
  unassignedCount,
  onCategoryChange,
  onCategoryDragOver,
  onCategoryDragLeave,
  onCategoryDrop,
  unassignedCategoryId,
  unassignedLabel = 'Unassigned',
  compact = false,
}: CategoryTreePanelProps<TCategory>) {
  const categoryNodes = useMemo(
    () => buildCategoryTree(categories),
    [categories]
  )
  const expandedKeys = useMemo(
    () => buildExpandedKeys(categoryNodes),
    [categoryNodes]
  )
  const selectedTreeKeys =
    activeCategoryId !== null && activeCategoryId !== unassignedCategoryId
      ? { [String(activeCategoryId)]: true }
      : {}

  return (
    <div className={`category-tree-panel${compact ? ' is-compact' : ''}`}>
      <div
        className={`category-tree-unassigned${activeCategoryId === unassignedCategoryId ? ' is-active' : ''}${dragOverCategoryId === unassignedCategoryId ? ' is-drag-over' : ''}`}
        onClick={() => onCategoryChange(unassignedCategoryId)}
        onDragOver={event => onCategoryDragOver(event, unassignedCategoryId)}
        onDragLeave={onCategoryDragLeave}
        onDrop={event => onCategoryDrop(event, unassignedCategoryId)}
      >
        <span className="category-tree-unassigned-label">
          {unassignedLabel}
        </span>
        <span className="category-tree-count">({unassignedCount})</span>
      </div>

      {categoryNodes.length > 0 ? (
        <Tree
          value={categoryNodes}
          selectionMode="single"
          selectionKeys={selectedTreeKeys}
          expandedKeys={expandedKeys}
          onSelectionChange={event => {
            const categoryId = getSelectedTreeId(event.value)
            if (categoryId !== null) {
              onCategoryChange(categoryId)
            }
          }}
          nodeTemplate={node => {
            const category = node.data as TCategory
            const isDragOver = dragOverCategoryId === category.id

            return (
              <div
                className={`category-tree-node-content${isDragOver ? ' is-drag-over' : ''}`}
                onDragOver={event => onCategoryDragOver(event, category.id)}
                onDragLeave={onCategoryDragLeave}
                onDrop={event => onCategoryDrop(event, category.id)}
                title={category.path}
              >
                <span className="category-tree-node-label">
                  {category.name}
                </span>
                <span className="category-tree-count">
                  ({categoryCounts.get(category.id) ?? 0})
                </span>
              </div>
            )
          }}
          className="category-tree"
        />
      ) : (
        <div className="category-tree-empty-state">No categories yet.</div>
      )}
    </div>
  )
}
