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
  disabled?: boolean
}

export function ModelCategoryFilterPicker({
  categories,
  selectedKeys,
  onChange,
  onManageClick,
  disabled = false,
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
  const selectedNames = useMemo(
    () =>
      categories
        .filter(category => selectedKeys[String(category.id)]?.checked)
        .map(category => category.name)
        .sort((left, right) => left.localeCompare(right)),
    [categories, selectedKeys]
  )
  const selectedCount = selectedNames.length
  const buttonLabel =
    selectedCount === 0
      ? 'Categories'
      : selectedCount <= 2
        ? selectedNames.join(', ')
        : `${selectedNames.slice(0, 2).join(', ')} +${selectedCount - 2}`

  return (
    <>
      <button
        type="button"
        className={`list-filters-control model-category-trigger model-category-filter-trigger${selectedCount > 0 ? ' has-value' : ''}`}
        onClick={event => overlayRef.current?.toggle(event)}
        aria-haspopup="dialog"
        aria-label="Filter by categories"
        title={selectedCount > 0 ? selectedNames.join(', ') : 'Categories'}
        disabled={disabled}
      >
        <span className="model-category-trigger-label">{buttonLabel}</span>
        <i className="pi pi-chevron-down" aria-hidden="true" />
      </button>

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
