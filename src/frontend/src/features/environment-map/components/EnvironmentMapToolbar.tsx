import '@/shared/components/FilterPanel.css'

import { Button } from 'primereact/button'
import { InputSwitch } from 'primereact/inputswitch'
import { MultiSelect } from 'primereact/multiselect'

import { CategoryFilterPicker } from '@/shared/components/categories/CategoryFilterPicker'
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

  const showFilteredCount = visibleCount !== totalCount

  return (
    <ListToolbar>
      <ListToolbarRow>
        <ListToolbarActions>
          <ListToolbarButton
            icon="pi pi-search"
            label="Search"
            active={isSearchOpen || hasActiveSearch}
            onClick={() => onSearchToggle(!isSearchOpen)}
            ariaLabel="Search"
            ariaExpanded={isSearchOpen}
            ariaControls="environment-map-search-panel"
          />
          <ListToolbarButton
            icon="pi pi-sliders-h"
            label="Filters"
            active={isFiltersOpen || hasActiveFilters}
            onClick={() => onFiltersToggle(!isFiltersOpen)}
            ariaLabel="Filters"
            ariaExpanded={isFiltersOpen}
            ariaControls="environment-map-filters-panel"
            badge={activeFilterCount}
          />
          <OptionsButton
            cardWidth={cardWidth}
            minCardWidth={220}
            maxCardWidth={520}
            onCardWidthChange={onCardWidthChange}
            showThumbnailAnimation={false}
          />
          <ListToolbarButton
            icon="pi pi-check-square"
            label="Select all"
            onClick={onSelectAllClick}
            disabled={visibleCount === 0}
          />
          <ListToolbarButton
            icon="pi pi-upload"
            label="Upload"
            onClick={onUploadClick}
            tooltip="Upload environment maps"
            ariaLabel="Upload"
          />
          <ListToolbarButton
            icon="pi pi-refresh"
            label="Refresh"
            onClick={onRefreshClick}
            tooltip="Refresh list"
            ariaLabel="Refresh"
          />
        </ListToolbarActions>

        <ListToolbarCount
          icon="pi pi-globe"
          count={showFilteredCount ? visibleCount : totalCount}
          unitLabel="map"
        />
      </ListToolbarRow>

      {selectedCount > 0 ? (
        <ListToolbarSelectionBar>
          <ListToolbarSelectionSummary>
            {selectedCount} environment map{selectedCount === 1 ? '' : 's'}{' '}
            selected.
          </ListToolbarSelectionSummary>
          <ListToolbarSelectionActions>
            <ListToolbarButton
              icon="pi pi-ellipsis-h"
              label="Bulk actions"
              active
              onClick={onBulkActionsClick}
              ariaLabel="Bulk actions"
            />
            <ListToolbarButton
              icon="pi pi-times"
              label="Clear"
              onClick={onDeselectAllClick}
            />
          </ListToolbarSelectionActions>
        </ListToolbarSelectionBar>
      ) : null}

      <ListToolbarPanel id="environment-map-search-panel" open={isSearchOpen}>
        <ListToolbarSearchInput
          value={searchQuery}
          onChange={onSearchChange}
          placeholder="Search environment maps..."
        />
      </ListToolbarPanel>

      <ListToolbarPanel id="environment-map-filters-panel" open={isFiltersOpen}>
        <div className="list-filters-row">
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
              tooltip="Clear all filters"
              tooltipOptions={{ position: 'bottom' }}
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
      </ListToolbarPanel>
    </ListToolbar>
  )
}
