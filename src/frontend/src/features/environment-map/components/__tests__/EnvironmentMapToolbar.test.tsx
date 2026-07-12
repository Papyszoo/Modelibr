import { render, screen } from '@testing-library/react'

import { EnvironmentMapToolbar } from '@/features/environment-map/components/EnvironmentMapToolbar'

const noop = () => {}

function renderToolbar(overrides = {}) {
  const props = {
    isSearchOpen: false,
    onSearchToggle: noop,
    isFiltersOpen: true,
    onFiltersToggle: noop,
    searchQuery: '',
    onSearchChange: noop,
    previewSizeOptions: [],
    packOptions: [],
    projectOptions: [],
    selectedPreviewSizes: [],
    selectedPackIds: [],
    selectedProjectIds: [],
    onlyCustomThumbnail: false,
    onPreviewSizesChange: noop,
    onPackIdsChange: noop,
    onProjectIdsChange: noop,
    onOnlyCustomThumbnailChange: noop,
    cardWidth: 200,
    onCardWidthChange: noop,
    totalCount: 0,
    visibleCount: 0,
    selectedCount: 0,
    onUploadClick: noop,
    onRefreshClick: noop,
    onBulkActionsClick: noop,
    onSelectAllClick: noop,
    onDeselectAllClick: noop,
    isCategoryPanelOpen: true,
    onCategoryPanelToggle: noop,
    ...overrides,
  }
  render(<EnvironmentMapToolbar {...props} />)
  return props
}

describe('EnvironmentMapToolbar — Categories toggle badge', () => {
  // Regression: the "1" badge signals an active category filter while the
  // sidebar is collapsed. An inverted condition or an always-on badge would
  // mislead the user about whether the grid is being narrowed.
  it('shows the "1" badge on the Categories toggle when a category filter is active', () => {
    renderToolbar({ categoryFilterActive: true })
    const toggle = screen.getByRole('button', { name: 'Toggle categories' })
    const badge = toggle.querySelector('.list-toolbar-badge')
    expect(badge).not.toBeNull()
    expect(badge).toHaveTextContent('1')
  })

  it('omits the badge when no category filter is active', () => {
    renderToolbar({ categoryFilterActive: false })
    const toggle = screen.getByRole('button', { name: 'Toggle categories' })
    expect(toggle.querySelector('.list-toolbar-badge')).toBeNull()
  })
})
