import '@/shared/components/FilterPanel.css'

import { Button } from 'primereact/button'
import { Dropdown } from 'primereact/dropdown'
import { MultiSelect } from 'primereact/multiselect'
import { type MouseEvent as ReactMouseEvent } from 'react'

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
import {
  type PackDto,
  type ProjectDto,
  type TextureSetCategoryDto,
  TextureType,
} from '@/types'

// Texture types exposed in the filter. SplitChannel is an implementation
// detail (a single source file fanned out across channels) — hiding it
// keeps the picker focused on user-meaningful map types.
// Minimum-resolution buckets keyed off a texture's largest side. "1K" means
// "at least 1024px on the longest side", matching how artists shop for maps.
const MIN_RESOLUTION_FILTER_OPTIONS: { label: string; value: number | null }[] =
  [
    { label: 'Any resolution', value: null },
    { label: '512+', value: 512 },
    { label: '1K+', value: 1024 },
    { label: '2K+', value: 2048 },
    { label: '4K+', value: 4096 },
  ]

const TEXTURE_TYPE_FILTER_OPTIONS: { label: string; value: number }[] = [
  { label: 'Albedo', value: TextureType.Albedo },
  { label: 'Normal', value: TextureType.Normal },
  { label: 'Height', value: TextureType.Height },
  { label: 'AO', value: TextureType.AO },
  { label: 'Roughness', value: TextureType.Roughness },
  { label: 'Metallic', value: TextureType.Metallic },
  { label: 'Specular', value: TextureType.Specular },
  { label: 'Emissive', value: TextureType.Emissive },
  { label: 'Bump', value: TextureType.Bump },
  { label: 'Alpha', value: TextureType.Alpha },
  { label: 'Displacement', value: TextureType.Displacement },
  { label: 'Glossiness', value: TextureType.Glossiness },
]

interface TexturesFiltersProps {
  isSearchOpen: boolean
  onSearchToggle: (value: boolean) => void
  isFiltersOpen: boolean
  onFiltersToggle: (value: boolean) => void
  searchQuery: string
  onSearchChange: (query: string) => void
  packs: PackDto[]
  projects: ProjectDto[]
  categories: TextureSetCategoryDto[]
  selectedPackIds: number[]
  selectedProjectIds: number[]
  selectedCategoryKeys: CategorySelectionKeys
  selectedTextureTypes: number[]
  minResolution: number | null
  onPackFilterChange: (packIds: number[]) => void
  onProjectFilterChange: (projectIds: number[]) => void
  onCategoryChange: (keys: CategorySelectionKeys) => void
  onManageCategoriesClick: () => void
  onTextureTypesChange: (types: number[]) => void
  onMinResolutionChange: (value: number | null) => void
  cardWidth: number
  onCardWidthChange: (width: number) => void
  count: number
  unitLabel: string
  selectedCount: number
  visibleCount: number
  onUploadClick: () => void
  onCreateClick: () => void
  onRefreshClick: () => void
  onBulkActionsClick: (event: ReactMouseEvent<HTMLElement>) => void
  onSelectAllClick: () => void
  onDeselectAllClick: () => void
}

export function TexturesFilters({
  isSearchOpen,
  onSearchToggle,
  isFiltersOpen,
  onFiltersToggle,
  searchQuery,
  onSearchChange,
  packs,
  projects,
  categories,
  selectedPackIds,
  selectedProjectIds,
  selectedCategoryKeys,
  selectedTextureTypes,
  minResolution,
  onPackFilterChange,
  onProjectFilterChange,
  onCategoryChange,
  onManageCategoriesClick,
  onTextureTypesChange,
  onMinResolutionChange,
  cardWidth,
  onCardWidthChange,
  count,
  unitLabel,
  selectedCount,
  visibleCount,
  onUploadClick,
  onCreateClick,
  onRefreshClick,
  onBulkActionsClick,
  onSelectAllClick,
  onDeselectAllClick,
}: TexturesFiltersProps) {
  const packOptions = packs.map(pack => ({
    label: pack.name,
    value: pack.id,
  }))
  const projectOptions = projects.map(project => ({
    label: project.name,
    value: project.id,
  }))

  const hasActiveSearch = searchQuery.trim().length > 0
  const selectedCategoryCount = Object.values(selectedCategoryKeys).filter(
    state => state?.checked
  ).length
  const hasActiveFilters =
    selectedPackIds.length > 0 ||
    selectedProjectIds.length > 0 ||
    selectedCategoryCount > 0 ||
    selectedTextureTypes.length > 0 ||
    minResolution != null

  const activeFilterCount = [
    selectedPackIds.length > 0,
    selectedProjectIds.length > 0,
    selectedCategoryCount > 0,
    selectedTextureTypes.length > 0,
    minResolution != null,
  ].filter(Boolean).length

  const selectedCountLabel = `${selectedCount} ${unitLabel}${selectedCount === 1 ? '' : 's'}`

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
            ariaControls="texture-set-grid-search-panel"
          />
          <ListToolbarButton
            icon="pi pi-sliders-h"
            label="Filters"
            active={isFiltersOpen || hasActiveFilters}
            onClick={() => onFiltersToggle(!isFiltersOpen)}
            ariaLabel="Filters"
            ariaExpanded={isFiltersOpen}
            ariaControls="texture-set-grid-filters-panel"
            badge={activeFilterCount}
          />
          <OptionsButton
            cardWidth={cardWidth}
            minCardWidth={120}
            maxCardWidth={400}
            onCardWidthChange={onCardWidthChange}
            showThumbnailAnimation={false}
          />
          <ListToolbarButton
            icon="pi pi-upload"
            label="Upload"
            onClick={onUploadClick}
            tooltip="Upload textures"
            // Keep the descriptive aria-label: the texture-sets page object
            // (`tests/e2e/pages/TextureSetsPage.ts`) selects this button via
            // `button[aria-label="Upload textures"]`.
            ariaLabel="Upload textures"
          />
          <ListToolbarButton
            icon="pi pi-plus"
            label="Create Set"
            onClick={onCreateClick}
            tooltip="Create a new texture set"
            ariaLabel="Create Set"
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
          icon="pi pi-palette"
          count={count}
          unitLabel={unitLabel}
        />
      </ListToolbarRow>

      {selectedCount > 0 ? (
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
              disabled={visibleCount === 0 || selectedCount >= visibleCount}
            />
            <ListToolbarButton
              label="Deselect All"
              onClick={onDeselectAllClick}
            />
          </ListToolbarSelectionActions>
        </ListToolbarSelectionBar>
      ) : null}

      <ListToolbarPanel id="texture-set-grid-search-panel" open={isSearchOpen}>
        <ListToolbarSearchInput
          value={searchQuery}
          onChange={onSearchChange}
          placeholder="Search texture sets..."
        />
      </ListToolbarPanel>

      <ListToolbarPanel
        id="texture-set-grid-filters-panel"
        open={isFiltersOpen}
      >
        <div className="list-filters-row">
          {packs.length > 0 && (
            <MultiSelect
              value={selectedPackIds}
              options={packOptions}
              onChange={e => onPackFilterChange(e.value || [])}
              placeholder="Packs"
              className="list-filters-control"
              display="chip"
              showClear
              filter
              filterPlaceholder="Search packs..."
            />
          )}
          {projects.length > 0 && (
            <MultiSelect
              value={selectedProjectIds}
              options={projectOptions}
              onChange={e => onProjectFilterChange(e.value || [])}
              placeholder="Projects"
              data-testid="texture-set-project-filter"
              className="list-filters-control"
              display="chip"
              showClear
              filter
              filterPlaceholder="Search projects..."
            />
          )}
          {categories.length > 0 ? (
            <CategoryFilterPicker
              categories={categories}
              selectedKeys={selectedCategoryKeys}
              onChange={onCategoryChange}
              onManageClick={onManageCategoriesClick}
              label="Categories"
              ariaLabel="Filter by texture-set categories"
            />
          ) : (
            <Button
              icon="pi pi-sitemap"
              label="Manage categories"
              className="p-button-text p-button-sm list-filters-control"
              onClick={onManageCategoriesClick}
            />
          )}
          <MultiSelect
            value={selectedTextureTypes}
            options={TEXTURE_TYPE_FILTER_OPTIONS}
            onChange={e => onTextureTypesChange(e.value || [])}
            placeholder="Texture types"
            className="list-filters-control"
            display="chip"
            showClear
            filter
            filterPlaceholder="Search types..."
          />
          <Dropdown
            value={minResolution}
            options={MIN_RESOLUTION_FILTER_OPTIONS}
            onChange={e => onMinResolutionChange(e.value ?? null)}
            placeholder="Min resolution"
            className="list-filters-control"
            data-testid="texture-resolution-filter"
          />
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
                onTextureTypesChange([])
                onMinResolutionChange(null)
              }}
            />
          ) : null}
        </div>

        {packs.length === 0 &&
        projects.length === 0 &&
        categories.length === 0 ? (
          <span className="list-filters-empty">
            No pack, project, or category filters yet — texture-type filter is
            always available.
          </span>
        ) : null}
      </ListToolbarPanel>
    </ListToolbar>
  )
}
