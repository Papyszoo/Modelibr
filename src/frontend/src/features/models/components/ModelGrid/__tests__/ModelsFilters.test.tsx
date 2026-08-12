import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'

import { ModelsFilters } from '@/features/models/components/ModelGrid/ModelsFilters'

const noop = () => {}

function withQueryClient(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return <QueryClientProvider client={client}>{ui}</QueryClientProvider>
}

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
    tags: [],
    selectedPackIds: [],
    selectedProjectIds: [],
    selectedTagNames: [],
    hasConceptImages: false,
    animatedOnly: false,
    minTriangleCount: null,
    maxTriangleCount: null,
    onPackFilterChange: noop,
    onProjectFilterChange: noop,
    onTagChange: noop,
    onHasConceptImagesChange: noop,
    onAnimatedOnlyChange: jest.fn(),
    onMinTriangleCountChange: jest.fn(),
    onMaxTriangleCountChange: jest.fn(),
    cardWidth: 200,
    onCardWidthChange: noop,
    modelCount: 0,
    selectedModelCount: 0,
    onUploadClick: noop,
    onRefreshClick: noop,
    onBulkActionsClick: noop,
    onSelectAllClick: noop,
    onDeselectAllClick: noop,
    visibleModelCount: 0,
    isCategoryPanelOpen: true,
    onCategoryPanelToggle: noop,
    showCategoryToggle: true,
    ...overrides,
  }
  render(withQueryClient(<ModelsFilters {...props} />))
  return props
}

describe('ModelsFilters - technical-metadata filters', () => {
  it('renders the Animated toggle and Triangles range inputs', () => {
    renderFilters()
    expect(screen.getByText('Animated')).toBeInTheDocument()
    expect(screen.getByText('Triangles')).toBeInTheDocument()
    expect(screen.getByTestId('min-triangle-filter')).toBeInTheDocument()
    expect(screen.getByTestId('max-triangle-filter')).toBeInTheDocument()
  })

  it('calls onAnimatedOnlyChange when the Animated switch is toggled', () => {
    const props = renderFilters()
    // PrimeReact InputSwitch fires onChange via its inner checkbox input.
    const input = screen
      .getByTestId('animated-only-filter')
      .querySelector('input') as HTMLInputElement
    fireEvent.click(input)
    expect(props.onAnimatedOnlyChange).toHaveBeenCalledWith(true)
  })

  it('counts an active triangle range toward the filter badge / clear button', () => {
    renderFilters({ minTriangleCount: 1000 })
    // The clear-all button only appears when filters are active.
    expect(
      screen.getByRole('button', { name: /clear all filters/i })
    ).toBeInTheDocument()
  })
})

describe('ModelsFilters - Categories toggle badge', () => {
  // Regression: the "1" badge tells the user a category filter is narrowing
  // the grid while the sidebar is hidden. A flipped condition
  // (`badge={active ? undefined : 1}`) or a badge rendered unconditionally
  // would light it up with no filter - or hide it when one is active.
  it('shows the "1" badge on the Categories toggle when a category filter is active', () => {
    renderFilters({ categoryFilterActive: true })
    const toggle = screen.getByRole('button', { name: 'Toggle categories' })
    const badge = toggle.querySelector('.list-toolbar-badge')
    expect(badge).not.toBeNull()
    expect(badge).toHaveTextContent('1')
  })

  it('omits the badge when no category filter is active', () => {
    renderFilters({ categoryFilterActive: false })
    const toggle = screen.getByRole('button', { name: 'Toggle categories' })
    expect(toggle.querySelector('.list-toolbar-badge')).toBeNull()
  })
})
