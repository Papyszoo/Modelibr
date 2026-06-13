import '@/shared/components/FilterPanel.css'

import { Button } from 'primereact/button'
import { InputNumber } from 'primereact/inputnumber'
import { InputSwitch } from 'primereact/inputswitch'
import { MultiSelect } from 'primereact/multiselect'
import { type MouseEvent as ReactMouseEvent, useState } from 'react'

import { ModelCategoryManagerDialog } from '@/features/models/components/ModelCategoryManagerDialog'
import { ModelCategoryFilterPicker } from '@/features/models/components/ModelGrid/ModelCategoryFilterPicker'
import {
  ListToolbar,
  ListToolbarActions,
  ListToolbarButton,
  ListToolbarCount,
  ListToolbarPanel,
  ListToolbarRow,
  ListToolbarSearchInput,
  ListToolbarSelectionActions,
  ListToolbarSelectionBar,
  ListToolbarSelectionSummary,
  OptionsButton,
} from '@/shared/components/list-toolbar'
import { type CategorySelectionKeys as ModelCategorySelectionKeys } from '@/shared/types/categories'
import {
  type ModelCategoryDto,
  type ModelTagDto,
  type PackDto,
  type ProjectDto,
} from '@/types'

interface ModelsFiltersProps {
  isSearchOpen: boolean
  onSearchToggle: (value: boolean) => void
  isFiltersOpen: boolean
  onFiltersToggle: (value: boolean) => void
  searchQuery: string
  onSearchChange: (query: string) => void
  packs: PackDto[]
  projects: ProjectDto[]
  categories: ModelCategoryDto[]
  tags: ModelTagDto[]
  selectedPackIds: number[]
  selectedProjectIds: number[]
  selectedCategoryKeys: ModelCategorySelectionKeys
  selectedCategoryIds: number[]
  selectedTagNames: string[]
  hasConceptImages: boolean
  animatedOnly: boolean
  minTriangleCount: number | null
  maxTriangleCount: number | null
  onPackFilterChange: (packIds: number[]) => void
  onProjectFilterChange: (projectIds: number[]) => void
  onCategoryChange: (keys: ModelCategorySelectionKeys) => void
  onTagChange: (tags: string[]) => void
  onHasConceptImagesChange: (value: boolean) => void
  onAnimatedOnlyChange: (value: boolean) => void
  onMinTriangleCountChange: (value: number | null) => void
  onMaxTriangleCountChange: (value: number | null) => void
  packFilterDisabled?: boolean
  projectFilterDisabled?: boolean
  cardWidth: number
  onCardWidthChange: (width: number) => void
  modelCount: number
  selectedModelCount: number
  onUploadClick: () => void
  onRefreshClick: () => void
  onBulkActionsClick: (event: ReactMouseEvent<HTMLElement>) => void
  onSelectAllClick: () => void
  onDeselectAllClick: () => void
  visibleModelCount: number
}

export function ModelsFilters({
  isSearchOpen,
  onSearchToggle,
  isFiltersOpen,
  onFiltersToggle,
  searchQuery,
  onSearchChange,
  packs,
  projects,
  categories,
  tags,
  selectedPackIds,
  selectedProjectIds,
  selectedCategoryKeys,
  selectedCategoryIds,
  selectedTagNames,
  hasConceptImages,
  animatedOnly,
  minTriangleCount,
  maxTriangleCount,
  onPackFilterChange,
  onProjectFilterChange,
  onCategoryChange,
  onTagChange,
  onHasConceptImagesChange,
  onAnimatedOnlyChange,
  onMinTriangleCountChange,
  onMaxTriangleCountChange,
  packFilterDisabled = false,
  projectFilterDisabled = false,
  cardWidth,
  onCardWidthChange,
  modelCount,
  selectedModelCount,
  onUploadClick,
  onRefreshClick,
  onBulkActionsClick,
  onSelectAllClick,
  onDeselectAllClick,
  visibleModelCount,
}: ModelsFiltersProps) {
  const [showCategoryManager, setShowCategoryManager] = useState(false)

  const packOptions = packs.map(pack => ({
    label: pack.name,
    value: pack.id,
  }))

  const projectOptions = projects.map(project => ({
    label: project.name,
    value: project.id,
  }))
  const tagOptions = tags.map(tag => ({
    label: tag.name,
    value: tag.name,
  }))
  const hasActiveSearch = searchQuery.trim().length > 0
  const hasTriangleRange = minTriangleCount != null || maxTriangleCount != null
  const hasActiveFilters =
    selectedPackIds.length > 0 ||
    selectedProjectIds.length > 0 ||
    selectedCategoryIds.length > 0 ||
    selectedTagNames.length > 0 ||
    hasConceptImages ||
    animatedOnly ||
    hasTriangleRange

  const activeFilterCount = [
    selectedPackIds.length > 0,
    selectedProjectIds.length > 0,
    selectedCategoryIds.length > 0,
    selectedTagNames.length > 0,
    hasConceptImages,
    animatedOnly,
    hasTriangleRange,
  ].filter(Boolean).length
  const selectedCountLabel = `${selectedModelCount} model${selectedModelCount === 1 ? '' : 's'}`

  return (
    <ListToolbar>
      <ModelCategoryManagerDialog
        visible={showCategoryManager}
        categories={categories}
        onHide={() => setShowCategoryManager(false)}
      />

      <ListToolbarRow>
        <ListToolbarActions>
          <ListToolbarButton
            icon="pi pi-search"
            label="Search"
            active={isSearchOpen || hasActiveSearch}
            onClick={() => onSearchToggle(!isSearchOpen)}
            ariaLabel="Search"
            ariaExpanded={isSearchOpen}
            ariaControls="model-grid-search-panel"
          />
          <ListToolbarButton
            icon="pi pi-sliders-h"
            label="Filters"
            active={isFiltersOpen || hasActiveFilters}
            onClick={() => onFiltersToggle(!isFiltersOpen)}
            ariaLabel="Filters"
            ariaExpanded={isFiltersOpen}
            ariaControls="model-grid-filters-panel"
            badge={activeFilterCount}
          />
          <OptionsButton
            cardWidth={cardWidth}
            minCardWidth={120}
            maxCardWidth={400}
            onCardWidthChange={onCardWidthChange}
          />
          <ListToolbarButton
            icon="pi pi-upload"
            label="Upload"
            onClick={onUploadClick}
            tooltip="Upload models"
            // ModelListPage.ts (e2e) selects this button by accessible name
            // via `getByLabel("Upload models")`.
            ariaLabel="Upload models"
          />
          <ListToolbarButton
            icon="pi pi-refresh"
            label="Refresh"
            onClick={onRefreshClick}
            tooltip="Refresh models"
            ariaLabel="Refresh"
          />
        </ListToolbarActions>

        <ListToolbarCount count={modelCount} unitLabel="model" />
      </ListToolbarRow>

      {selectedModelCount > 0 ? (
        <ListToolbarSelectionBar>
          <ListToolbarSelectionSummary>
            {selectedCountLabel} selected.
          </ListToolbarSelectionSummary>
          <ListToolbarSelectionActions>
            <ListToolbarButton
              icon="pi pi-list-check"
              label="Bulk actions"
              active
              onClick={onBulkActionsClick}
              ariaLabel={`Bulk actions for ${selectedCountLabel}`}
            />
            <ListToolbarButton
              label="Select All"
              onClick={onSelectAllClick}
              disabled={
                visibleModelCount === 0 ||
                selectedModelCount >= visibleModelCount
              }
            />
            <ListToolbarButton
              label="Deselect All"
              onClick={onDeselectAllClick}
            />
          </ListToolbarSelectionActions>
        </ListToolbarSelectionBar>
      ) : null}

      <ListToolbarPanel id="model-grid-search-panel" open={isSearchOpen}>
        <ListToolbarSearchInput
          value={searchQuery}
          onChange={onSearchChange}
          placeholder="Search models..."
        />
      </ListToolbarPanel>

      <ListToolbarPanel id="model-grid-filters-panel" open={isFiltersOpen}>
        <div className="list-filters-row">
          {packs.length > 0 && (
            <MultiSelect
              value={selectedPackIds}
              options={packOptions}
              onChange={e => onPackFilterChange(e.value || [])}
              placeholder="Packs"
              className="list-filters-control"
              display="chip"
              showClear={!packFilterDisabled}
              filter
              filterPlaceholder="Search packs..."
              disabled={packFilterDisabled}
              data-testid="pack-filter"
            />
          )}
          {projects.length > 0 && (
            <MultiSelect
              value={selectedProjectIds}
              options={projectOptions}
              onChange={e => onProjectFilterChange(e.value || [])}
              placeholder="Projects"
              data-testid="project-filter"
              className="list-filters-control"
              display="chip"
              showClear={!projectFilterDisabled}
              filter
              filterPlaceholder="Search projects..."
              disabled={projectFilterDisabled}
            />
          )}
          {categories.length > 0 ? (
            <ModelCategoryFilterPicker
              categories={categories}
              selectedKeys={selectedCategoryKeys}
              onChange={onCategoryChange}
              onManageClick={() => setShowCategoryManager(true)}
            />
          ) : (
            <Button
              icon="pi pi-sitemap"
              label="Manage categories"
              className="p-button-text p-button-sm list-filters-control"
              onClick={() => setShowCategoryManager(true)}
            />
          )}
          {tags.length > 0 && (
            <MultiSelect
              value={selectedTagNames}
              options={tagOptions}
              onChange={event => onTagChange(event.value || [])}
              placeholder="Tags"
              className="list-filters-control"
              display="chip"
              showClear
              filter
              filterPlaceholder="Search tags..."
            />
          )}
          <div className="list-filters-switch models-filter-switch">
            <InputSwitch
              checked={hasConceptImages}
              onChange={e => onHasConceptImagesChange(Boolean(e.value))}
            />
            <span>Concept art</span>
          </div>
          <div className="list-filters-switch models-filter-switch">
            <InputSwitch
              checked={animatedOnly}
              onChange={e => onAnimatedOnlyChange(Boolean(e.value))}
              data-testid="animated-only-filter"
            />
            <span>Animated</span>
          </div>
          <div className="list-filters-switch models-filter-switch">
            <span>Triangles</span>
            <InputNumber
              value={minTriangleCount}
              onValueChange={e => onMinTriangleCountChange(e.value ?? null)}
              placeholder="Min"
              min={0}
              useGrouping
              inputClassName="models-filter-triangle-input"
              data-testid="min-triangle-filter"
            />
            <span>–</span>
            <InputNumber
              value={maxTriangleCount}
              onValueChange={e => onMaxTriangleCountChange(e.value ?? null)}
              placeholder="Max"
              min={0}
              useGrouping
              inputClassName="models-filter-triangle-input"
              data-testid="max-triangle-filter"
            />
          </div>
          {hasActiveFilters ? (
            <Button
              icon="pi pi-times"
              className="p-button-text p-button-sm list-filters-clear"
              aria-label="Clear all filters"
              tooltip="Clear all filters"
              tooltipOptions={{ position: 'bottom' }}
              onClick={() => {
                onPackFilterChange([])
                onProjectFilterChange([])
                onCategoryChange({})
                onTagChange([])
                onHasConceptImagesChange(false)
                onAnimatedOnlyChange(false)
                onMinTriangleCountChange(null)
                onMaxTriangleCountChange(null)
              }}
            />
          ) : null}
        </div>

        {packs.length === 0 &&
        projects.length === 0 &&
        categories.length === 0 &&
        tags.length === 0 ? (
          <span className="list-filters-empty">
            No category, tag, pack, or project filters yet.
          </span>
        ) : null}
      </ListToolbarPanel>
    </ListToolbar>
  )
}
