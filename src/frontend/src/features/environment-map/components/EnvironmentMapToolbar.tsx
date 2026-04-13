import '@/shared/components/FilterPanel.css'

import { Button } from 'primereact/button'
import { InputSwitch } from 'primereact/inputswitch'
import { MultiSelect } from 'primereact/multiselect'

import { CardWidthButton } from '@/features/models/components/ModelGrid/CardWidthButton'
import { CategoryFilterPicker } from '@/shared/components/categories/CategoryFilterPicker'
import { type CategorySelectionKeys } from '@/shared/types/categories'
import { type EnvironmentMapCategoryDto } from '@/types'

interface EnvironmentMapToolbarOption {
  label: string
  value: string | number
}

interface EnvironmentMapToolbarProps {
  isSearchOpen: boolean
  onSearchToggle: (value: boolean) => void
  isFiltersOpen: boolean
  onFiltersToggle: (value: boolean) => void
  searchQuery: string
  onSearchChange: (query: string) => void
  previewSizeOptions: EnvironmentMapToolbarOption[]
  packOptions: EnvironmentMapToolbarOption[]
  projectOptions: EnvironmentMapToolbarOption[]
  categories: EnvironmentMapCategoryDto[]
  selectedPreviewSizes: string[]
  selectedPackIds: number[]
  selectedProjectIds: number[]
  selectedCategoryKeys: CategorySelectionKeys
  onlyCustomThumbnail: boolean
  onPreviewSizesChange: (values: string[]) => void
  onPackIdsChange: (values: number[]) => void
  onProjectIdsChange: (values: number[]) => void
  onCategoryChange: (keys: CategorySelectionKeys) => void
  onManageCategoriesClick: () => void
  onOnlyCustomThumbnailChange: (value: boolean) => void
  cardWidth: number
  onCardWidthChange: (width: number) => void
  totalCount: number
  visibleCount: number
  selectedCount: number
  onUploadClick: () => void
  onRefreshClick: () => void
  onBulkActionsClick: (event: React.MouseEvent<HTMLElement>) => void
  onSelectAllClick: () => void
  onDeselectAllClick: () => void
}

export function EnvironmentMapToolbar({
  isSearchOpen,
  onSearchToggle,
  isFiltersOpen,
  onFiltersToggle,
  searchQuery,
  onSearchChange,
  onlyCustomThumbnail,
  onOnlyCustomThumbnailChange,
  cardWidth,
  onCardWidthChange,
  totalCount,
  visibleCount,
  selectedCount,
  onUploadClick,
  onRefreshClick,
  onBulkActionsClick,
  onSelectAllClick,
  onDeselectAllClick,
  previewSizeOptions,
  packOptions,
  projectOptions,
  categories,
  selectedPreviewSizes,
  selectedPackIds,
  selectedProjectIds,
  selectedCategoryKeys,
  onPreviewSizesChange,
  onPackIdsChange,
  onProjectIdsChange,
  onCategoryChange,
  onManageCategoriesClick,
}: EnvironmentMapToolbarProps) {
  const hasActiveSearch = searchQuery.trim().length > 0
  const hasActiveFilters =
    selectedPreviewSizes.length > 0 ||
    selectedPackIds.length > 0 ||
    selectedProjectIds.length > 0 ||
    Object.values(selectedCategoryKeys).some(state => state?.checked) ||
    onlyCustomThumbnail

  const activeFilterCount = [
    selectedPreviewSizes.length > 0,
    selectedPackIds.length > 0,
    selectedProjectIds.length > 0,
    Object.values(selectedCategoryKeys).some(state => state?.checked),
    onlyCustomThumbnail,
  ].filter(Boolean).length

  const countLabel =
    visibleCount === totalCount
      ? `${totalCount} map${totalCount === 1 ? '' : 's'}`
      : `${visibleCount}/${totalCount} maps`

  return (
    <div className="environment-map-controls">
      <div className="environment-map-toolbar">
        <div className="environment-map-toolbar-actions">
          <Button
            icon="pi pi-search"
            label="Search"
            className={`p-button-text p-button-sm environment-map-toolbar-button${isSearchOpen || hasActiveSearch ? ' is-active' : ''}`}
            onClick={() => onSearchToggle(!isSearchOpen)}
            aria-expanded={isSearchOpen}
            aria-controls="environment-map-search-panel"
          />
          <Button
            icon="pi pi-sliders-h"
            label="Filters"
            className={`p-button-text p-button-sm environment-map-toolbar-button${isFiltersOpen || hasActiveFilters ? ' is-active' : ''}`}
            onClick={() => onFiltersToggle(!isFiltersOpen)}
            aria-expanded={isFiltersOpen}
            aria-controls="environment-map-filters-panel"
            badge={
              activeFilterCount > 0 ? String(activeFilterCount) : undefined
            }
            badgeClassName="environment-map-toolbar-badge"
          />
          <CardWidthButton
            value={cardWidth}
            min={220}
            max={520}
            onChange={onCardWidthChange}
          />
          <Button
            icon="pi pi-check-square"
            label="Select all"
            className="p-button-text p-button-sm environment-map-toolbar-button"
            onClick={onSelectAllClick}
            disabled={visibleCount === 0}
          />
          <Button
            icon="pi pi-upload"
            label="Upload"
            className="p-button-text p-button-sm environment-map-toolbar-button"
            onClick={onUploadClick}
          />
          <Button
            icon="pi pi-refresh"
            label="Refresh"
            className="p-button-text p-button-sm environment-map-toolbar-button"
            onClick={onRefreshClick}
          />
        </div>

        <div className="environment-map-toolbar-count" aria-live="polite">
          <i className="pi pi-globe" />
          <span>{countLabel}</span>
        </div>
      </div>

      {selectedCount > 0 ? (
        <div className="environment-map-selection-toolbar">
          <span className="environment-map-selection-summary">
            {selectedCount} environment map{selectedCount === 1 ? '' : 's'}{' '}
            selected
          </span>

          <div className="environment-map-selection-actions">
            <Button
              icon="pi pi-times"
              label="Clear"
              className="p-button-text p-button-sm environment-map-toolbar-button"
              onClick={onDeselectAllClick}
            />
            <Button
              icon="pi pi-ellipsis-h"
              label="Bulk actions"
              className="p-button-text p-button-sm environment-map-toolbar-button"
              onClick={onBulkActionsClick}
            />
          </div>
        </div>
      ) : null}

      <div
        id="environment-map-search-panel"
        className={`environment-map-toolbar-panel${isSearchOpen ? ' is-open' : ''}`}
      >
        <div className="environment-map-toolbar-panel-inner">
          <div className="list-filters-search environment-map-search-panel">
            <i className="pi pi-search" />
            <input
              type="text"
              placeholder="Search environment maps..."
              value={searchQuery}
              onChange={event => onSearchChange(event.target.value)}
              className="list-filters-search-input"
            />
          </div>
        </div>
      </div>

      <div
        id="environment-map-filters-panel"
        className={`environment-map-toolbar-panel${isFiltersOpen ? ' is-open' : ''}`}
      >
        <div className="environment-map-toolbar-panel-inner">
          <div className="list-filters-row environment-map-filters-row">
            {previewSizeOptions.length > 0 ? (
              <MultiSelect
                value={selectedPreviewSizes}
                options={previewSizeOptions}
                onChange={event =>
                  onPreviewSizesChange((event.value ?? []) as string[])
                }
                placeholder="Preview Size"
                className="list-filters-control"
                display="chip"
                showClear
              />
            ) : null}
            {packOptions.length > 0 ? (
              <MultiSelect
                value={selectedPackIds}
                options={packOptions}
                onChange={event =>
                  onPackIdsChange((event.value ?? []) as number[])
                }
                placeholder="Packs"
                className="list-filters-control"
                display="chip"
                showClear
                filter
                filterPlaceholder="Search packs..."
              />
            ) : null}
            {projectOptions.length > 0 ? (
              <MultiSelect
                value={selectedProjectIds}
                options={projectOptions}
                onChange={event =>
                  onProjectIdsChange((event.value ?? []) as number[])
                }
                placeholder="Projects"
                className="list-filters-control"
                display="chip"
                showClear
                filter
                filterPlaceholder="Search projects..."
              />
            ) : null}
            {categories.length > 0 ? (
              <CategoryFilterPicker
                categories={categories}
                selectedKeys={selectedCategoryKeys}
                onChange={onCategoryChange}
                onManageClick={onManageCategoriesClick}
                ariaLabel="Filter by environment map categories"
              />
            ) : (
              <Button
                icon="pi pi-sitemap"
                label="Manage Categories"
                className="p-button-text p-button-sm list-filters-control"
                onClick={onManageCategoriesClick}
              />
            )}
            <div className="list-filters-switch">
              <InputSwitch
                checked={onlyCustomThumbnail}
                onChange={event =>
                  onOnlyCustomThumbnailChange(Boolean(event.value))
                }
              />
              <span>Custom thumbnail</span>
            </div>
            {hasActiveFilters ? (
              <Button
                icon="pi pi-times"
                className="p-button-text p-button-sm list-filters-clear"
                onClick={() => {
                  onPreviewSizesChange([])
                  onPackIdsChange([])
                  onProjectIdsChange([])
                  onCategoryChange({})
                  onOnlyCustomThumbnailChange(false)
                }}
              />
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}
