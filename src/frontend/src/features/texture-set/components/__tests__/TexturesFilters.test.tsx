import { fireEvent, render, screen } from '@testing-library/react'

import { TexturesFilters } from '@/features/texture-set/components/TexturesFilters'

const noop = () => {}

function renderFilters(overrides = {}) {
  const props = {
    isSearchOpen: false,
    onSearchToggle: noop,
    isFiltersOpen: true,
    onFiltersToggle: noop,
    searchQuery: '',
    onSearchChange: noop,
    packs: [],
    projects: [],
    categories: [],
    selectedPackIds: [],
    selectedProjectIds: [],
    selectedCategoryKeys: {},
    selectedTextureTypes: [],
    minResolution: null,
    availableTags: [],
    selectedTagNames: [],
    onPackFilterChange: noop,
    onProjectFilterChange: noop,
    onCategoryChange: noop,
    onManageCategoriesClick: noop,
    onTextureTypesChange: noop,
    onMinResolutionChange: jest.fn(),
    onTagChange: noop,
    cardWidth: 200,
    onCardWidthChange: noop,
    count: 0,
    unitLabel: 'texture set',
    selectedCount: 0,
    visibleCount: 0,
    onUploadClick: noop,
    onCreateClick: noop,
    onRefreshClick: noop,
    onBulkActionsClick: noop,
    onSelectAllClick: noop,
    onDeselectAllClick: noop,
    ...overrides,
  }
  render(<TexturesFilters {...props} />)
  return props
}

describe('TexturesFilters — resolution filter', () => {
  it('renders the min-resolution dropdown', () => {
    renderFilters()
    expect(screen.getByTestId('texture-resolution-filter')).toBeInTheDocument()
  })

  it('calls onMinResolutionChange when a bucket is picked', () => {
    const props = renderFilters()
    // Open the PrimeReact dropdown and choose "2K+".
    fireEvent.click(screen.getByTestId('texture-resolution-filter'))
    fireEvent.click(screen.getByText('2K+'))
    expect(props.onMinResolutionChange).toHaveBeenCalledWith(2048)
  })

  it('counts an active resolution filter toward the clear button', () => {
    renderFilters({ minResolution: 2048 })
    expect(
      screen.getByRole('button', { name: /clear all filters/i })
    ).toBeInTheDocument()
  })
})
