import { MultiSelect } from 'primereact/multiselect'
import { Button } from 'primereact/button'
import { PackDto, ProjectDto } from '@/types'
import CardWidthButton from './CardWidthButton'

interface ModelsFiltersProps {
  searchQuery: string
  onSearchChange: (query: string) => void
  packs: PackDto[]
  projects: ProjectDto[]
  selectedPackIds: number[]
  selectedProjectIds: number[]
  onPackFilterChange: (packIds: number[]) => void
  onProjectFilterChange: (projectIds: number[]) => void
  packFilterDisabled?: boolean
  projectFilterDisabled?: boolean
  cardWidth: number
  onCardWidthChange: (width: number) => void
}

export default function ModelsFilters({
  searchQuery,
  onSearchChange,
  packs,
  projects,
  selectedPackIds,
  selectedProjectIds,
  onPackFilterChange,
  onProjectFilterChange,
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

  const hasFilters = packs.length > 0 || projects.length > 0
  const hasActiveFilters =
    selectedPackIds.length > 0 || selectedProjectIds.length > 0

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
