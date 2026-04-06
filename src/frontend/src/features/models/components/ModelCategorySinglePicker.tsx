import { Button } from 'primereact/button'
import { OverlayPanel } from 'primereact/overlaypanel'
import { Tree } from 'primereact/tree'
import { useMemo, useRef, useState } from 'react'

import {
  buildExpandedKeys,
  buildModelCategoryTree,
  filterModelCategoryTree,
  findModelCategoryById,
} from '@/features/models/utils/categoryTree'
import { type ModelCategoryDto } from '@/types'

interface ModelCategorySinglePickerProps {
  categories: ModelCategoryDto[]
  selectedCategoryId?: number | null
  placeholder?: string
  onChange: (categoryId: number | null) => void
}

export function ModelCategorySinglePicker({
  categories,
  selectedCategoryId = null,
  placeholder = 'Uncategorized',
  onChange,
}: ModelCategorySinglePickerProps) {
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
  const selectedCategory = useMemo(
    () => findModelCategoryById(categories, selectedCategoryId),
    [categories, selectedCategoryId]
  )
  const selectionKeys = selectedCategoryId
    ? { [String(selectedCategoryId)]: true }
    : {}

  const getSelectedTreeId = (
    value: string | Record<string, boolean> | null | undefined
  ): number | null => {
    if (!value) {
      return null
    }

    const key = typeof value === 'string' ? value : Object.keys(value)[0]
    return key ? Number(key) : null
  }

  return (
    <>
      <Button
        type="button"
        label={selectedCategory?.path ?? placeholder}
        icon="pi pi-sitemap"
        className={`p-button-outlined model-category-single-trigger${selectedCategory ? ' has-value' : ''}`}
        onClick={event => overlayRef.current?.toggle(event)}
        aria-haspopup="dialog"
        aria-label="Select model category"
      />

      <OverlayPanel
        ref={overlayRef}
        dismissable
        className="model-category-filter-overlay model-category-single-overlay"
      >
        <div className="model-category-filter-popover">
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
              className="model-category-tree model-category-filter-tree"
            />
          ) : (
            <div className="model-category-empty-state">
              No categories match your search.
            </div>
          )}

          <div className="model-category-single-actions">
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
