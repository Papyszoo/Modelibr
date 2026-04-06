import '@/shared/components/FilterPanel.css'

import { Button } from 'primereact/button'
import { InputSwitch } from 'primereact/inputswitch'
import { MultiSelect } from 'primereact/multiselect'
import { TreeSelect } from 'primereact/treeselect'
import { type MouseEvent as ReactMouseEvent, useEffect, useState } from 'react'

import { ModelCategoryManagerDialog } from '@/features/models/components/ModelCategoryManagerDialog'
import { buildModelCategoryTree } from '@/features/models/utils/categoryTree'
import { type ModelCategoryDto, type PackDto, type ProjectDto } from '@/types'

import { CardWidthButton } from './CardWidthButton'

interface ModelsFiltersProps {
  searchQuery: string
  onSearchChange: (query: string) => void
  packs: PackDto[]
  projects: ProjectDto[]
  categories: ModelCategoryDto[]
  selectedPackIds: number[]
  selectedProjectIds: number[]
  selectedCategoryId: number | null
  hasConceptImages: boolean
  onPackFilterChange: (packIds: number[]) => void
  onProjectFilterChange: (projectIds: number[]) => void
  onCategoryChange: (categoryId: number | null) => void
  onHasConceptImagesChange: (value: boolean) => void
  packFilterDisabled?: boolean
  projectFilterDisabled?: boolean
  cardWidth: number
  onCardWidthChange: (width: number) => void
  modelCount: number
  selectedModelCount: number
  onUploadClick: () => void
  onRefreshClick: () => void
  onBulkActionsClick: (event: ReactMouseEvent<HTMLElement>) => void
}

export function ModelsFilters({
  searchQuery,
  onSearchChange,
  packs,
  projects,
  categories,
  selectedPackIds,
  selectedProjectIds,
  selectedCategoryId,
  hasConceptImages,
  onPackFilterChange,
  onProjectFilterChange,
  onCategoryChange,
  onHasConceptImagesChange,
  packFilterDisabled = false,
  projectFilterDisabled = false,
  cardWidth,
  onCardWidthChange,
  modelCount,
  selectedModelCount,
  onUploadClick,
  onRefreshClick,
  onBulkActionsClick,
}: ModelsFiltersProps) {
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [isFiltersOpen, setIsFiltersOpen] = useState(false)
  const [showCategoryManager, setShowCategoryManager] = useState(false)

  const packOptions = packs.map(pack => ({
    label: pack.name,
    value: pack.id,
  }))

  const projectOptions = projects.map(project => ({
    label: project.name,
    value: project.id,
  }))

  const categoryTreeNodes = buildModelCategoryTree(categories)
  const hasActiveSearch = searchQuery.trim().length > 0
  const hasActiveFilters =
    selectedPackIds.length > 0 ||
    selectedProjectIds.length > 0 ||
    selectedCategoryId !== null ||
    hasConceptImages

  const activeFilterCount = [
    selectedPackIds.length > 0,
    selectedProjectIds.length > 0,
    selectedCategoryId !== null,
    hasConceptImages,
  ].filter(Boolean).length

  const selectedCategoryKey =
    selectedCategoryId !== null ? String(selectedCategoryId) : null
  const selectedCountLabel = `${selectedModelCount} model${selectedModelCount === 1 ? '' : 's'}`

  useEffect(() => {
    if (hasActiveSearch) {
      setIsSearchOpen(true)
    }
  }, [hasActiveSearch])

  useEffect(() => {
    if (hasActiveFilters) {
      setIsFiltersOpen(true)
    }
  }, [hasActiveFilters])

  const countLabel = `${modelCount} model${modelCount === 1 ? '' : 's'}`

  return (
    <div className="model-grid-controls">
      <ModelCategoryManagerDialog
        visible={showCategoryManager}
        categories={categories}
        onHide={() => setShowCategoryManager(false)}
      />

      <div className="model-grid-toolbar">
        <div className="model-grid-toolbar-actions">
          <Button
            icon="pi pi-search"
            label="Search"
            className={`p-button-text p-button-sm model-grid-toolbar-button${isSearchOpen || hasActiveSearch ? ' is-active' : ''}`}
            onClick={() => setIsSearchOpen(current => !current)}
            aria-label="Search"
            aria-expanded={isSearchOpen}
            aria-controls="model-grid-search-panel"
          />
          <Button
            icon="pi pi-sliders-h"
            label="Filters"
            className={`p-button-text p-button-sm model-grid-toolbar-button${isFiltersOpen || hasActiveFilters ? ' is-active' : ''}`}
            onClick={() => setIsFiltersOpen(current => !current)}
            aria-label="Filters"
            aria-expanded={isFiltersOpen}
            aria-controls="model-grid-filters-panel"
            badge={
              activeFilterCount > 0 ? String(activeFilterCount) : undefined
            }
            badgeClassName="model-grid-toolbar-badge"
          />
          <CardWidthButton
            value={cardWidth}
            min={120}
            max={400}
            onChange={onCardWidthChange}
          />
          {selectedModelCount > 0 ? (
            <Button
              icon="pi pi-list-check"
              label="Bulk actions"
              className="p-button-text p-button-sm model-grid-toolbar-button is-active"
              onClick={onBulkActionsClick}
              aria-label={`Bulk actions for ${selectedCountLabel}`}
            />
          ) : null}
          <Button
            icon="pi pi-upload"
            label="Upload"
            className="p-button-text p-button-sm model-grid-toolbar-button"
            onClick={onUploadClick}
            tooltip="Upload models"
            tooltipOptions={{ position: 'bottom' }}
            aria-label="Upload models"
          />
          <Button
            icon="pi pi-refresh"
            label="Refresh"
            className="p-button-text p-button-sm model-grid-toolbar-button"
            onClick={onRefreshClick}
            tooltip="Refresh models"
            tooltipOptions={{ position: 'bottom' }}
            aria-label="Refresh models"
          />
        </div>

        <div className="model-grid-toolbar-count" aria-live="polite">
          <i className="pi pi-box" />
          <span>{countLabel}</span>
        </div>
      </div>

      <div
        id="model-grid-search-panel"
        className={`model-grid-toolbar-panel${isSearchOpen ? ' is-open' : ''}`}
      >
        <div className="model-grid-toolbar-panel-inner">
          <div className="list-filters-search model-grid-search-panel">
            <i className="pi pi-search" />
            <input
              type="text"
              placeholder="Search models..."
              value={searchQuery}
              onChange={e => onSearchChange(e.target.value)}
              className="list-filters-search-input"
            />
          </div>
        </div>
      </div>

      <div
        id="model-grid-filters-panel"
        className={`model-grid-toolbar-panel${isFiltersOpen ? ' is-open' : ''}`}
      >
        <div className="model-grid-toolbar-panel-inner">
          <div className="list-filters-row">
            {packs.length > 0 && (
              <MultiSelect
                value={selectedPackIds}
                options={packOptions}
                onChange={e => onPackFilterChange(e.value || [])}
                placeholder="Filter by Packs"
                className="list-filters-control"
                display="chip"
                showClear={!packFilterDisabled}
                filter
                filterPlaceholder="Search packs..."
                disabled={packFilterDisabled}
              />
            )}
            {projects.length > 0 && (
              <MultiSelect
                value={selectedProjectIds}
                options={projectOptions}
                onChange={e => onProjectFilterChange(e.value || [])}
                placeholder="Filter by Projects"
                className="list-filters-control"
                display="chip"
                showClear={!projectFilterDisabled}
                filter
                filterPlaceholder="Search projects..."
                disabled={projectFilterDisabled}
              />
            )}
            {categories.length > 0 && (
              <TreeSelect
                value={selectedCategoryKey}
                options={categoryTreeNodes}
                onChange={e => {
                  const value =
                    typeof e.value === 'string' || e.value === null
                      ? e.value
                      : String(e.value)
                  onCategoryChange(value ? Number(value) : null)
                }}
                placeholder="Category"
                className="list-filters-control list-filters-tree-select"
                showClear
                filter
                filterPlaceholder="Search categories..."
                selectionMode="single"
                panelHeaderTemplate={options => (
                  <div className={options.className}>
                    <div className="model-category-panel-header">
                      {options.filterElement}
                      <Button
                        icon="pi pi-cog"
                        text
                        rounded
                        aria-label="Manage model categories"
                        tooltip="Manage model categories"
                        tooltipOptions={{ position: 'left' }}
                        onClick={event => {
                          event.preventDefault()
                          event.stopPropagation()
                          options.onCloseClick()
                          setShowCategoryManager(true)
                        }}
                      />
                    </div>
                  </div>
                )}
              />
            )}
            <div className="list-filters-switch models-filter-switch">
              <InputSwitch
                checked={hasConceptImages}
                onChange={e => onHasConceptImagesChange(Boolean(e.value))}
              />
              <span>Concept art</span>
            </div>
            {hasActiveFilters ? (
              <Button
                icon="pi pi-times"
                className="p-button-text p-button-sm list-filters-clear"
                tooltip="Clear all filters"
                tooltipOptions={{ position: 'bottom' }}
                onClick={() => {
                  onPackFilterChange([])
                  onProjectFilterChange([])
                  onCategoryChange(null)
                  onHasConceptImagesChange(false)
                }}
              />
            ) : null}
          </div>

          {packs.length === 0 &&
          projects.length === 0 &&
          categories.length === 0 ? (
            <span className="list-filters-empty">
              No category, pack, or project filters yet.
            </span>
          ) : null}
        </div>
      </div>
    </div>
  )
}
