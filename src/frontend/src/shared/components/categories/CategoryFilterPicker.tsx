import './CategoryTreeControls.css'

import { Button } from 'primereact/button'
import { OverlayPanel } from 'primereact/overlaypanel'
import { Tree } from 'primereact/tree'
import { useMemo, useRef, useState } from 'react'

import {
  type CategorySelectionKeys,
  type HierarchicalCategory,
} from '@/shared/types/categories'
import {
  buildCategoryTree,
  buildExpandedKeys,
  filterCategoryTree,
} from '@/shared/utils/categoryTree'

interface CategoryFilterPickerProps<TCategory extends HierarchicalCategory> {
  categories: TCategory[]
  selectedKeys: CategorySelectionKeys
  onChange: (keys: CategorySelectionKeys) => void
  onManageClick?: () => void
  disabled?: boolean
  label?: string
  ariaLabel?: string
}

export function CategoryFilterPicker<TCategory extends HierarchicalCategory>({
  categories,
  selectedKeys,
  onChange,
  onManageClick,
  disabled = false,
  label = 'Categories',
  ariaLabel = 'Filter by categories',
}: CategoryFilterPickerProps<TCategory>) {
  const overlayRef = useRef<OverlayPanel | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  const categoryNodes = useMemo(
    () => buildCategoryTree(categories),
    [categories]
  )
  const filteredNodes = useMemo(
    () => filterCategoryTree(categoryNodes, searchQuery),
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
      ? label
      : selectedCount <= 2
        ? selectedNames.join(', ')
        : `${selectedNames.slice(0, 2).join(', ')} +${selectedCount - 2}`

  return (
    <>
      <button
        type="button"
        className={`list-filters-control category-trigger${selectedCount > 0 ? ' has-value' : ''}`}
        onClick={event => overlayRef.current?.toggle(event)}
        aria-haspopup="dialog"
        aria-label={ariaLabel}
        title={selectedCount > 0 ? selectedNames.join(', ') : label}
        disabled={disabled}
      >
        <span className="category-trigger-label">{buttonLabel}</span>
        <i className="pi pi-chevron-down" aria-hidden="true" />
      </button>

      <OverlayPanel ref={overlayRef} dismissable>
        <div className="category-filter-popover">
          <div className="category-filter-header">
            <div className="list-filters-search category-filter-search">
              <i className="pi pi-search" />
              <input
                type="text"
                placeholder="Search categories..."
                value={searchQuery}
                onChange={event => setSearchQuery(event.target.value)}
                className="list-filters-search-input"
              />
            </div>
            {onManageClick ? (
              <Button
                icon="pi pi-cog"
                text
                rounded
                aria-label={`Manage ${label.toLowerCase()}`}
                onClick={() => {
                  overlayRef.current?.hide()
                  onManageClick()
                }}
              />
            ) : null}
          </div>

          {filteredNodes.length > 0 ? (
            <Tree
              value={filteredNodes}
              selectionMode="checkbox"
              selectionKeys={selectedKeys}
              expandedKeys={expandedKeys}
              onSelectionChange={event =>
                onChange((event.value ?? {}) as CategorySelectionKeys)
              }
              className="category-tree"
            />
          ) : (
            <div className="category-tree-empty-state">
              No categories match your search.
            </div>
          )}
        </div>
      </OverlayPanel>
    </>
  )
}
