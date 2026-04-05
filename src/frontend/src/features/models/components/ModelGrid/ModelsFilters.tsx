import { Button } from 'primereact/button'
import { Dropdown } from 'primereact/dropdown'
import { InputSwitch } from 'primereact/inputswitch'
import { MultiSelect } from 'primereact/multiselect'

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
}: ModelsFiltersProps) {
  const packOptions = packs.map(pack => ({
    label: pack.name,
    value: pack.id,
  }))

  const projectOptions = projects.map(project => ({
    label: project.name,
    value: project.id,
  }))

  const categoryOptions = categories.map(category => ({
    label: category.path,
    value: category.id,
  }))

  const hasFilters =
    packs.length > 0 || projects.length > 0 || categories.length > 0
  const hasActiveFilters =
    selectedPackIds.length > 0 ||
    selectedProjectIds.length > 0 ||
    selectedCategoryId !== null ||
    hasConceptImages

  return (
    <div className="model-grid-controls">
      <div className="search-bar">
        <i className="pi pi-search" />
        <input
          type="text"
          placeholder="Search models..."
          value={searchQuery}
          onChange={e => onSearchChange(e.target.value)}
          className="search-input"
        />
      </div>
      <div className="filter-bar">
        {hasFilters ? (
          <>
            {packs.length > 0 && (
              <MultiSelect
                value={selectedPackIds}
                options={packOptions}
                onChange={e => onPackFilterChange(e.value || [])}
                placeholder="Filter by Packs"
                className="filter-multiselect"
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
                className="filter-multiselect"
                display="chip"
                showClear={!projectFilterDisabled}
                filter
                filterPlaceholder="Search projects..."
                disabled={projectFilterDisabled}
              />
            )}
            {categories.length > 0 && (
              <Dropdown
                value={selectedCategoryId}
                options={categoryOptions}
                onChange={e => onCategoryChange(e.value ?? null)}
                placeholder="Category"
                className="filter-multiselect"
                showClear
                filter
                filterPlaceholder="Search categories..."
              />
            )}
            <div className="models-filter-switch">
              <InputSwitch
                checked={hasConceptImages}
                onChange={e => onHasConceptImagesChange(Boolean(e.value))}
              />
              <span>Concept art</span>
            </div>
            {hasActiveFilters &&
              !packFilterDisabled &&
              !projectFilterDisabled && (
                <Button
                  icon="pi pi-times"
                  className="p-button-text p-button-sm clear-filters-btn"
                  tooltip="Clear all filters"
                  tooltipOptions={{ position: 'bottom' }}
                  onClick={() => {
                    onPackFilterChange([])
                    onProjectFilterChange([])
                    onCategoryChange(null)
                    onHasConceptImagesChange(false)
                  }}
                />
              )}
          </>
        ) : (
          <span className="filter-placeholder">
            No packs or projects to filter by
          </span>
        )}
        <CardWidthButton
          value={cardWidth}
          min={120}
          max={400}
          onChange={onCardWidthChange}
        />
      </div>
    </div>
  )
}
