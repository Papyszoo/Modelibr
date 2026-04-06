import { Button } from 'primereact/button'
import { OverlayPanel } from 'primereact/overlaypanel'
import { Tree } from 'primereact/tree'
import { useMemo, useRef, useState } from 'react'

import {
  buildExpandedKeys,
  buildModelCategoryTree,
  filterModelCategoryTree,
} from '@/features/models/utils/categoryTree'
import { type ModelCategoryDto } from '@/types'

import { type ModelCategorySelectionKeys } from './useModelFilters'

interface ModelCategoryFilterPickerProps {
  categories: ModelCategoryDto[]
  selectedKeys: ModelCategorySelectionKeys
  onChange: (keys: ModelCategorySelectionKeys) => void
  onManageClick: () => void
}

export function ModelCategoryFilterPicker({
  categories,
  selectedKeys,
  onChange,
  onManageClick,
}: ModelCategoryFilterPickerProps) {
  const overlayRef = useRef<OverlayPanel | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  const categoryNodes = useMemo(
    () => buildModelCategoryTree(categories),
    [categories]
  )
  const filteredNodes = useMemo(
    () => filterModelCategoryTree(categoryNodes, searchQuery),
    [categoryNodes, searchQuery]
  )
  const expandedKeys = useMemo(
    () => buildExpandedKeys(filteredNodes),
    [filteredNodes]
  )
  const selectedCount = Object.values(selectedKeys).filter(
    state => state?.checked
  ).length
  const buttonLabel =
    selectedCount > 0 ? `Categories (${selectedCount})` : 'Categories'

  return (
    <>
      <Button
        type="button"
        label={buttonLabel}
        icon="pi pi-sitemap"
        className={`p-button-outlined list-filters-control model-category-filter-trigger${selectedCount > 0 ? ' has-value' : ''}`}
        onClick={event => overlayRef.current?.toggle(event)}
        aria-haspopup="dialog"
        aria-label="Filter by categories"
      />

      <OverlayPanel
        ref={overlayRef}
        dismissable
        className="model-category-filter-overlay"
      >
        <div className="model-category-filter-popover">
          <div className="model-category-filter-header">
            <div className="list-filters-search model-category-filter-search">
              <i className="pi pi-search" />
              <input
                type="text"
                placeholder="Search categories..."
                value={searchQuery}
                onChange={event => setSearchQuery(event.target.value)}
                className="list-filters-search-input"
              />
            </div>
            <Button
              icon="pi pi-cog"
              text
              rounded
              aria-label="Manage model categories"
              onClick={() => {
                overlayRef.current?.hide()
                onManageClick()
              }}
            />
          </div>

          {filteredNodes.length > 0 ? (
            <Tree
              value={filteredNodes}
              selectionMode="checkbox"
              selectionKeys={selectedKeys}
              expandedKeys={expandedKeys}
              onSelectionChange={event =>
                onChange((event.value ?? {}) as ModelCategorySelectionKeys)
              }
              className="model-category-tree model-category-filter-tree"
            />
          ) : (
            <div className="model-category-empty-state">
              No categories match your search.
            </div>
          )}
        </div>
      </OverlayPanel>
    </>
  )
}
