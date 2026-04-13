import './CategoryTreeControls.css'

import { Button } from 'primereact/button'
import { OverlayPanel } from 'primereact/overlaypanel'
import { Tree } from 'primereact/tree'
import { useMemo, useRef, useState } from 'react'

import { type HierarchicalCategory } from '@/shared/types/categories'
import {
  buildCategoryTree,
  buildExpandedKeys,
  filterCategoryTree,
  findCategoryById,
  getSelectedTreeId,
} from '@/shared/utils/categoryTree'

interface CategorySinglePickerProps<TCategory extends HierarchicalCategory> {
  categories: TCategory[]
  selectedCategoryId?: number | null
  placeholder?: string
  ariaLabel?: string
  onChange: (categoryId: number | null) => void
}

export function CategorySinglePicker<TCategory extends HierarchicalCategory>({
  categories,
  selectedCategoryId = null,
  placeholder = 'Uncategorized',
  ariaLabel = 'Select category',
  onChange,
}: CategorySinglePickerProps<TCategory>) {
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
  const selectedCategory = useMemo(
    () => findCategoryById(categories, selectedCategoryId),
    [categories, selectedCategoryId]
  )
  const selectionKeys = selectedCategoryId
    ? { [String(selectedCategoryId)]: true }
    : {}

  return (
    <>
      <button
        type="button"
        className={`category-trigger${selectedCategory ? ' has-value' : ''}`}
        onClick={event => overlayRef.current?.toggle(event)}
        aria-haspopup="dialog"
        aria-label={ariaLabel}
        title={selectedCategory?.path ?? placeholder}
      >
        <span className="category-trigger-label">
          {selectedCategory?.path ?? placeholder}
        </span>
        <i className="pi pi-chevron-down" aria-hidden="true" />
      </button>

      <OverlayPanel ref={overlayRef} dismissable>
        <div className="category-filter-popover">
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

          {filteredNodes.length > 0 ? (
            <Tree
              value={filteredNodes}
              selectionMode="single"
              selectionKeys={selectionKeys}
              expandedKeys={expandedKeys}
              onSelectionChange={event => {
                onChange(getSelectedTreeId(event.value))
                overlayRef.current?.hide()
              }}
              className="category-tree"
            />
          ) : (
            <div className="category-tree-empty-state">
              No categories match your search.
            </div>
          )}

          <div className="category-single-actions">
            <Button
              label="Clear"
              text
              disabled={selectedCategoryId === null}
              onClick={() => {
                onChange(null)
                overlayRef.current?.hide()
              }}
            />
          </div>
        </div>
      </OverlayPanel>
    </>
  )
}
